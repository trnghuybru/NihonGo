import os

import click
from flask import jsonify, request
from flask_migrate import Migrate
from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError

from .models import AuthSession, Challenge, OAuthFlow, RateLimit, db, now
from .security import AuthError, limit


def init_auth(app):
    url = app.config.get("SQLALCHEMY_DATABASE_URI") or os.getenv("DATABASE_URL", "")
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if url and not app.testing and not url.startswith("postgresql+psycopg://"):
        raise RuntimeError("Authentication requires PostgreSQL.")
    app.config.setdefault("AUTH_SECRET_KEY", os.getenv("AUTH_SECRET_KEY", ""))
    app.config.setdefault("AUTH_CONFIGURED", bool(url and len(app.config["AUTH_SECRET_KEY"]) >= 32))
    app.config["SQLALCHEMY_DATABASE_URI"] = url or "postgresql+psycopg://localhost/nihongo"
    app.config.setdefault("SQLALCHEMY_ENGINE_OPTIONS", {"pool_pre_ping": True})
    for key in ("SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM", "TWILIO_ACCOUNT_SID",
                "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
                "FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET", "FACEBOOK_GRAPH_VERSION",
                "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY_PATH", "PUBLIC_BASE_URL"):
        app.config.setdefault(key, os.getenv(key, ""))
    app.config.setdefault("SMTP_PORT", int(os.getenv("SMTP_PORT", "587")))
    app.config.setdefault("SMTP_SSL", os.getenv("SMTP_SSL", "false").lower() == "true")
    app.config.setdefault("SMTP_STARTTLS", os.getenv("SMTP_STARTTLS", "true").lower() == "true")
    if os.getenv("APP_ENV") == "production":
        if not app.config["AUTH_CONFIGURED"]:
            raise RuntimeError("Production requires DATABASE_URL and AUTH_SECRET_KEY (32+ characters).")
        if app.config["SMTP_HOST"] and not (app.config["SMTP_SSL"] or app.config["SMTP_STARTTLS"]):
            raise RuntimeError("Production SMTP requires TLS.")
        if not app.config["PUBLIC_BASE_URL"].startswith("https://"):
            raise RuntimeError("Production requires an HTTPS PUBLIC_BASE_URL.")
    db.init_app(app)
    Migrate(app, db, directory=os.path.join(os.path.dirname(__file__), "../migrations"))
    from .routes import bp
    from . import oauth  # Registers provider routes on the same blueprint.
    app.register_blueprint(bp)

    @app.before_request
    def auth_guard():
        if not request.path.startswith(("/api/auth/", "/api/learning/")):
            return
        request.max_content_length = 16 * 1024
        if not app.config["AUTH_CONFIGURED"]:
            raise AuthError("Dịch vụ tài khoản chưa được cấu hình.", 503, "auth_unavailable")
        # Never trust arbitrary X-Forwarded-For. Configure trusted proxy hops at deployment.
        limit("auth-ip", request.remote_addr or "unknown", 120, 60)
        if request.method in {"POST", "PUT"} and request.path not in {"/api/auth/refresh", "/api/auth/logout"}:
            limit("auth-write-ip", request.remote_addr or "unknown", 30, 60)

    @app.after_request
    def auth_headers(response):
        if request.path.startswith(("/api/auth/", "/api/learning/")):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.errorhandler(AuthError)
    def auth_error(error):
        db.session.rollback()
        response = jsonify({"error": error.message, "code": error.code, **error.details})
        if error.status == 429:
            response.headers["Retry-After"] = str(error.details.get("retry_after", 60))
        return response, error.status

    @app.errorhandler(SQLAlchemyError)
    def database_error(error):
        db.session.rollback()
        if not request.path.startswith(("/api/auth/", "/api/learning/")):
            raise error
        app.logger.error("Account database request failed (%s)", type(error).__name__)
        return jsonify({"error": "Dịch vụ tài khoản tạm thời gián đoạn. Vui lòng thử lại sau.",
                        "code": "auth_unavailable"}), 503

    @app.cli.command("auth-cleanup")
    def cleanup():
        """Schedule daily. Remove expired secrets/PII and obsolete rate-limit buckets."""
        db.session.execute(delete(Challenge).where(Challenge.created_at < now() - 86400))
        db.session.execute(delete(OAuthFlow).where(OAuthFlow.expires_at < now()))
        db.session.execute(delete(AuthSession).where(AuthSession.expires_at < now()))
        db.session.execute(delete(RateLimit).where(RateLimit.expires_at < now()))
        db.session.commit()
        click.echo("Expired authentication records removed.")

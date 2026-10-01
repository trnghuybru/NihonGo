"""Confidential-client OAuth. Provider credentials and tokens never reach the app."""
import hashlib
import hmac
import re
import secrets
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode

import jwt
import requests
from flask import current_app, jsonify, redirect, request
from sqlalchemy import select

from .models import Identity, OAuthFlow, User, db, new_id, now
from .routes import bp, issue_session
from .security import AuthError, body, digest, string

APP_CALLBACK = "nihongoflow://auth/callback"


def enabled_providers():
    config = current_app.config
    if not config.get("PUBLIC_BASE_URL"):
        return []
    result = []
    for provider in ("google", "facebook", "apple"):
        keys = [f"{provider.upper()}_CLIENT_ID", f"{provider.upper()}_CLIENT_SECRET"]
        if provider == "apple":
            keys = ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY_PATH"]
        if provider == "facebook":
            keys.append("FACEBOOK_GRAPH_VERSION")
        if all(config.get(key) for key in keys):
            result.append(provider)
    return result


def provider_config(provider):
    if provider not in enabled_providers():
        raise AuthError("Nhà cung cấp đăng nhập chưa được cấu hình.", 503, "provider_unavailable")
    config = current_app.config
    common = {"client_id": config[f"{provider.upper()}_CLIENT_ID"],
              "redirect_uri": config["PUBLIC_BASE_URL"].rstrip("/") + f"/api/auth/oauth/{provider}/callback"}
    if provider == "google":
        return {**common, "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
                "token": "https://oauth2.googleapis.com/token", "scope": "openid email profile",
                "jwks": "https://www.googleapis.com/oauth2/v3/certs",
                "issuer": ["https://accounts.google.com", "accounts.google.com"]}
    if provider == "apple":
        return {**common, "authorize": "https://appleid.apple.com/auth/authorize",
                "token": "https://appleid.apple.com/auth/token", "scope": "email name",
                "jwks": "https://appleid.apple.com/auth/keys", "issuer": "https://appleid.apple.com"}
    version = config["FACEBOOK_GRAPH_VERSION"]
    if not re.fullmatch(r"v\d+\.\d+", version):
        raise AuthError("Cấu hình Facebook chưa hợp lệ.", 503, "provider_unavailable")
    return {**common, "authorize": f"https://www.facebook.com/{version}/dialog/oauth",
            "token": f"https://graph.facebook.com/{version}/oauth/access_token", "scope": "email,public_profile",
            "profile_url": f"https://graph.facebook.com/{version}/me"}


def client_secret(provider):
    config = current_app.config
    if provider != "apple":
        return config[f"{provider.upper()}_CLIENT_SECRET"]
    return jwt.encode({"iss": config["APPLE_TEAM_ID"], "iat": now(), "exp": now() + 300,
                       "aud": "https://appleid.apple.com", "sub": config["APPLE_CLIENT_ID"]},
                      Path(config["APPLE_PRIVATE_KEY_PATH"]).read_text(), algorithm="ES256",
                      headers={"kid": config["APPLE_KEY_ID"]})


@lru_cache(maxsize=2)
def jwks_client(url):
    return jwt.PyJWKClient(url, timeout=10)


def exchange_provider_code(provider, code, nonce):
    config = provider_config(provider)
    secret = client_secret(provider)
    response = requests.post(config["token"], data={"grant_type": "authorization_code", "code": code,
                             "client_id": config["client_id"], "client_secret": secret,
                             "redirect_uri": config["redirect_uri"]}, timeout=15)
    response.raise_for_status()
    token = response.json()
    if provider == "facebook":
        access = token["access_token"]
        proof = hmac.new(secret.encode(), access.encode(), hashlib.sha256).hexdigest()
        response = requests.get(config["profile_url"], headers={"Authorization": f"Bearer {access}"},
                                params={"fields": "id,name,email", "appsecret_proof": proof}, timeout=15)
        response.raise_for_status()
        profile = response.json()
        if not isinstance(profile.get("id"), str) or not profile["id"]:
            raise ValueError("Missing provider subject")
        return {"subject": profile["id"], "name": profile.get("name", ""), "email": profile.get("email", "")}
    encoded = token["id_token"]
    key = jwks_client(config["jwks"]).get_signing_key_from_jwt(encoded)
    claims = jwt.decode(encoded, key.key, algorithms=["RS256"], audience=config["client_id"],
                        issuer=config["issuer"], options={"require": ["exp", "iat", "sub", "iss", "aud", "nonce"]})
    if not hmac.compare_digest(claims["nonce"], nonce):
        raise ValueError("Invalid nonce")
    if claims.get("azp", config["client_id"]) != config["client_id"]:
        raise ValueError("Invalid authorized party")
    return {"subject": claims["sub"], "name": claims.get("name", ""), "email": claims.get("email", "")}


@bp.post("/oauth/<provider>/start")
def start(provider):
    config = provider_config(provider)
    state, secret, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    flow = OAuthFlow(id=new_id(), provider=provider, state_hash=digest(state), secret_hash=digest(secret),
                     nonce=nonce, expires_at=now() + 600)
    db.session.add(flow)
    db.session.commit()
    parameters = {"response_type": "code", "client_id": config["client_id"], "redirect_uri": config["redirect_uri"],
                  "scope": config["scope"], "state": state}
    if provider != "facebook":
        parameters["nonce"] = nonce
    if provider == "apple":
        parameters["response_mode"] = "form_post"
    return jsonify({"flow_id": flow.id, "flow_secret": secret,
                    "authorization_url": config["authorize"] + "?" + urlencode(parameters)})


@bp.route("/oauth/<provider>/callback", methods=["GET", "POST"])
def callback(provider):
    values = request.form if request.method == "POST" else request.args
    state = values.get("state", "")
    flow = db.session.scalar(select(OAuthFlow).where(OAuthFlow.state_hash == digest(state),
                                                    OAuthFlow.provider == provider).with_for_update())
    if not flow or flow.expires_at <= now() or flow.status != "pending":
        raise AuthError("Phiên đăng nhập mạng xã hội không hợp lệ hoặc đã hết hạn.")
    flow.status = "processing"
    db.session.commit()  # Claim the state before any external request; replay cannot exchange again.
    try:
        if values.get("error") or not values.get("code"):
            raise ValueError("Authorization denied")
        flow.profile = exchange_provider_code(provider, values["code"], flow.nonce)
        flow.status = "ready"
    except (requests.RequestException, jwt.PyJWTError, ValueError, KeyError, TypeError, OSError):
        flow.status = "failed"
        current_app.logger.warning("Social authorization failed: provider=%s", provider)
    db.session.commit()
    # No credential, provider token or authorization code in the mobile deep link.
    return redirect(APP_CALLBACK)


@bp.post("/oauth/exchange")
def exchange():
    data = body()
    flow = db.session.scalar(select(OAuthFlow).where(
        OAuthFlow.id == string(data, "flow_id", 36)).with_for_update())
    if (not flow or flow.expires_at <= now() or
            not hmac.compare_digest(flow.secret_hash, digest(string(data, "flow_secret", 128)))):
        raise AuthError("Phiên đăng nhập mạng xã hội không hợp lệ.", 401, "invalid_oauth")
    if flow.status in {"pending", "processing"}:
        return jsonify({"status": "pending"}), 202
    if flow.status != "ready":
        raise AuthError("Đăng nhập mạng xã hội chưa hoàn tất. Vui lòng thử lại.", 400, "invalid_oauth")
    identity = db.session.scalar(select(Identity).where(Identity.provider == flow.provider,
                                                        Identity.subject == flow.profile["subject"]))
    if identity:
        user = db.session.scalar(select(User).where(User.id == identity.user_id).with_for_update())
        if not user or not user.active:
            raise AuthError("Tài khoản không khả dụng.", 403, "account_unavailable")
        flow.status, flow.profile = "consumed", None
        result = issue_session(user)
    else:
        token = secrets.token_urlsafe(32)
        flow.status, flow.profile_token_hash = "profile", digest(token)
        flow.expires_at = now() + 1800
        result = {"status": "profile_required", "social_token": token,
                  "name": flow.profile.get("name", ""), "email": flow.profile.get("email", "")}
    db.session.commit()
    return jsonify(result)

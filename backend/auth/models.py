"""Authentication persistence. Epoch timestamps avoid timezone ambiguity."""
import time
import uuid

from sqlalchemy import Index, text
from extensions import db


def now():
    return int(time.time())


def new_id():
    return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(254), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    password_hash = db.Column(db.Text)
    email_verified = db.Column(db.Boolean, nullable=False, default=False)
    phone_verified = db.Column(db.Boolean, nullable=False, default=False)
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    __table_args__ = (
        # Unverified contact details must never reserve another person's identity.
        Index("uq_users_verified_email", "email", unique=True,
              postgresql_where=text("email_verified"), sqlite_where=text("email_verified")),
        Index("uq_users_verified_phone", "phone", unique=True,
              postgresql_where=text("phone_verified"), sqlite_where=text("phone_verified")),
    )

    def public(self):
        return {key: getattr(self, key) for key in
                ("id", "name", "email", "phone", "email_verified", "phone_verified")}


class Identity(db.Model):
    __tablename__ = "auth_identities"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = db.Column(db.String(16), nullable=False)
    subject = db.Column(db.String(255), nullable=False)
    __table_args__ = (db.UniqueConstraint("provider", "subject", name="uq_identity_subject"),)


class Challenge(db.Model):
    __tablename__ = "auth_challenges"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    purpose = db.Column(db.String(16), nullable=False)
    channel = db.Column(db.String(8), nullable=False)
    destination = db.Column(db.String(254), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"))
    payload = db.Column(db.JSON, nullable=False, default=dict)
    code_hash = db.Column(db.String(64), nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    sends = db.Column(db.Integer, nullable=False, default=1)
    expires_at = db.Column(db.BigInteger, nullable=False)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    sent_at = db.Column(db.BigInteger, nullable=False, default=now)
    consumed_at = db.Column(db.BigInteger)


class AuthSession(db.Model):
    __tablename__ = "auth_sessions"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    access_hash = db.Column(db.String(64), nullable=False, unique=True)
    access_expires_at = db.Column(db.BigInteger, nullable=False)
    expires_at = db.Column(db.BigInteger, nullable=False)
    revoked_at = db.Column(db.BigInteger)
    created_at = db.Column(db.BigInteger, nullable=False, default=now)


class RefreshToken(db.Model):
    __tablename__ = "auth_refresh_tokens"
    token_hash = db.Column(db.String(64), primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey("auth_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    used_at = db.Column(db.BigInteger)


class OAuthFlow(db.Model):
    __tablename__ = "auth_oauth_flows"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    provider = db.Column(db.String(16), nullable=False)
    state_hash = db.Column(db.String(64), unique=True, nullable=False)
    secret_hash = db.Column(db.String(64), nullable=False)
    nonce = db.Column(db.String(128), nullable=False)
    status = db.Column(db.String(16), nullable=False, default="pending")
    profile = db.Column(db.JSON)
    profile_token_hash = db.Column(db.String(64), unique=True)
    expires_at = db.Column(db.BigInteger, nullable=False)


class RateLimit(db.Model):
    __tablename__ = "auth_rate_limits"
    key = db.Column(db.String(64), primary_key=True)
    count = db.Column(db.Integer, nullable=False)
    expires_at = db.Column(db.BigInteger, nullable=False, index=True)

import hashlib
import hmac
import secrets
from functools import wraps

import phonenumbers
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from email_validator import validate_email, EmailNotValidError
from flask import current_app, g, request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from api_errors import ApiError as AuthError

from .models import AuthSession, RateLimit, User, db, now

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(32))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def otp_digest(challenge_id, code):
    return hmac.new(current_app.config["AUTH_SECRET_KEY"].encode(),
                    f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise AuthError("Yêu cầu phải là JSON object.")
    return data


def string(data, key, maximum=256):
    value = data.get(key, "")
    if not isinstance(value, str) or len(value) > maximum:
        raise AuthError(f"Thông tin {key} không hợp lệ.")
    return value


def email(value):
    try:
        return validate_email(value.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise AuthError("Email không hợp lệ.") from None


def phone(value):
    try:
        number = phonenumbers.parse(value.strip(), "VN")
        if not phonenumbers.is_valid_number(number):
            raise ValueError()
        return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
    except (phonenumbers.NumberParseException, ValueError):
        raise AuthError("Số điện thoại không hợp lệ. Dùng mã quốc gia cho số ngoài Việt Nam.") from None


def identifier(value):
    return ("email", email(value)) if "@" in value else ("sms", phone(value))


def validate_password(value):
    if not 15 <= len(value) <= 128:
        raise AuthError("Mật khẩu cần từ 15 đến 128 ký tự.")
    if value.lower() in {"123456789012345", "passwordpassword", "1234567890123456", "qwertyuiopasdfgh"}:
        raise AuthError("Mật khẩu quá phổ biến. Hãy dùng một cụm từ dài, khó đoán.")
    return value


def check_password(hashed, value):
    try:
        return password_hasher.verify(hashed or DUMMY_HASH, value)
    except (VerificationError, InvalidHashError):
        return False


def limit(bucket, value, maximum, window):
    """Atomic, shared across workers. Commit independently of failed authentication."""
    timestamp = now()
    key = digest(f"{bucket}:{value}:{timestamp // window}")
    table = RateLimit.__table__
    insert = pg_insert if db.engine.dialect.name == "postgresql" else sqlite_insert
    statement = insert(table).values(key=key, count=1, expires_at=timestamp + window)
    statement = statement.on_conflict_do_update(index_elements=[table.c.key],
                                               set_={"count": table.c.count + 1}).returning(table.c.count)
    with db.engine.begin() as connection:
        count = connection.execute(statement).scalar_one()
    if count > maximum:
        raise AuthError("Thao tác quá nhiều lần. Vui lòng thử lại sau.", 429, "rate_limited", retry_after=window)


def verified_user(channel, destination):
    column, verified = (User.email, User.email_verified) if channel == "email" else (User.phone, User.phone_verified)
    return db.session.scalar(select(User).where(column == destination, verified.is_(True)))


def require_auth(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        authorization = request.headers.get("Authorization", "")
        token = authorization[7:] if authorization.startswith("Bearer ") else ""
        session = db.session.scalar(select(AuthSession).where(AuthSession.access_hash == digest(token))) if token else None
        if not session or session.revoked_at or min(session.access_expires_at, session.expires_at) <= now():
            raise AuthError("Phiên đăng nhập đã hết hạn.", 401, "unauthorized")
        user = db.session.get(User, session.user_id)
        if not user or not user.active:
            raise AuthError("Phiên đăng nhập không hợp lệ.", 401, "unauthorized")
        g.auth_session, g.user = session, user
        return function(*args, **kwargs)
    return wrapped

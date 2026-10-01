import hmac
import secrets

from flask import Blueprint, g, jsonify, request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .delivery import available_channels, send_code
from .models import AuthSession, Challenge, Identity, OAuthFlow, RefreshToken, User, db, new_id, now
from .security import (AuthError, body, check_password, digest, email, identifier, limit,
                       otp_digest, password_hasher, phone, require_auth, string,
                       validate_password, verified_user)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def conflict():
    raise AuthError("Không thể đăng ký với thông tin này. Nếu đã có tài khoản, hãy đăng nhập hoặc khôi phục mật khẩu.",
                    409, "account_conflict")


def issue_session(user):
    access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    session = AuthSession(id=new_id(), user_id=user.id, access_hash=digest(access),
                          access_expires_at=now() + 900, expires_at=now() + 30 * 86400)
    db.session.add(session)
    db.session.add(RefreshToken(token_hash=digest(refresh), session_id=session.id))
    return {"user": user.public(), "access_token": access, "refresh_token": refresh,
            "token_type": "Bearer", "expires_in": 900}


def challenge_response(challenge):
    destination = challenge.destination
    if challenge.channel == "email":
        local, domain = destination.split("@")
        masked = local[:1] + "***@" + domain
    else:
        masked = "***" + destination[-4:]
    return {"challenge_id": challenge.id, "channel": challenge.channel,
            "destination": masked, "expires_in": max(0, challenge.expires_at - now()),
            "resend_after": max(0, challenge.sent_at + 60 - now())}


def create_challenge(purpose, channel, destination, payload=None, user_id=None, deliver=True):
    code, challenge_id = f"{secrets.randbelow(1000000):06d}", new_id()
    challenge = Challenge(id=challenge_id, purpose=purpose, channel=channel,
                          destination=destination, user_id=user_id, payload=payload or {},
                          code_hash=otp_digest(challenge_id, code), expires_at=now() + 600,
                          sent_at=now(), created_at=now())
    db.session.add(challenge)
    db.session.flush()
    if deliver:
        send_code(channel, destination, code)
    return challenge


def locked_challenge(data, purpose):
    challenge = db.session.scalar(select(Challenge).where(
        Challenge.id == string(data, "challenge_id", 36)).with_for_update())
    if (not challenge or challenge.purpose != purpose or challenge.consumed_at or
            challenge.expires_at <= now() or challenge.attempts >= 5):
        raise AuthError("Mã không hợp lệ, đã hết hạn hoặc đã nhập sai quá nhiều lần.", 400, "invalid_code")
    return challenge


def validate_code(challenge, data):
    code = string(data, "code", 6)
    challenge.attempts += 1
    if not hmac.compare_digest(challenge.code_hash, otp_digest(challenge.id, code)):
        db.session.commit()  # Failed attempts must survive the error response.
        raise AuthError("Mã xác thực không đúng.", 400, "invalid_code")


def lock_user(user_id):
    return db.session.scalar(select(User).where(User.id == user_id).with_for_update()
                             .execution_options(populate_existing=True))


@bp.get("/config")
def configuration():
    from .oauth import enabled_providers
    return jsonify({"channels": available_channels(), "providers": enabled_providers(),
                    "password_min_length": 15})


@bp.post("/register")
def register():
    data = body()
    name = string(data, "name", 100).strip()
    if len(name) < 2 or any(ord(char) < 32 for char in name):
        raise AuthError("Tên cần từ 2 đến 100 ký tự.")
    normalized_email, normalized_phone = email(string(data, "email")), phone(string(data, "phone", 32))
    limit("register-email", normalized_email, 5, 3600)
    limit("register-phone", normalized_phone, 5, 3600)
    payload = {"name": name, "email": normalized_email, "phone": normalized_phone}
    social_token = string(data, "social_token", 128)
    if social_token:
        flow = db.session.scalar(select(OAuthFlow).where(
            OAuthFlow.profile_token_hash == digest(social_token)).with_for_update())
        if not flow or flow.status != "profile" or flow.expires_at <= now():
            raise AuthError("Phiên đăng ký mạng xã hội đã hết hạn. Vui lòng đăng nhập lại.")
        payload.update({"provider": flow.provider, "subject": flow.profile["subject"]})
        flow.status = "consumed"
    else:
        payload["password_hash"] = password_hasher.hash(validate_password(string(data, "password", 128)))
    # No auto-linking by email, and no changes to existing accounts before ownership is proven.
    if verified_user("email", normalized_email) or verified_user("sms", normalized_phone):
        conflict()
    challenge = create_challenge("register", "email", normalized_email, payload)
    db.session.commit()
    return jsonify(challenge_response(challenge)), 202


@bp.post("/verify")
def verify():
    data = body()
    challenge = locked_challenge(data, "register")
    validate_code(challenge, data)
    payload = challenge.payload
    if verified_user("email", payload["email"]) or verified_user("sms", payload["phone"]):
        conflict()
    user = User(id=new_id(), name=payload["name"], email=payload["email"], phone=payload["phone"],
                password_hash=payload.get("password_hash"), email_verified=challenge.channel == "email",
                phone_verified=challenge.channel == "sms")
    db.session.add(user)
    db.session.flush()
    if payload.get("provider"):
        db.session.add(Identity(user_id=user.id, provider=payload["provider"], subject=payload["subject"]))
    challenge.consumed_at, challenge.payload = now(), {}
    result = issue_session(user)
    db.session.commit()
    return jsonify(result), 201


@bp.post("/resend")
def resend():
    data = body()
    challenge = db.session.scalar(select(Challenge).where(
        Challenge.id == string(data, "challenge_id", 36)).with_for_update())
    if (not challenge or challenge.consumed_at or challenge.attempts >= 5 or
            challenge.created_at + 1800 <= now() or challenge.sends >= 5):
        raise AuthError("Yêu cầu đã hết hạn. Vui lòng bắt đầu lại.")
    if challenge.sent_at + 60 > now():
        raise AuthError("Vui lòng đợi trước khi gửi lại mã.", 429, "rate_limited",
                        retry_after=challenge.sent_at + 60 - now())
    code = f"{secrets.randbelow(1000000):06d}"
    challenge.code_hash = otp_digest(challenge.id, code)
    challenge.expires_at = min(now() + 600, challenge.created_at + 1800)
    challenge.sent_at, challenge.sends = now(), challenge.sends + 1
    if challenge.purpose != "reset" or challenge.user_id:
        send_code(challenge.channel, challenge.destination, code)
    db.session.commit()
    return jsonify(challenge_response(challenge))


@bp.post("/login")
def login():
    data = body()
    channel, destination = identifier(string(data, "identifier"))
    limit("login-identifier", destination, 10, 900)
    user = verified_user(channel, destination)
    # Lock the user to serialize login against a concurrent password reset.
    if user:
        user = lock_user(user.id)
    valid = check_password(user.password_hash if user else None, string(data, "password", 128))
    if not valid or not user or not user.password_hash or not user.active:
        raise AuthError("Thông tin đăng nhập không đúng hoặc chưa được xác thực.", 401, "invalid_credentials")
    if password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = password_hasher.hash(data["password"])
    result = issue_session(user)
    db.session.commit()
    return jsonify(result)


@bp.post("/refresh")
def refresh():
    data = body()
    token = db.session.get(RefreshToken, digest(string(data, "refresh_token", 128)))
    if not token:
        raise AuthError("Phiên đăng nhập đã hết hạn.", 401, "unauthorized")
    session = db.session.scalar(select(AuthSession).where(
        AuthSession.id == token.session_id).with_for_update())
    db.session.refresh(token)
    if token.used_at:
        session.revoked_at = now()
        db.session.commit()
        raise AuthError("Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.", 401, "unauthorized")
    user = db.session.get(User, session.user_id)
    if session.revoked_at or session.expires_at <= now() or not user or not user.active:
        raise AuthError("Phiên đăng nhập đã hết hạn.", 401, "unauthorized")
    access, refresh_token = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    token.used_at = now()
    session.access_hash, session.access_expires_at = digest(access), min(now() + 900, session.expires_at)
    db.session.add(RefreshToken(token_hash=digest(refresh_token), session_id=session.id))
    db.session.commit()
    return jsonify({"user": user.public(), "access_token": access, "refresh_token": refresh_token,
                    "token_type": "Bearer", "expires_in": session.access_expires_at - now()})


@bp.post("/logout")
def logout():
    # Refresh token works even when the short-lived access token has expired.
    token = db.session.get(RefreshToken, digest(string(body(), "refresh_token", 128)))
    if token:
        db.session.execute(update(AuthSession).where(AuthSession.id == token.session_id).values(revoked_at=now()))
        db.session.commit()
    return "", 204


@bp.get("/me")
@require_auth
def me():
    return jsonify({"user": g.user.public()})


@bp.post("/password/forgot")
def forgot_password():
    channel, destination = identifier(string(body(), "identifier"))
    limit("reset-destination", destination, 5, 3600)
    user = verified_user(channel, destination)
    challenge = create_challenge("reset", channel, destination,
                                 user_id=user.id if user and user.active else None,
                                 deliver=bool(user and user.active))
    db.session.commit()
    # Identical response shape for existing and unknown accounts.
    return jsonify(challenge_response(challenge)), 202


@bp.post("/password/reset")
def reset_password():
    data = body()
    hashed = password_hasher.hash(validate_password(string(data, "password", 128)))
    challenge = locked_challenge(data, "reset")
    validate_code(challenge, data)
    user = lock_user(challenge.user_id) if challenge.user_id else None
    if not user or not user.active:
        raise AuthError("Mã không hợp lệ hoặc đã hết hạn.", 400, "invalid_code")
    user.password_hash = hashed
    db.session.execute(update(AuthSession).where(AuthSession.user_id == user.id).values(revoked_at=now()))
    db.session.execute(update(Challenge).where(Challenge.user_id == user.id,
                                              Challenge.purpose == "reset").values(consumed_at=now()))
    db.session.commit()
    return jsonify({"message": "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại."})


@bp.post("/contact/request")
@require_auth
def request_contact():
    channel = string(body(), "channel", 8)
    if channel not in {"email", "sms"}:
        raise AuthError("Kênh xác thực không hợp lệ.")
    destination = g.user.email if channel == "email" else g.user.phone
    limit("contact-user", g.user.id, 5, 3600)
    challenge = create_challenge("contact", channel, destination, user_id=g.user.id)
    db.session.commit()
    return jsonify(challenge_response(challenge)), 202


@bp.post("/contact/verify")
@require_auth
def verify_contact():
    data = body()
    challenge = locked_challenge(data, "contact")
    if challenge.user_id != g.user.id:
        raise AuthError("Mã xác thực không hợp lệ.")
    validate_code(challenge, data)
    existing = verified_user(challenge.channel, challenge.destination)
    if existing and existing.id != g.user.id:
        conflict()
    if challenge.channel == "email":
        g.user.email_verified = True
    else:
        g.user.phone_verified = True
    challenge.consumed_at = now()
    db.session.commit()
    return jsonify({"user": g.user.public()})


@bp.errorhandler(IntegrityError)
def integrity_error(_error):
    db.session.rollback()
    return jsonify({"error": "Thông tin này đã thuộc về một tài khoản khác. Vui lòng đăng nhập hoặc khôi phục tài khoản.",
                    "code": "account_conflict"}), 409

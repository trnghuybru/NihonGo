"""Beta admission: invited accounts or public registration up to a shared cap."""
import os

from sqlalchemy import func, select, text

from extensions import db
from .models import User
from .security import AuthError


def enabled():
    return os.getenv("BETA_MODE", "").strip().lower() in {"1", "true", "yes"}


def admission_settings():
    mode = os.getenv("BETA_REGISTRATION_MODE", "invite").strip().lower()
    if mode not in {"invite", "open"}:
        raise ValueError("BETA_REGISTRATION_MODE must be invite or open")
    try:
        maximum = int(os.getenv("BETA_ACCOUNT_LIMIT", "200" if mode == "open" else "50"))
    except ValueError:
        raise ValueError("BETA_ACCOUNT_LIMIT must be a positive integer") from None
    if maximum < 1:
        raise ValueError("BETA_ACCOUNT_LIMIT must be a positive integer")
    return mode, maximum


def check_invite(email, *, creating=False, registering=False):
    if not enabled():
        return
    try:
        mode, maximum = admission_settings()
    except ValueError:
        raise AuthError("Cấu hình đăng ký beta chưa hợp lệ.", 503, "beta_unavailable") from None
    if mode == "invite":
        allowed = {item.strip().lower() for item in os.getenv("BETA_INVITE_EMAILS", "").split(",") if item.strip()}
        if not allowed:
            raise AuthError("Chưa cấu hình danh sách mời beta.", 503, "beta_unavailable")
        if email.strip().lower() not in allowed:
            raise AuthError("Tài khoản này chưa được mời tham gia beta.", 403, "beta_invite_required")
    # Full admission closes new registrations, never existing users' sessions.
    if creating or registering:
        # Serialize final verification across app instances; OTP requests reserve no seat.
        if creating and db.session.get_bind().dialect.name == "postgresql":
            db.session.execute(text("SELECT pg_advisory_xact_lock(782651009)"))
        seats = db.session.scalar(select(func.count()).select_from(User))
        if seats >= maximum:
            raise AuthError("Đợt dùng thử đã đủ số người tham gia.", 403, "beta_full")

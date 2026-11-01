"""Invite-only admission for a small production beta."""
import os

from sqlalchemy import func, select, text

from extensions import db
from .models import User
from .security import AuthError


def enabled():
    return os.getenv("BETA_MODE", "").strip().lower() in {"1", "true", "yes"}


def check_invite(email, *, creating=False):
    if not enabled():
        return
    allowed = {item.strip().lower() for item in os.getenv("BETA_INVITE_EMAILS", "").split(",") if item.strip()}
    if not allowed:
        raise AuthError("Chưa cấu hình danh sách mời beta.", 503, "beta_unavailable")
    if email.lower() not in allowed:
        raise AuthError("Tài khoản này chưa được mời tham gia beta.", 403, "beta_invite_required")
    if creating:
        # The transaction lock serializes the final seat across app instances.
        if db.session.get_bind().dialect.name == "postgresql":
            db.session.execute(text("SELECT pg_advisory_xact_lock(782651009)"))
        seats = db.session.scalar(select(func.count()).select_from(User).where(User.email.in_(allowed)))
        if seats >= 10:
            raise AuthError("Đợt dùng thử đã đủ số người tham gia.", 403, "beta_full")

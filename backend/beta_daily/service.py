"""Server-enforced daily quotas, reset at midnight in Vietnam."""
import os
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text

from api_errors import ApiError
from auth.models import User, now
from extensions import db
from .models import DailyLiveSession, DailyQuota

ZONE = ZoneInfo("Asia/Ho_Chi_Minh")
VIDEO_LIMIT = 3
LIVE_LIMIT = 2
LIVE_SECONDS = 240
LIVE_CONCURRENT = 2


def daily_mode():
    return os.getenv("BETA_QUOTA_MODE", "usd").lower() == "daily"


def clock():
    return datetime.now(ZONE)


def window():
    current = clock()
    reset = datetime.combine(current.date() + timedelta(days=1), time.min, tzinfo=ZONE)
    return current.date(), int(reset.timestamp())


def status(user_id):
    day, reset = window()
    row = db.session.get(DailyQuota, (user_id, day))
    return {"day": day.isoformat(), "timezone": "Asia/Ho_Chi_Minh",
            "reset_at": reset, "video_limit": VIDEO_LIMIT,
            "video_remaining": max(0, VIDEO_LIMIT - len(_video_ids(row))),
            "live_limit": LIVE_LIMIT,
            "live_remaining": max(0, LIVE_LIMIT - (row.live_count if row else 0)),
            "live_seconds_per_session": LIVE_SECONDS}


def _locked_row(user_id, day):
    if db.session.scalar(select(User.id).where(User.id == user_id).with_for_update()) is None:
        raise ApiError("Tài khoản không khả dụng.", 403, "beta_quota_unavailable")
    row = db.session.get(DailyQuota, (user_id, day))
    if row is None:
        row = DailyQuota(user_id=user_id, day=day, live_count=0)
        db.session.add(row)
        db.session.flush()
    return row


def _video_ids(row):
    if row is None:
        return set()
    return set(row.video_ids or []) | ({row.video_id} if row.video_id else set())


def reserve_video(user_id, video_id):
    """Reserve up to three distinct videos today; retries reuse their slot."""
    day, reset = window()
    row = _locked_row(user_id, day)
    videos = _video_ids(row)
    if video_id in videos:
        return
    if len(videos) >= VIDEO_LIMIT:
        raise ApiError("Hôm nay bạn đã dùng đủ 3 lượt video. Lượt mới sẽ có lúc 00:00 ngày mai.",
                       429, "daily_video_limit", retry_after=max(1, reset - now()))
    row.video_ids = sorted(videos | {video_id})
    if not row.video_id:
        row.video_id = video_id


def reserve_live(user_id):
    """Reserve one of two starts; failed handshakes are released in finish_live."""
    day, reset = window()
    row = _locked_row(user_id, day)
    expired = db.session.scalars(select(DailyLiveSession).where(
        DailyLiveSession.user_id == user_id, DailyLiveSession.day == day,
        DailyLiveSession.status == "pending", DailyLiveSession.expires_at <= now())).all()
    for session in expired:
        session.status = "failed"
        row.live_count = max(0, row.live_count - 1)
    if row.live_count >= LIVE_LIMIT:
        raise ApiError("Hôm nay bạn đã dùng đủ 2 phiên AI Live.", 429,
                       "daily_live_limit", retry_after=max(1, reset - now()))
    if db.session.get_bind().dialect.name == "postgresql":
        db.session.execute(text("SELECT pg_advisory_xact_lock(782651010)"))
    active = db.session.scalars(select(DailyLiveSession).where(
        DailyLiveSession.status.in_(("pending", "active")),
        DailyLiveSession.expires_at > now())).all()
    if any(item.user_id == user_id for item in active):
        raise ApiError("Bạn đang có một phiên Nói Live hoạt động.", 409, "beta_live_active")
    if len(active) >= LIVE_CONCURRENT:
        raise ApiError("Các phiên Nói Live đang bận. Vui lòng thử lại sau.",
                       429, "beta_live_busy", retry_after=30)
    row.live_count += 1
    session = DailyLiveSession(user_id=user_id, day=day,
                               status="pending", expires_at=now() + LIVE_SECONDS + 45)
    db.session.add(session)
    db.session.commit()
    return session.id


def mark_live_started(session_id):
    session = db.session.get(DailyLiveSession, session_id)
    if session and session.status == "pending":
        session.status = "active"
        db.session.commit()


def finish_live(session_id, *, started):
    session = db.session.get(DailyLiveSession, session_id)
    if session is None or session.status in ("ended", "failed"):
        return
    row = _locked_row(session.user_id, session.day)
    db.session.refresh(session)
    if session.status in ("ended", "failed"):
        db.session.rollback()
        return
    if session.status == "pending" and not started:
        row.live_count = max(0, row.live_count - 1)
        session.status = "failed"
    else:
        session.status = "ended"
    session.expires_at = now()
    db.session.commit()

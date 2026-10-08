"""Owned conversation history and immutable, public session snapshots."""
from sqlalchemy import func, select

from api_errors import ApiError
from extensions import db
from .conversation import as_utc, owned_session
from .models import ConversationMessage, ConversationSession


def session_detail(user_id, session_id):
    session = owned_session(user_id, session_id)
    snapshot = session.scenario_snapshot
    role = snapshot.get("role", {})
    # Never return the private AI instructions stored in the snapshot.
    scenario = {key: snapshot.get(key) for key in (
        "id", "title", "description", "language_code", "difficulty_level",
        "estimated_duration_minutes", "category", "context", "learning_objectives")}
    scenario["role"] = {key: role.get(key) for key in (
        "id", "name", "description", "opening_message")}
    return {
        "session": {"id": session.id, "scenario_id": session.scenario_id,
                    "scenario_role_id": session.scenario_role_id, "status": session.status,
                    "current_input_mode": session.current_input_mode,
                    "audio_storage_enabled": session.audio_storage_enabled,
                    "started_at": as_utc(session.started_at).isoformat(),
                    "accumulated_active_ms": session.accumulated_active_ms},
        "scenario": scenario, "opening_message": None,
    }


def list_sessions(user_id, args):
    if set(args) - {"page", "page_size"} or any(len(args.getlist(key)) != 1 for key in args):
        raise ApiError("Tham số lịch sử không hợp lệ.")

    def number(key, default, maximum):
        raw = args.get(key, str(default))
        if not raw.isascii() or not raw.isdecimal() or len(raw) > 7:
            raise ApiError("Tham số lịch sử phải là số nguyên dương.")
        value = int(raw)
        if not 1 <= value <= maximum:
            raise ApiError("Tham số lịch sử ngoài phạm vi cho phép.")
        return value

    page, size = number("page", 1, 1000000), number("page_size", 20, 100)
    latest_id = (select(ConversationMessage.id)
                 .where(ConversationMessage.session_id == ConversationSession.id)
                 .order_by(ConversationMessage.sequence_number.desc()).limit(1)
                 .correlate(ConversationSession).scalar_subquery())
    activity = func.coalesce(ConversationMessage.occurred_at, ConversationSession.started_at)
    rows = db.session.execute(
        select(ConversationSession, ConversationMessage)
        .outerjoin(ConversationMessage, ConversationMessage.id == latest_id)
        .where(ConversationSession.user_id == user_id)
        .order_by(activity.desc(), ConversationSession.id.desc())
        .offset((page - 1) * size).limit(size)).all()
    total = db.session.scalar(select(func.count()).select_from(ConversationSession)
                              .where(ConversationSession.user_id == user_id))
    items = []
    for session, message in rows:
        snapshot = session.scenario_snapshot
        items.append({"id": session.id, "title": snapshot.get("title", "Hội thoại"),
                      "role_name": snapshot.get("role", {}).get("name", "AI"),
                      "status": session.status,
                      "last_activity_at": as_utc(message.occurred_at if message else session.started_at).isoformat(),
                      "last_message": message.content[:160] if message else None})
    return {"items": items, "pagination": {"page": page, "page_size": size,
            "total": total, "total_pages": (total + size - 1) // size}}

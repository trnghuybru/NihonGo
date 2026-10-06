"""Owned transcripts, idempotent turns, and short transactions around AI calls."""
from dataclasses import dataclass
from datetime import timezone

from sqlalchemy import select, update

from api_errors import ApiError
from extensions import db
from .ai import generate_reply
from .models import ConversationMessage, ConversationSession, utc_now
from .service import parse_id

PENDING_TIMEOUT_SECONDS = 120


def as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def owned_session(user_id, session_id, lock=False):
    try:
        identifier = parse_id(session_id)
    except ApiError:
        raise ApiError("Không tìm thấy buổi hội thoại.", 404, "session_not_found") from None
    statement = select(ConversationSession).where(
        ConversationSession.id == identifier, ConversationSession.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    session = db.session.scalar(statement)
    if session is None:
        raise ApiError("Không tìm thấy buổi hội thoại.", 404, "session_not_found")
    return session


def message_public(message):
    return {"id": message.id, "sequence_number": message.sequence_number,
            "speaker": message.speaker, "input_mode": message.input_mode,
            "content": message.content, "status": message.status,
            "occurred_at": as_utc(message.occurred_at).isoformat()}


def transcript(user_id, session_id, args):
    if set(args) - {"after_sequence", "limit"} or any(len(args.getlist(key)) != 1 for key in args):
        raise ApiError("Tham số transcript không hợp lệ.")
    def number(key, default, maximum, minimum):
        value = args.get(key, str(default))
        if not value.isascii() or not value.isdecimal() or len(value) > 18:
            raise ApiError("Tham số transcript phải là số nguyên.")
        result = int(value)
        if not minimum <= result <= maximum:
            raise ApiError("Tham số transcript ngoài phạm vi cho phép.")
        return result
    after = number("after_sequence", 0, 9223372036854775806, 0)
    limit = number("limit", 100, 100, 1)
    session = owned_session(user_id, session_id)
    rows = db.session.scalars(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id, ConversationMessage.sequence_number > after
    ).order_by(ConversationMessage.sequence_number).limit(limit + 1)).all()
    return {"items": [message_public(row) for row in rows[:limit]],
            "session": {"id": session.id, "status": session.status,
                        "current_input_mode": session.current_input_mode},
            "has_more": len(rows) > limit,
            "next_sequence": rows[min(len(rows), limit) - 1].sequence_number if rows else after}


@dataclass(frozen=True)
class TurnInput:
    request_id: str
    content: str
    input_mode: str

    @classmethod
    def parse(cls, data):
        if not isinstance(data, dict) or set(data) != {"request_id", "content", "input_mode"}:
            raise ApiError("Gửi request_id, content và input_mode để hội thoại.")
        content, mode = data["content"], data["input_mode"]
        if not isinstance(content, str) or not content.strip() or len(content) > 2000:
            raise ApiError("Nội dung hội thoại phải từ 1 đến 2000 ký tự.")
        if not isinstance(mode, str) or mode not in {"text", "voice"}:
            raise ApiError("Chế độ nhập phải là text hoặc voice.")
        return cls(parse_id(data["request_id"], "request_id"), content.strip(), mode)


def reply_public(user_message, assistant):
    return {"user_message": message_public(user_message), "assistant_message": message_public(assistant)}


def send_turn(user_id, session_id, values):
    session = owned_session(user_id, session_id, lock=True)
    if session.status != "active":
        raise ApiError("Buổi hội thoại hiện không hoạt động.", 409, "session_inactive")
    user_message = db.session.get(ConversationMessage, values.request_id)
    latest = db.session.scalar(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id).order_by(ConversationMessage.sequence_number.desc()).limit(1))
    if user_message is not None:
        if (user_message.session_id != session.id or user_message.speaker != "user" or
                user_message.content != values.content or user_message.input_mode != values.input_mode):
            raise ApiError("Mã yêu cầu đã được sử dụng cho nội dung khác.", 409, "request_conflict")
        assistant = db.session.scalar(select(ConversationMessage).where(
            ConversationMessage.session_id == session.id,
            ConversationMessage.sequence_number == user_message.sequence_number + 1,
            ConversationMessage.speaker == "assistant"))
        if assistant is None:
            raise ApiError("Lượt hội thoại chưa sẵn sàng. Vui lòng tải lại.", 409, "turn_conflict")
        if assistant.status == "completed":
            result = reply_public(user_message, assistant)
            db.session.commit()
            return result
        age = (utc_now() - as_utc(assistant.updated_at)).total_seconds()
        if assistant.status == "pending" and age < PENDING_TIMEOUT_SECONDS:
            raise ApiError("AI đang xử lý lượt hội thoại này.", 409, "turn_pending")
        if latest.id != assistant.id:
            raise ApiError("Chỉ có thể thử lại lượt hội thoại cuối.", 409, "turn_conflict")
    else:
        if latest and latest.speaker == "assistant" and latest.status != "completed":
            raise ApiError("Vui lòng thử lại lượt hội thoại chưa hoàn tất.", 409, "turn_unresolved")
        sequence = (latest.sequence_number if latest else 0) + 1
        user_message = ConversationMessage(id=values.request_id, session_id=session.id,
                                           sequence_number=sequence, speaker="user", input_mode=values.input_mode,
                                           content=values.content, status="completed", occurred_at=utc_now())
        assistant = ConversationMessage(session_id=session.id, sequence_number=sequence + 1,
                                        speaker="assistant", input_mode="generated", content="", occurred_at=utc_now())
        db.session.add_all([user_message, assistant])
    attempt = utc_now()
    assistant.status, assistant.updated_at = "pending", attempt
    session.current_input_mode = values.input_mode
    db.session.flush()
    history = db.session.scalars(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id, ConversationMessage.status == "completed",
        ConversationMessage.sequence_number <= user_message.sequence_number
    ).order_by(ConversationMessage.sequence_number.desc()).limit(6)).all()
    messages = [{"role": item.speaker, "content": item.content} for item in reversed(history)]
    snapshot = session.scenario_snapshot
    assistant_id, user_message_id = assistant.id, user_message.id
    # Commit the reservation and release the session lock before network IO.
    db.session.commit()
    try:
        content = generate_reply(snapshot, messages)
    except ApiError:
        db.session.execute(update(ConversationMessage).where(
            ConversationMessage.id == assistant_id, ConversationMessage.status == "pending",
            ConversationMessage.updated_at == attempt).values(status="failed", updated_at=utc_now()))
        db.session.commit()
        raise
    # A stale worker must not overwrite a newer retry of the same turn.
    result = db.session.execute(update(ConversationMessage).where(
        ConversationMessage.id == assistant_id, ConversationMessage.status == "pending",
        ConversationMessage.updated_at == attempt).values(content=content, status="completed", updated_at=utc_now()))
    if result.rowcount != 1:
        db.session.rollback()
        raise ApiError("Lượt hội thoại đã thay đổi. Vui lòng tải lại.", 409, "turn_conflict")
    db.session.commit()
    return reply_public(db.session.get(ConversationMessage, user_message_id),
                        db.session.get(ConversationMessage, assistant_id))

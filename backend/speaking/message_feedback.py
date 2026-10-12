"""On-demand, cached text feedback for one owned learner message."""
import json
import re
import uuid
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from api_errors import ApiError
from extensions import db
from .conversation import owned_session, as_utc
from .service import parse_id
from .models import ConversationMessage, utc_now
from .evaluation_ai import (OUTPUT_SCHEMA, object_schema, text_schema, check_schema,
                            unique_object, generate_evaluation, evaluation_model)

PROMPT = Path(__file__).with_name("message_feedback_prompt.txt").read_text(encoding="utf-8")
SCHEMA = object_schema({"summary": text_schema(1200), "items": {
    **OUTPUT_SCHEMA["properties"]["items"], "maxItems": 3}})
LEASE_SECONDS = 120


def parse_feedback(content, messages):
    if not isinstance(content, str) or not content.strip() or len(content) > 18000:
        raise ValueError("Invalid feedback size")
    content = content.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*\n([\s\S]*?)\n```", content, flags=re.IGNORECASE)
    if fenced:
        content = fenced.group(1)
    result = json.loads(content, object_pairs_hook=unique_object)
    check_schema(result, SCHEMA)
    target = messages[-1]
    seen = set()
    items = []
    for item in result["items"]:
        if item["message_id"] != target["message_id"] or item["original"] not in target["content"]:
            raise ValueError("Invalid target quotation")
        evidence = (item["original"], item["improved"])
        if evidence not in seen:
            items.append(item)
            seen.add(evidence)
    return {**result, "items": items}


def serialize(message):
    if message.feedback_payload is not None:
        return {"status": "completed", "result": message.feedback_payload}
    if message.feedback_error:
        return {"status": "failed", "result": None, "error": message.feedback_error}
    return {"status": "processing", "result": None}


def evaluate_message(user_id, session_id, message_id):
    session = owned_session(user_id, session_id, lock=True)
    identifier = parse_id(message_id)
    message = db.session.scalar(select(ConversationMessage).where(
        ConversationMessage.id == identifier, ConversationMessage.session_id == session.id))
    if message is None:
        raise ApiError("Không tìm thấy câu hội thoại.", 404, "message_not_found")
    if message.speaker != "user" or message.status != "completed" or not message.content.strip():
        raise ApiError("Chỉ nhận xét câu của bạn đã được lưu đầy đủ.", 409, "message_not_ready")
    if message.feedback_payload is not None or (
            not message.feedback_error and message.feedback_started_at and
            as_utc(message.feedback_started_at) > utc_now() - timedelta(seconds=LEASE_SECONDS)):
        response = serialize(message)
        db.session.commit()
        return response
    rows = db.session.scalars(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id,
        ConversationMessage.sequence_number <= message.sequence_number,
        ConversationMessage.status == "completed")
        .order_by(ConversationMessage.sequence_number.desc()).limit(8)).all()
    messages = [{"message_id": row.id, "speaker": row.speaker,
                 "input_mode": row.input_mode, "content": row.content} for row in reversed(rows)]
    snapshot = session.scenario_snapshot
    attempt = str(uuid.uuid4())
    message.feedback_attempt_id = attempt
    message.feedback_started_at = utc_now()
    message.feedback_error = None
    message.feedback_model = evaluation_model()
    db.session.commit()  # Keep live turns available during provider IO.
    try:
        result = generate_evaluation(snapshot, messages, prompt=PROMPT, schema=SCHEMA,
                                    parser=parse_feedback, target_message_id=identifier)
        # Validate again even when the transport is substituted in tests.
        result = parse_feedback(json.dumps(result, ensure_ascii=False), messages)
    except (ApiError, ValueError) as error:
        owned_session(user_id, session_id, lock=True)
        db.session.expire_all()
        current = db.session.get(ConversationMessage, identifier)
        if current.feedback_attempt_id == attempt:
            current.feedback_error = error.message if isinstance(error, ApiError) else "Chưa nhận được nhận xét hợp lệ. Vui lòng thử lại."
            db.session.commit()
        else:
            db.session.rollback()
        if isinstance(error, ApiError):
            raise
        raise ApiError("Chưa nhận được nhận xét hợp lệ. Vui lòng thử lại.", 502, "feedback_failed") from None
    owned_session(user_id, session_id, lock=True)
    db.session.expire_all()
    current = db.session.get(ConversationMessage, identifier)
    if current.feedback_attempt_id == attempt:
        current.feedback_payload = result
        current.feedback_error = None
    response = serialize(current)
    db.session.commit()
    return response

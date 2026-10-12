"""Owned, idempotent session completion and text-only evaluation attempts."""
import uuid
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from api_errors import ApiError
from extensions import db
from .conversation import owned_session, as_utc
from .evaluation_ai import CRITERIA, RUBRIC_VERSION, evaluation_model, generate_evaluation, validate_result
from .models import (ConversationMessage, ConversationAudioAsset, SessionEvaluation,
                     EvaluationCriterion, EvaluationScore, utc_now)

ATTEMPT_SECONDS = 120


def finish_session(user_id, session_id):
    session = owned_session(user_id, session_id, lock=True)
    if session.status == "completed":
        db.session.commit()
        return {"session": {"id": session.id, "status": session.status}}
    if session.status not in {"active", "paused"}:
        raise ApiError("Phiên này không thể kết thúc để nhận xét.", 409, "session_inactive")
    unresolved = db.session.scalar(select(ConversationMessage.id).where(
        ConversationMessage.session_id == session.id, ConversationMessage.status != "completed").limit(1))
    uploading = db.session.scalar(select(ConversationAudioAsset.id).where(
        ConversationAudioAsset.session_id == session.id, ConversationAudioAsset.status == "uploading").limit(1))
    if unresolved or uploading:
        raise ApiError("Hãy lưu xong hội thoại và âm thanh trước khi kết thúc.", 409, "turn_unresolved")
    timestamp = utc_now()
    if session.status == "active" and session.last_resumed_at:
        session.accumulated_active_ms += max(0, int((timestamp - as_utc(session.last_resumed_at)).total_seconds() * 1000))
    session.status, session.ended_at, session.last_resumed_at = "completed", timestamp, None
    db.session.commit()
    return {"session": {"id": session.id, "status": session.status}}


def serialize(evaluation):
    if evaluation is None:
        return {"status": "not_started", "result": None}
    status = evaluation.status
    if status == "processing" and evaluation.processing_started_at and (
            utc_now() - as_utc(evaluation.processing_started_at)).total_seconds() >= ATTEMPT_SECONDS:
        status = "failed"
    return {"status": status, "rubric_version": evaluation.rubric_version,
            "overall_score": float(evaluation.overall_score) if evaluation.overall_score is not None else None,
            "result": evaluation.result_payload,
            "error": (evaluation.error_message or "Lần phân tích trước chưa hoàn tất. Vui lòng thử lại.") if status == "failed" else None,
            "completed_at": as_utc(evaluation.completed_at).isoformat() if evaluation.completed_at else None}


def get_evaluation(user_id, session_id):
    session = owned_session(user_id, session_id)
    evaluation = db.session.scalar(select(SessionEvaluation).where(SessionEvaluation.session_id == session.id))
    return serialize(evaluation)


def insufficient_result():
    return {"assessment_status": "insufficient_data",
            "summary": "Chưa đủ nội dung để nhận xét đáng tin cậy. Hãy luyện ít nhất ba lượt trả lời có nội dung.",
            "criteria": {code: {"score": None, "feedback": "Chưa đủ dữ liệu.", "suggestion": "Luyện thêm câu trả lời có nội dung."} for code in CRITERIA},
            "strengths": [], "next_steps": ["Bắt đầu phiên mới và thử trả lời bằng câu đầy đủ ít nhất ba lượt."], "items": []}


def evaluate_session(user_id, session_id):
    session = owned_session(user_id, session_id, lock=True)
    if session.status != "completed":
        raise ApiError("Hãy kết thúc hội thoại trước khi xem nhận xét.", 409, "session_not_finished")
    evaluation = db.session.scalar(select(SessionEvaluation).where(SessionEvaluation.session_id == session.id))
    if evaluation and (evaluation.status in {"completed", "insufficient_data"} or (
            evaluation.status == "processing" and evaluation.processing_started_at and
            as_utc(evaluation.processing_started_at) > utc_now() - timedelta(seconds=ATTEMPT_SECONDS))):
        result = serialize(evaluation)
        db.session.commit()
        return result
    if evaluation is None:
        evaluation = SessionEvaluation(session_id=session.id, rubric_version=RUBRIC_VERSION)
        db.session.add(evaluation)
    attempt = str(uuid.uuid4())
    evaluation.status, evaluation.attempt_id = "processing", attempt
    evaluation.processing_started_at = utc_now()
    evaluation.error_message = None
    evaluation.model_name = evaluation_model()
    evaluation.rubric_version = RUBRIC_VERSION
    rows = db.session.scalars(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id, ConversationMessage.status == "completed")
        .order_by(ConversationMessage.sequence_number).limit(501)).all()
    messages = [{"message_id": row.id, "speaker": row.speaker, "input_mode": row.input_mode,
                 "content": row.content} for row in rows]
    snapshot = session.scenario_snapshot
    db.session.flush()
    identifier = evaluation.id
    db.session.commit()  # Release the reservation lock before provider IO.
    try:
        if len(rows) > 500:
            raise ApiError("Hội thoại quá dài để phân tích trong một lần.", 422, "evaluation_too_long")
        if sum(item["speaker"] == "user" and bool(item["content"].strip()) for item in messages) < 3:
            result = insufficient_result()
        else:
            result = validate_result(generate_evaluation(snapshot, messages), messages)
    except (ApiError, ValueError) as failure:
        message = failure.message if isinstance(failure, ApiError) else "Chưa nhận được nhận xét hợp lệ từ AI. Vui lòng thử lại."
        # Serialize attempt finalization against a newer retry.
        owned_session(user_id, session_id, lock=True)
        db.session.expire_all()
        current = db.session.get(SessionEvaluation, identifier)
        if current.attempt_id == attempt:
            current.status, current.error_message = "failed", message
            db.session.commit()
        else:
            db.session.rollback()
        if isinstance(failure, ApiError):
            raise
        raise ApiError(message, 502, "evaluation_failed") from None
    owned_session(user_id, session_id, lock=True)
    db.session.expire_all()
    current = db.session.get(SessionEvaluation, identifier)
    if current.attempt_id != attempt:
        db.session.commit()
        return serialize(current)
    current.result_payload = result
    current.summary = result["summary"]
    current.completed_at = utc_now()
    final_status = "completed" if result["assessment_status"] == "scored" else "insufficient_data"
    current.error_message = None
    db.session.execute(delete(EvaluationScore).where(EvaluationScore.evaluation_id == identifier))
    if final_status == "completed":
        weighted = sum(Decimal(str(result["criteria"][code]["score"])) * Decimal(str(weight))
                       for code, (_, weight) in CRITERIA.items())
        current.overall_score = weighted.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        insert = pg_insert if db.engine.dialect.name == "postgresql" else sqlite_insert
        for code, (name, weight) in CRITERIA.items():
            criterion_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "nihongoflow:evaluation:" + code))
            db.session.execute(insert(EvaluationCriterion).values(id=criterion_id, code=code,
                name=name, description="Nhận xét dựa trên transcript, không đánh giá phát âm.", is_active=True)
                .on_conflict_do_nothing(index_elements=["code"]))
            criterion = db.session.scalar(select(EvaluationCriterion).where(EvaluationCriterion.code == code))
            values = result["criteria"][code]
            db.session.add(EvaluationScore(evaluation_id=identifier, criterion_id=criterion.id,
                criterion_name_snapshot=name, weight=weight, score=values["score"],
                feedback=values["feedback"], improvement_suggestion=values["suggestion"]))
    else:
        current.overall_score = None
    current.status = final_status
    db.session.commit()
    return serialize(current)

from flask import Blueprint, g, jsonify, request
from sqlalchemy import exists, select

from auth.security import body, require_auth
from extensions import db
from .models import Scenario, ScenarioCategory, ScenarioRole
from .conversation import TurnInput, send_turn, transcript
from .history import list_sessions, session_detail
from .service import (
    ScenarioFilters, StartSessionInput, get_scenario, list_scenarios,
    public_category, scenario_detail, start_session,
)

bp = Blueprint("speaking", __name__, url_prefix="/api/speaking")


@bp.get("/scenario-categories")
@require_auth
def categories():
    available = exists().where(
        Scenario.category_id == ScenarioCategory.id, Scenario.status == "published",
        exists().where(ScenarioRole.scenario_id == Scenario.id),
    )
    rows = db.session.scalars(select(ScenarioCategory).where(available)
                             .order_by(ScenarioCategory.sort_order, ScenarioCategory.name, ScenarioCategory.id)).all()
    return jsonify({"items": [public_category(category) for category in rows]})


@bp.get("/scenarios")
@require_auth
def scenarios():
    return jsonify(list_scenarios(ScenarioFilters.parse(request.args)))


@bp.get("/scenarios/<scenario_id>")
@require_auth
def detail(scenario_id):
    return jsonify({"scenario": scenario_detail(*get_scenario(scenario_id))})


@bp.post("/scenarios/<scenario_id>/sessions")
@require_auth
def begin(scenario_id):
    values = StartSessionInput.parse(body())
    return jsonify(start_session(g.user.id, scenario_id, values)), 201


@bp.get("/sessions/<session_id>/messages")
@require_auth
def messages(session_id):
    return jsonify(transcript(g.user.id, session_id, request.args))


@bp.post("/sessions/<session_id>/messages")
@require_auth
def send_message(session_id):
    return jsonify(send_turn(g.user.id, session_id, TurnInput.parse(body())))


@bp.get("/sessions")
@require_auth
def history():
    return jsonify(list_sessions(g.user.id, request.args))


@bp.get("/sessions/<session_id>")
@require_auth
def saved_session(session_id):
    return jsonify(session_detail(g.user.id, session_id))


@bp.delete("/sessions/<session_id>")
@require_auth
def delete_saved_session(session_id):
    from .deletion import delete_session
    if request.args or request.get_data():
        from api_errors import ApiError
        raise ApiError("Yêu cầu xóa hội thoại không cần nội dung bổ sung.")
    return jsonify(delete_session(g.user.id, session_id))


@bp.post("/sessions/<session_id>/live-token")
@require_auth
def provision_live(session_id):
    from .live import live_token
    return jsonify(live_token(g.user.id, session_id))


@bp.post("/sessions/<session_id>/live-turns")
@require_auth
def persist_live_turn(session_id):
    from .live import save_live_turn
    return jsonify(save_live_turn(g.user.id, session_id, body()))


@bp.post("/sessions/<session_id>/messages/<message_id>/audio-upload")
@require_auth
def audio_upload(session_id, message_id):
    from .audio import prepare_upload
    return jsonify(prepare_upload(g.user.id, session_id, message_id, body()))


@bp.post("/sessions/<session_id>/audio/<asset_id>/complete")
@require_auth
def audio_complete(session_id, asset_id):
    from .audio import complete_upload
    return jsonify(complete_upload(g.user.id, session_id, asset_id))


@bp.get("/sessions/<session_id>/audio/<asset_id>/playback")
@require_auth
def audio_playback(session_id, asset_id):
    from .audio import playback
    return jsonify(playback(g.user.id, session_id, asset_id))


@bp.post("/sessions/<session_id>/finish")
@require_auth
def finish(session_id):
    from .evaluation import finish_session
    from api_errors import ApiError
    if body() != {}:
        raise ApiError("Yêu cầu kết thúc phiên không cần nội dung bổ sung.")
    return jsonify(finish_session(g.user.id, session_id))


@bp.post("/sessions/<session_id>/messages/<message_id>/feedback")
@require_auth
def message_feedback(session_id, message_id):
    from .message_feedback import evaluate_message
    from api_errors import ApiError
    if body() != {}:
        raise ApiError("Nhận xét chỉ sử dụng câu đã lưu trên máy chủ.")
    result = evaluate_message(g.user.id, session_id, message_id)
    return jsonify(result), 202 if result["status"] == "processing" else 200


@bp.get("/sessions/<session_id>/evaluation")
@require_auth
def evaluation_result(session_id):
    from .evaluation import get_evaluation
    return jsonify(get_evaluation(g.user.id, session_id))


@bp.post("/sessions/<session_id>/evaluation")
@require_auth
def evaluation_request(session_id):
    from .evaluation import evaluate_session
    from api_errors import ApiError
    if body() != {}:
        raise ApiError("Điểm và nhận xét được tạo từ transcript đã lưu trên máy chủ.")
    result = evaluate_session(g.user.id, session_id)
    return jsonify(result), 202 if result["status"] == "processing" else 200

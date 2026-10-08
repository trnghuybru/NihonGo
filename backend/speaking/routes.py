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

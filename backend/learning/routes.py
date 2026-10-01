from flask import Blueprint, g, jsonify, request

from auth.security import require_auth
from extensions import db
from .models import LearningPreferences
from .options import public_options
from .service import PreferencesInput, save_preferences

bp = Blueprint("learning", __name__, url_prefix="/api/learning")


@bp.get("/preferences")
@require_auth
def get_preferences():
    profile = db.session.get(LearningPreferences, g.user.id)
    return jsonify({"profile": profile.public() if profile else None, "options": public_options()})


@bp.put("/preferences")
@require_auth
def update_preferences():
    values = PreferencesInput.parse(request.get_json(silent=True))
    profile = save_preferences(g.user.id, values)
    return jsonify({"profile": profile.public()})

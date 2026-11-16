from flask import Blueprint, g, jsonify, request

from api_errors import ApiError
from auth.security import limit, require_auth
from extensions import db
from .models import LearningPreferences
from .options import public_options
from .progress import daily_progress, record_study, study_calendar
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


@bp.get('/progress')
@require_auth
def get_progress():
    limit('study-user', g.user.id, 30, 60)
    if request.args.get('account_id', g.user.id) != g.user.id:
        raise ApiError('Tài khoản đã thay đổi. Vui lòng tải lại tiến độ.', 403, 'study_account_changed')
    return jsonify(daily_progress(g.user.id))


@bp.get('/study-calendar')
@require_auth
def get_study_calendar():
    limit('study-calendar-user', g.user.id, 30, 60)
    if request.args.get('account_id', g.user.id) != g.user.id:
        raise ApiError('Tài khoản đã thay đổi. Vui lòng tải lại tiến độ.', 403, 'study_account_changed')
    raw_year = request.args.get('year', '')
    current_year = daily_progress(g.user.id)['date'][:4]
    if not raw_year.isdecimal() or len(raw_year) != 4 or not 2000 <= int(raw_year) <= int(current_year):
        raise ApiError('Năm của lịch học không hợp lệ.')
    return jsonify(study_calendar(g.user.id, int(raw_year)))


@bp.post('/progress')
@require_auth
def update_progress():
    limit('study-user', g.user.id, 30, 60)
    return jsonify(record_study(g.user.id, request.get_json(silent=True)))

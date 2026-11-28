from flask import Blueprint, g, jsonify, request
from auth.security import require_auth, limit
from api_errors import ApiError

bp = Blueprint('pronunciation', __name__, url_prefix='/api/pronunciation')

@bp.post('/analyze')
@require_auth
def analyze():
    from .service import analyze_recording
    limit('pronunciation', g.user.id, 8, 60)
    if request.content_length is None or request.content_length > 1400000:
        raise ApiError('Bản ghi quá lớn. Hãy đọc một câu dưới 20 giây.', 413)
    return jsonify(analyze_recording(request.get_json(silent=True)))


def init_pronunciation(app):
    app.register_blueprint(bp)

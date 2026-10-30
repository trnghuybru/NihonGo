from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from auth.security import require_auth
from .service import RecognitionInputError, REQUEST_LIMIT

bp = Blueprint('handwriting', __name__, url_prefix='/api/kanji')


@bp.errorhandler(RequestEntityTooLarge)
def too_large(_error):
    return jsonify(error='Yêu cầu nhận dạng tối đa 1 MB.', code='request_too_large'), 413


@bp.post('/recognize')
@require_auth
def recognize():
    request.max_content_length = REQUEST_LIMIT
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error='Yêu cầu phải là JSON object.', code='invalid_request'), 400
    try:
        return jsonify(current_app.extensions['handwriting'].recognize(data.get('image')))
    except RecognitionInputError as error:
        return jsonify(error=str(error), code=error.code), error.status
    except Exception:
        current_app.logger.exception('Handwriting inference failed')
        return jsonify(error='Không nhận dạng được chữ viết. Vui lòng thử lại.', code='inference_failed'), 500

import base64
import hashlib
import json
import math

from flask import Blueprint, jsonify, request
from sqlalchemy import select

from api_errors import ApiError
from auth.security import require_auth
from extensions import db
from .importer import normalize_text
from .models import CaptionSegment, ExampleVideo

bp = Blueprint("video_examples", __name__, url_prefix="/api/vocabulary/video-examples")


@bp.errorhandler(ApiError)
def api_error(error):
    return jsonify({"error": error.message, "code": error.code}), error.status


def query_fingerprint(query):
    return hashlib.sha256(query.encode()).hexdigest()[:16]


def decode_cursor(cursor, query):
    try:
        if len(cursor) > 512:
            raise ValueError()
        payload = json.loads(base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True))
        if (payload["q"] != query_fingerprint(query) or not isinstance(payload["id"], str)
                or not 1 <= len(payload["id"]) <= 128):
            raise ValueError()
        return payload["id"]
    except (ValueError, KeyError, TypeError, UnicodeError):
        raise ApiError("Phân trang không hợp lệ.") from None


@bp.get("")
@require_auth
def search_examples():
    query = normalize_text(request.args.get("q", ""))
    try:
        page_size = int(request.args.get("page_size", "20"))
    except ValueError:
        raise ApiError("Phân trang không hợp lệ.") from None
    if not query or len(query) > 100 or "\x00" in query or not 1 <= page_size <= 40:
        raise ApiError("Nhập từ hoặc cụm tiếng Nhật tối đa 100 ký tự.")
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    statement = select(CaptionSegment, ExampleVideo).join(ExampleVideo).where(
        CaptionSegment.search_text.like(f"%{escaped}%", escape="\\"))
    cursor = request.args.get("after")
    if cursor:
        statement = statement.where(CaptionSegment.id > decode_cursor(cursor, query))
    rows = db.session.execute(statement.order_by(CaptionSegment.id).limit(page_size + 1)).all()
    has_more = len(rows) > page_size
    rows = rows[:page_size]
    items = [{"id": segment.id, "text": segment.text, "search_text": segment.search_text,
        "start_seconds": segment.start_seconds, "end_seconds": segment.end_seconds,
        "video": {"youtube_id": video.id, "title": video.title, "channel": video.channel},
        "watch_url": f"https://www.youtube.com/watch?v={video.id}&t={math.floor(segment.start_seconds)}s"}
        for segment, video in rows]
    next_cursor = None
    if has_more:
        next_cursor = base64.urlsafe_b64encode(json.dumps({"id": rows[-1][0].id,
            "q": query_fingerprint(query)}, separators=(",", ":")).encode()).decode().rstrip("=")
    return jsonify({"query": query, "items": items, "next_cursor": next_cursor, "has_more": has_more})

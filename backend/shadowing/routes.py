import math
import base64
import json
from flask import Blueprint, g, jsonify, request
from sqlalchemy import select, and_, or_

from api_errors import ApiError
from auth.security import require_auth
from extensions import db
from video_examples.models import CaptionSegment, ExampleVideo
from .models import ShadowingJob, ShadowingRequest, ShadowingTranslation
from .processor import display_captions, attach_practice_segments
from .service import owned_job, public_job, submit
from .words import cached_analysis, dictionary_entries
from .translation import source_for, public_translation, request_translation

bp = Blueprint('shadowing', __name__, url_prefix='/api/listening/shadowing')


@bp.post('/jobs/<job_id>/questions')
@require_auth
def questions(job_id):
    from auth.security import limit
    from .quiz import quiz_source, generate_questions
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError('Cần chọn số câu hỏi.', 400, 'quiz_invalid_count')
    source = quiz_source(job_id, data.get('count'), data.get('level', 'N3'))
    limit('shadowing-quiz', g.user.id, 20, 3600)
    # Release the read transaction while awaiting the provider; nothing is stored.
    db.session.rollback()
    response = jsonify(generate_questions(source))
    response.headers['Cache-Control'] = 'no-store'
    return response


@bp.route('/jobs/<job_id>/translation', methods=['GET', 'POST'])
@require_auth
def translation(job_id):
    if request.method == 'POST':
        from auth.security import limit
        limit('shadowing-translation', g.user.id, 30, 3600)
        row, source = request_translation(job_id)
    else:
        source = source_for(job_id)
        row = db.session.scalar(select(ShadowingTranslation).where(ShadowingTranslation.job_id == job_id))
    result = public_translation(row, source)
    response = jsonify(result)
    response.headers['Cache-Control'] = 'no-store'
    return response, 202 if request.method == 'POST' and result['status'] != 'ready' else 200


@bp.errorhandler(ApiError)
def api_error(error):
    db.session.rollback()
    return jsonify({'error': error.message, 'code': error.code}), error.status


@bp.get('/jobs')
@require_auth
def jobs():
    scope = request.args.get('scope', 'all')
    if scope not in ('all', 'mine'):
        raise ApiError('Danh sách video không hợp lệ.')
    mine = select(ShadowingRequest.job_id).where(ShadowingRequest.job_id == ShadowingJob.id,
        ShadowingRequest.user_id == g.user.id).correlate(ShadowingJob).exists()
    if scope == 'mine':
        query = select(ShadowingJob, ShadowingRequest.created_at, mine.label('is_mine')).join(ShadowingRequest).where(ShadowingRequest.user_id == g.user.id)
        timestamp = ShadowingRequest.created_at
    else:
        query = select(ShadowingJob, ShadowingJob.created_at, mine.label('is_mine')).where(or_(ShadowingJob.status == 'ready', mine))
        timestamp = ShadowingJob.created_at
    cursor = request.args.get('cursor')
    if cursor:
        try:
            if len(cursor) > 300:
                raise ValueError()
            data = json.loads(base64.urlsafe_b64decode(cursor + '=' * (-len(cursor) % 4)))
            if data['scope'] != scope or type(data['time']) is not int or not 0 <= data['time'] <= 2**63 - 1 or not isinstance(data['id'], str) or len(data['id']) > 36:
                raise ValueError()
            query = query.where(or_(timestamp < data['time'], and_(timestamp == data['time'], ShadowingJob.id < data['id'])))
        except (ValueError, KeyError, TypeError, UnicodeError):
            raise ApiError('Mốc phân trang không hợp lệ.') from None
    rows = db.session.execute(query.order_by(timestamp.desc(), ShadowingJob.id.desc()).limit(51)).all()
    next_cursor = None
    if len(rows) > 50:
        last = rows[49]
        next_cursor = base64.urlsafe_b64encode(json.dumps({'scope': scope, 'time': last[1], 'id': last[0].id}).encode()).decode().rstrip('=')
    response = jsonify({'items': [{**public_job(job), 'is_mine': bool(owned)} for job, _, owned in rows[:50]], 'next_cursor': next_cursor})
    response.headers['Cache-Control'] = 'no-store'
    return response


@bp.post('/jobs')
@require_auth
def create():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError('Yêu cầu phải có link YouTube.')
    job = submit(g.user.id, data.get('url'))
    return jsonify({'job': {**public_job(job), 'is_mine': True}}), 200 if job.status == 'ready' else 202


@bp.get('/jobs/<job_id>')
@require_auth
def status(job_id):
    response = jsonify({'job': public_job(owned_job(g.user.id, job_id))})
    response.headers['Cache-Control'] = 'no-store'
    return response


@bp.post('/jobs/<job_id>/retry')
@require_auth
def retry(job_id):
    job = owned_job(g.user.id, job_id)
    if job.status != 'failed':
        raise ApiError('Video này không cần thử lại.', 409, 'shadowing_not_failed')
    result = submit(g.user.id, f'https://www.youtube.com/watch?v={job.video_id}')
    return jsonify({'job': public_job(result)}), 202


@bp.get('/jobs/<job_id>/lesson')
@require_auth
def lesson(job_id):
    job = db.session.get(ShadowingJob, job_id)
    if job is None:
        raise ApiError('Không tìm thấy bài shadowing.', 404, 'shadowing_not_found')
    if job.status != 'ready':
        owned_job(g.user.id, job_id)
        raise ApiError('Video đang được chuẩn bị.', 409, 'shadowing_not_ready')
    video = db.session.get(ExampleVideo, job.video_id)
    segments = db.session.scalars(select(CaptionSegment).where(CaptionSegment.video_id == job.video_id)
                                  .order_by(CaptionSegment.sequence)).all()
    if not video or not segments:
        raise ApiError('Không còn dữ liệu phụ đề của video.', 404, 'shadowing_not_found')
    info = {'youtube_id': video.id, 'title': video.title, 'channel': video.channel}
    practice = [{'id': segment.id, 'text': segment.text, 'search_text': segment.search_text,
        'start_seconds': segment.start_seconds, 'end_seconds': segment.end_seconds,
        'video': info, 'watch_url': f'https://www.youtube.com/watch?v={video.id}&t={math.floor(segment.start_seconds)}s'}
        for segment in segments]
    cues = job.display_captions or attach_practice_segments(
        display_captions(job.raw_captions or practice, video.duration_seconds), practice, video.id)
    analysis = cached_analysis(job, practice, cues)
    return jsonify({'job': public_job(job), 'video': info, 'caption_kind': video.caption_kind,
        'tokens': {'segments': analysis['segments'], 'captions': analysis['captions']},
        'words': dictionary_entries(analysis['words']),
        'segments': practice, 'captions': [{**cue, 'search_text': cue['text'], 'video': info,
            'watch_url': f'https://www.youtube.com/watch?v={video.id}&t={math.floor(cue["start_seconds"])}s'}
            for cue in cues]})

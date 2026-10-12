import re
import time
import uuid
from urllib.parse import parse_qs, urlparse

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from api_errors import ApiError
from auth.models import User
from extensions import db
from video_examples.models import ExampleVideo, CaptionSegment
from .models import ShadowingJob, ShadowingRequest

ACTIVE = ('queued', 'extracting', 'transcribing', 'normalizing')


def video_id_from_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ApiError('Dán đường dẫn video YouTube hợp lệ.')
    try:
        parsed = urlparse(value.strip())
        port = parsed.port
    except ValueError:
        raise ApiError('Dán đường dẫn video YouTube hợp lệ.') from None
    if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password or port:
        raise ApiError('Dán đường dẫn video YouTube hợp lệ.')
    host = (parsed.hostname or '').lower()
    identifier = ''
    if host == 'youtu.be':
        identifier = parsed.path.strip('/')
    elif host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'):
        if parsed.path == '/watch':
            identifier = parse_qs(parsed.query).get('v', [''])[0]
        elif re.fullmatch(r'/(shorts|embed|live)/[A-Za-z0-9_-]{11}/?', parsed.path):
            identifier = parsed.path.rstrip('/').split('/')[-1]
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', identifier):
        raise ApiError('Dán link của một video YouTube, không phải playlist.')
    return identifier


def public_job(job):
    return {'id': job.id, 'video_id': job.video_id, 'status': job.status,
            'title': job.title, 'error_code': job.error_code, 'error_message': job.error_message,
            'created_at': job.created_at, 'updated_at': job.updated_at,
            'can_retry': job.status == 'failed'}


def owned_job(user_id, job_id):
    job = db.session.scalar(select(ShadowingJob).join(ShadowingRequest)
        .where(ShadowingRequest.user_id == user_id, ShadowingJob.id == job_id))
    if job is None:
        raise ApiError('Không tìm thấy bài shadowing.', 404, 'shadowing_not_found')
    return job


def submit(user_id, url):
    identifier = video_id_from_url(url)
    # Serialize submissions from one account so concurrent requests cannot bypass quotas.
    db.session.execute(select(User.id).where(User.id == user_id).with_for_update()).first()
    now = int(time.time())
    existing = db.session.get(ExampleVideo, identifier)
    ready = existing is not None and bool(db.session.scalar(select(func.count()).select_from(CaptionSegment)
                                                           .where(CaptionSegment.video_id == identifier)))
    job = db.session.scalar(select(ShadowingJob).where(ShadowingJob.video_id == identifier))
    subscribed = job and db.session.get(ShadowingRequest, (user_id, job.id))
    if not ready and not (subscribed and job.status in ACTIVE):
        busy = db.session.scalar(select(func.count()).select_from(ShadowingRequest).join(ShadowingJob)
            .where(ShadowingRequest.user_id == user_id, ShadowingJob.status.in_(ACTIVE)))
        if busy:
            raise ApiError('Bạn đang có một video được chuẩn bị. Hãy chờ video đó hoàn tất.', 409, 'shadowing_busy')
        if job is None or job.status == 'failed':
            from auth.security import limit
            limit('shadowing-submit', user_id, 5, 86400)
    insert = pg_insert if db.engine.dialect.name == 'postgresql' else sqlite_insert
    db.session.execute(insert(ShadowingJob).values(id=str(uuid.uuid4()), video_id=identifier,
        status='ready' if ready else 'queued', title=existing.title if ready else '', attempts=0,
        created_at=now, updated_at=now).on_conflict_do_nothing(index_elements=['video_id']))
    job = db.session.scalar(select(ShadowingJob).where(ShadowingJob.video_id == identifier).with_for_update())
    if ready:
        job.status, job.title = 'ready', existing.title
        job.lease_token = job.lease_expires_at = None
    elif job.status == 'failed':
        job.status, job.attempts = 'queued', 0
        job.error_code = job.error_message = job.lease_token = job.lease_expires_at = job.last_enqueued_at = None
        job.updated_at = now
    db.session.execute(insert(ShadowingRequest).values(user_id=user_id, job_id=job.id, created_at=now)
        .on_conflict_do_nothing(index_elements=['user_id', 'job_id']))
    db.session.commit()
    # DB is the durable outbox: the worker republishes queued jobs if the broker is down.
    if job.status == 'queued' and (job.last_enqueued_at is None or job.last_enqueued_at < now - 60):
        from .queue import enqueue
        enqueue(job)
    return job

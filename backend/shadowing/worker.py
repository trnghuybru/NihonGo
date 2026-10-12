"""Local SQS consumer, durable outbox dispatcher and bounded processor supervisor."""
import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

from sqlalchemy import or_, select, update

from extensions import db
from video_examples.importer import import_dataset
from .models import ShadowingJob
from .morphology import analyze
from .processor import display_captions, attach_practice_segments
from .queue import client, enqueue, queue_url
from .service import ACTIVE

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 3


def claim(job_id):
    now, token = int(time.time()), str(uuid.uuid4())
    timeout = int(os.getenv('SHADOWING_JOB_TIMEOUT', '2400'))
    result = db.session.execute(update(ShadowingJob).where(ShadowingJob.id == job_id,
        ShadowingJob.status.in_(ACTIVE), ShadowingJob.attempts < MAX_ATTEMPTS,
        or_(ShadowingJob.lease_expires_at.is_(None), ShadowingJob.lease_expires_at < now))
        .values(status='extracting', attempts=ShadowingJob.attempts + 1, lease_token=token,
                lease_expires_at=now + timeout + 30, updated_at=now))
    db.session.commit()
    return token if result.rowcount else None


def save_result(job_id, token, result):
    job = db.session.scalar(select(ShadowingJob).where(ShadowingJob.id == job_id,
        ShadowingJob.lease_token == token).with_for_update())
    if job is None:
        return False
    if 'dataset' in result:
        import_dataset(result['dataset'], commit=False)
        job.status, job.title = 'ready', result['dataset']['video']['title']
        job.raw_captions = result['raw_captions']
        job.display_captions = result.get('display_captions') or attach_practice_segments(
            display_captions(job.raw_captions, result['dataset']['video']['duration_seconds']),
            result['dataset']['segments'], job.video_id)
        job.word_analysis = result.get('word_analysis') or analyze(result['dataset']['segments'], job.display_captions)
        job.error_code = job.error_message = None
    else:
        job.status = 'failed'
        job.error_code = result['error_code']
        job.error_message = result['error_message']
    job.lease_token = job.lease_expires_at = None
    job.updated_at = int(time.time())
    db.session.commit()
    return True


def process_job(job_id):
    token = claim(job_id)
    if token is None:
        return
    job = db.session.get(ShadowingJob, job_id)
    video_id = job.video_id
    timeout = int(os.getenv('SHADOWING_JOB_TIMEOUT', '2400'))
    with tempfile.TemporaryDirectory(prefix='nihongo-shadowing-') as directory:
        path = Path(directory)
        # A killable process bounds native inference and network work. Files are
        # owned by the supervisor's TemporaryDirectory even if the child crashes.
        with (path / 'worker.log').open('w') as log:
            process = subprocess.Popen([sys.executable, '-m', 'shadowing.processor', video_id, directory],
                stdout=log, stderr=log, start_new_session=True)
            deadline = time.monotonic() + timeout
            previous_phase = None
            try:
                while process.poll() is None:
                    if time.monotonic() >= deadline:
                        raise TimeoutError()
                    phase_file = path / 'phase.json'
                    if phase_file.exists():
                        phase = json.loads(phase_file.read_text())
                        if phase != previous_phase and phase['status'] in ACTIVE:
                            db.session.execute(update(ShadowingJob).where(ShadowingJob.id == job_id,
                                ShadowingJob.lease_token == token).values(status=phase['status'],
                                title=phase['title'], updated_at=int(time.time())))
                            db.session.commit()
                            previous_phase = phase
                    time.sleep(1)
                result_file = path / 'result.json'
                result = json.loads(result_file.read_text()) if result_file.exists() else {
                    'error_code': 'worker_failed', 'error_message': 'Worker bị gián đoạn. Hãy thử lại.'}
            except TimeoutError:
                result = {'error_code': 'processing_timeout',
                          'error_message': 'Video xử lý quá lâu. Hãy chọn video ngắn hơn hoặc thử lại.'}
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
        save_result(job_id, token, result)


def dispatch_pending():
    now = int(time.time())
    db.session.execute(update(ShadowingJob).where(ShadowingJob.status.in_(ACTIVE),
        ShadowingJob.attempts >= MAX_ATTEMPTS, ShadowingJob.lease_expires_at < now)
        .values(status='failed', error_code='worker_interrupted',
                error_message='Worker bị gián đoạn nhiều lần. Hãy thử lại.',
                lease_token=None, lease_expires_at=None, updated_at=now))
    db.session.commit()
    rows = db.session.scalars(select(ShadowingJob).where(ShadowingJob.status.in_(ACTIVE),
        ShadowingJob.attempts < MAX_ATTEMPTS,
        or_(ShadowingJob.lease_expires_at.is_(None), ShadowingJob.lease_expires_at < now),
        or_(ShadowingJob.last_enqueued_at.is_(None), ShadowingJob.last_enqueued_at < now - 60))
        .order_by(ShadowingJob.created_at).limit(20)).all()
    for job in rows:
        enqueue(job)


def main():
    from app import app
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            with app.app_context():
                dispatch_pending()
                connection = client()
                url = queue_url(connection)
                response = connection.receive_message(QueueUrl=url, MaxNumberOfMessages=1,
                    WaitTimeSeconds=10, VisibilityTimeout=int(os.getenv('SHADOWING_JOB_TIMEOUT', '2400')) + 60)
                for message in response.get('Messages', []):
                    payload = json.loads(message['Body'])
                    process_job(payload['job_id'])
                    connection.delete_message(QueueUrl=url, ReceiptHandle=message['ReceiptHandle'])
        except KeyboardInterrupt:
            return
        except Exception as error:
            # Do not log provider URLs, tokens, user input or connection strings.
            logger.error('Shadowing worker retry: %s', type(error).__name__)
            time.sleep(5)


if __name__ == '__main__':
    main()

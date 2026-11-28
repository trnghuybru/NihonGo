import copy
import json
from pathlib import Path

import click
from flask import has_app_context
from flask.cli import with_appcontext
from sqlalchemy import inspect, select

from api_errors import ApiError
from extensions import db
from .models import JlptExamRecord, JlptImage, JlptImport


def available():
    return has_app_context() and inspect(db.engine).has_table('jlpt_exams')


def import_payload(payload):
    # All source material is data. No source paths or text are executed.
    encoded = json.dumps(payload, ensure_ascii=False)
    if 'data:image/' in encoded or not isinstance(payload.get('sessions'), list):
        raise ValueError('Import must contain sessions and R2 image references, not base64 images.')
    digest = payload['source_sha256']
    normalized = {e['id']: e for e in payload.get('normalized', [])}
    seen = set()
    assets = {a['id']: a for a in payload['assets']}
    def validate_references(value):
        if isinstance(value, list):
            for item in value: validate_references(item)
        elif isinstance(value, dict):
            if value.get('image_id') and value['image_id'] not in assets:
                raise ValueError('Source references an image missing from the R2 manifest.')
            for item in value.values(): validate_references(item)
    validate_references(payload)
    for asset in assets.values():
        if asset['storage_key'] != f"jlpt/images/{asset['id']}.webp" or asset['mime_type'] != 'image/webp':
            raise ValueError('Invalid R2 asset key.')
        db.session.merge(JlptImage(**asset))
    for session in payload['sessions']:
        key = f"{payload['level'].lower()}-{session['id']}"
        if key in seen or session['month'] not in {7, 12}:
            raise ValueError('Invalid or duplicate exam session.')
        seen.add(key)
        row = db.session.get(JlptExamRecord, key) or JlptExamRecord(id=key)
        row.level, row.year, row.month = payload['level'], session['year'], session['month']
        row.has_exam = any(f['kind'] == 'exam' for f in session['files'])
        row.source_sha256, row.source_data = digest, session
        row.normalized = normalized.get(key)
        db.session.add(row)
    db.session.merge(JlptImport(source_sha256=digest, metadata_json={
        k: v for k, v in payload.items() if k not in {'sessions', 'normalized', 'assets'}}))
    db.session.commit()
    return {'sessions': len(seen), 'exams': sum(any(f['kind'] == 'exam' for f in s['files']) for s in payload['sessions']),
            'images': len(assets), 'graded_exams': len(normalized), 'source_sha256': digest}


def public_images(value):
    value = copy.deepcopy(value)
    urls = {}
    def visit(node):
        if isinstance(node, list):
            return [visit(x) for x in node]
        if not isinstance(node, dict):
            return node
        result = {k: visit(v) for k, v in node.items()}
        if node.get('image_id'):
            key = node['image_id']
            if key not in urls:
                asset = db.session.get(JlptImage, key)
                if asset is None:
                    raise ApiError('Không tìm thấy ảnh của đề thi.', 503)
                from vocabulary.audio import _tts_client
                urls[key] = _tts_client(public=True).generate_presigned_url('get_object',
                    Params={'Bucket': asset.bucket, 'Key': asset.storage_key}, ExpiresIn=21600)
            result['image_data_url'] = urls[key]
        return result
    return visit(value)


def source_catalog():
    if not available():
        return []
    return [dict(id=r.id, level=r.level, year=r.year, month=r.month,
        title=f'JLPT {r.level} · Tháng {r.month}/{r.year}', source_only=True,
        version=1, audio_url=None, total=0, sections=[],
        content_note='Tài liệu đề gốc; tự đối chiếu đáp án, chưa chấm tự động.')
        for r in db.session.scalars(select(JlptExamRecord).where(
            JlptExamRecord.has_exam.is_(True), JlptExamRecord.normalized.is_(None))).all()]


def source_exam(exam_id):
    row = db.session.get(JlptExamRecord, exam_id)
    if row is None or not row.has_exam:
        raise ApiError('Không tìm thấy tài liệu đề thi.', 404)
    files = [{k: v for k, v in f.items() if k in {'filename', 'kind', 'pages', 'question_images'}}
        for f in row.source_data['files'] if f.get('pages')]
    return public_images(dict(id=row.id, title=f'JLPT {row.level} · Tháng {row.month}/{row.year}', documents=files))


@click.command('jlpt-import-json')
@click.option('--source', type=click.Path(exists=True, path_type=Path), required=True)
@with_appcontext
def import_command(source):
    try:
        result = import_payload(json.loads(source.read_text()))
    except Exception:
        db.session.rollback()
        raise
    click.echo(json.dumps(result))

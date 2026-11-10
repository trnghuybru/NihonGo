"""Back up and atomically replace only the reading catalog and its dependents."""
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import click
from flask.cli import with_appcontext
from sqlalchemy import delete, select, text

from extensions import db
from .analysis import passage_analysis
from .importer import read_dataset
from .models import ReadingPassage, ReadingAttempt, ReadingInsight


def replace_dataset(path, backup_dir):
    passages, mismatches = read_dataset(path)
    if mismatches:
        raise ValueError('Bộ mới có đáp án không khớp lựa chọn; chưa thay dữ liệu.')
    tables = [ReadingPassage, ReadingAttempt, ReadingInsight]
    try:
        if db.engine.dialect.name == 'postgresql':
            db.session.execute(text("SET LOCAL lock_timeout = '10s'"))
            db.session.execute(text('LOCK TABLE reading_passages, reading_attempts, reading_insights IN SHARE ROW EXCLUSIVE MODE'))
        previous = {model.__tablename__: [dict(row) for row in db.session.execute(select(model.__table__)).mappings()]
                    for model in tables}
        by_id = {row['id']: row for row in previous['reading_passages']}
        if len(by_id) == len(passages) and all(
                values['id'] in by_id and all(by_id[values['id']][key] == value for key, value in values.items())
                for values in passages):
            db.session.rollback()  # Release locks, retain all current attempts and insights.
            return {'unchanged': True, 'passages': len(passages),
                    'questions': sum(len(p['questions']) for p in passages)}
        directory = Path(backup_dir)
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        directory.chmod(0o700)
        now = datetime.now(timezone.utc)
        backup_path = directory / f'reading-before-replace-{now:%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}.json'
        backup = {'schema_version': 1, 'created_at': now.isoformat(), 'tables': previous,
                  'new_dataset_sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest()}
        descriptor = os.open(backup_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as file:
            json.dump(backup, file, ensure_ascii=False)
            file.flush()
            os.fsync(file.fileno())
        if json.loads(backup_path.read_text(encoding='utf-8')) != backup:
            raise RuntimeError('Không xác minh được bản sao lưu; chưa xóa dữ liệu.')
        # Explicit dependent deletes also work in SQLite tests without FK cascades.
        for model in (ReadingInsight, ReadingAttempt, ReadingPassage):
            db.session.execute(delete(model))
        for values in passages:
            row = ReadingPassage(**values)
            db.session.add(row)
            passage_analysis(row)  # Existing local tokenizer only; never an AI request.
        db.session.flush()
        actual = set(db.session.scalars(select(ReadingPassage.id)))
        if actual != {p['id'] for p in passages}:
            raise RuntimeError('Bộ đọc sau nhập không khớp; hủy thay thế.')
        db.session.commit()
        return {'unchanged': False, 'backup': str(backup_path),
                'removed': {name: len(rows) for name, rows in previous.items()},
                'passages': len(passages), 'questions': sum(len(p['questions']) for p in passages)}
    except Exception:
        db.session.rollback()
        raise


@click.command('reading-replace')
@click.argument('path', type=click.Path(exists=True, dir_okay=False))
@click.option('--backup-dir', required=True, type=click.Path(file_okay=False))
@with_appcontext
def replace_command(path, backup_dir):
    try:
        click.echo(json.dumps(replace_dataset(path, backup_dir), ensure_ascii=False))
    except (ValueError, OSError) as error:
        raise click.ClickException(str(error)) from None
    except Exception as error:
        raise click.ClickException(f'Thay kho thất bại ({type(error).__name__}); transaction đã rollback.') from None

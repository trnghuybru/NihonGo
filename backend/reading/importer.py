"""Import reviewed source CSV without interpreting source text as instructions."""
import csv
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import click
from flask.cli import with_appcontext
from extensions import db
from .models import LEVELS, TYPES, ReadingPassage
from .analysis import passage_analysis

COLUMNS = ['Level', 'Dạng mondai', 'Bài', 'Đoạn', 'Bài đọc', 'Câu hỏi',
           'Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4', 'Đáp án (số)', 'Đáp án (nội dung)', 'Nguồn']


def read_dataset(path):
    groups, mismatches = {}, []
    kind_map = {value[0]: key for key, value in TYPES.items()}
    with Path(path).open(encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or not set(COLUMNS).issubset(reader.fieldnames):
            raise ValueError('CSV thiếu cột bắt buộc.')
        for line, row in enumerate(reader, 2):
            if any(not isinstance(row.get(key), str) or not row[key].strip() for key in COLUMNS):
                raise ValueError(f'Dòng {line}: thiếu dữ liệu.')
            level, title, source = row['Level'].strip(), row['Bài'].strip(), row['Nguồn'].strip()
            kind = kind_map.get(row['Dạng mondai'].strip())
            url = urlparse(source)
            if level not in LEVELS or not kind or url.scheme not in ('http', 'https') or not url.netloc:
                raise ValueError(f'Dòng {line}: trình độ, dạng bài hoặc nguồn không hợp lệ.')
            try:
                paragraph, answer = int(row['Đoạn']), int(row['Đáp án (số)'])
            except ValueError:
                raise ValueError(f'Dòng {line}: số đoạn hoặc đáp án không hợp lệ.') from None
            if paragraph < 1 or answer not in range(1, 5):
                raise ValueError(f'Dòng {line}: số đoạn hoặc đáp án không hợp lệ.')
            key = (level, title, paragraph, source)
            text = row['Bài đọc'].replace('\r\n', '\n').replace('\r', '\n')
            options = [row[f'Lựa chọn {i}'] for i in range(1, 5)]
            if options[answer - 1].strip() != row['Đáp án (nội dung)'].strip():
                mismatches.append(line)
            exercise = re.search(r'(\d+)\s*$', title)
            entry = groups.setdefault(key, dict(id='reading-' + hashlib.sha256(
                json.dumps(key, ensure_ascii=False).encode()).hexdigest()[:32], level=level,
                kind=kind, title=title, exercise=int(exercise[1]) if exercise else 0,
                paragraph=paragraph, text=text, source_url=source, questions=[]))
            if entry['text'] != text or entry['kind'] != kind:
                raise ValueError(f'Dòng {line}: cùng mã đoạn nhưng nội dung khác nhau.')
            entry['questions'].append({'text': row['Câu hỏi'], 'options': options,
                                      'answer': answer, 'answer_text': row['Đáp án (nội dung)'], 'source_line': line})
    if not groups:
        raise ValueError('CSV không có bài đọc.')
    return list(groups.values()), mismatches


def import_dataset(path, dry_run=False):
    passages, mismatches = read_dataset(path)  # Validate everything before writing.
    if not dry_run:
        try:
            for values in passages:
                row = db.session.get(ReadingPassage, values['id'])
                if row is None:
                    row = ReadingPassage(**values)
                    db.session.add(row)
                else:
                    for key, value in values.items():
                        setattr(row, key, value)
                passage_analysis(row)
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise
    return {'passages': len(passages), 'questions': sum(len(p['questions']) for p in passages),
            'answer_mismatch_lines': mismatches, 'dry_run': dry_run}


@click.command('reading-import')
@click.argument('path', type=click.Path(exists=True, dir_okay=False))
@click.option('--dry-run', is_flag=True, help='Validate without database writes or tokenization.')
@with_appcontext
def import_command(path, dry_run):
    try:
        click.echo(json.dumps(import_dataset(path, dry_run), ensure_ascii=False))
    except (ValueError, OSError, csv.Error) as error:
        raise click.ClickException(str(error)) from None

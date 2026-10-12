"""Transactional, repeatable import from the reviewed crawl artifact."""
import json
from pathlib import Path

import click
from flask.cli import with_appcontext
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from .models import JLPT_LEVELS, VocabularyTextbook, VocabularyLesson, VocabularyWord

DEFAULT_SOURCE = Path(__file__).resolve().parents[1] / "data/vocabulary/mimikara-n2.json"


def import_dataset(dataset):
    if dataset.get("schema_version") != 1 or not dataset.get("coverage", {}).get("complete"):
        raise ValueError("Chỉ nhập dataset schema_version=1 đã crawl đầy đủ.")
    book = dataset["textbook"]
    if book["jlpt_level"] not in JLPT_LEVELS:
        raise ValueError("Trình độ JLPT không hợp lệ.")
    lesson_data = [lesson for unit in dataset["units"] for lesson in unit["lessons"]]
    word_data = [word for lesson in lesson_data for word in lesson["words"]]
    if len({lesson["id"] for lesson in lesson_data}) != len(lesson_data) or len({word["id"] for word in word_data}) != len(word_data):
        raise ValueError("Dataset chứa ID trùng.")
    if len(lesson_data) != dataset["counts"]["lessons"] or len(word_data) != dataset["counts"]["words"]:
        raise ValueError("Số bài hoặc từ không khớp dataset.")
    textbook = db.session.get(VocabularyTextbook, book["id"])
    if textbook is None:
        textbook = VocabularyTextbook(id=book["id"])
        db.session.add(textbook)
    textbook.title, textbook.level, textbook.source_url = book["title"], book["jlpt_level"], book["source_url"]
    db.session.flush()
    lessons = {item.id: item for item in db.session.scalars(
        select(VocabularyLesson).where(VocabularyLesson.textbook_id == textbook.id))}
    words = {item.id: item for item in db.session.scalars(
        select(VocabularyWord).join(VocabularyLesson).where(VocabularyLesson.textbook_id == textbook.id))}
    for lesson in lesson_data:
        row = lessons.get(lesson["id"])
        if row is None:
            row = VocabularyLesson(id=lesson["id"], textbook_id=textbook.id)
            db.session.add(row)
        elif row.textbook_id != textbook.id:
            raise ValueError("Bài học thuộc giáo trình khác.")
        for field in ("unit_number", "unit_title", "title", "source_url", "audio_urls"):
            setattr(row, field, lesson[field])
        row.number = lesson["lesson_number"]
        db.session.flush()
        for word in lesson["words"]:
            item = words.get(word["id"])
            if item is None:
                item = VocabularyWord(id=word["id"], lesson_id=row.id)
                db.session.add(item)
            elif item.lesson_id != row.id:
                raise ValueError("Từ vựng thuộc bài học khác.")
            for field in ("number", "word", "reading", "meaning_vi", "han_viet"):
                setattr(item, field, word.get(field))
            previous = item.details or {}
            item.details = {key: word.get(key, []) for key in ("segments", "examples", "related")}
            if word.get("source"):
                item.details = {**item.details, "source": word["source"]}
                if (previous.get('audio') and previous.get('source', {}).get('sha256')
                        == word['source'].get('sha256')):
                    item.details = {**item.details, 'audio': previous['audio']}
    db.session.commit()
    return {"textbook": textbook.id, "lessons": len(lesson_data), "words": len(word_data)}


@click.command("vocabulary-import")
@click.option("--source", type=click.Path(exists=True, path_type=Path), default=DEFAULT_SOURCE)
@with_appcontext
def import_command(source):
    """Import/update vocabulary by stable ID without deleting existing content."""
    try:
        result = import_dataset(json.loads(source.read_text(encoding="utf-8")))
    except (ValueError, KeyError, TypeError, OSError, SQLAlchemyError) as error:
        db.session.rollback()
        raise click.ClickException("Không nhập được dữ liệu. Kiểm tra dataset, kết nối và chạy db upgrade trước.") from error
    click.echo(f"Đã nhập {result['textbook']}: {result['lessons']} bài, {result['words']} từ.")

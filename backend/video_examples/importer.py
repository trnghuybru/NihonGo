"""Import a validated caption snapshot atomically; never fetch YouTube at search time."""
import json
import math
from pathlib import Path
import re
import unicodedata

import click
from flask.cli import with_appcontext
from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from .models import CaptionSegment, ExampleVideo

DEFAULT_SOURCE = Path(__file__).resolve().parents[1] / "data/video_examples/cjtmDEG-B7U.ja.json"
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def normalize_text(text):
    return " ".join(unicodedata.normalize("NFKC", text).split())


def positive_number(value, allow_zero=False):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and (value >= 0 if allow_zero else value > 0))


def import_dataset(dataset):
    if dataset.get("schema_version") != 1:
        raise ValueError("Schema phụ đề không hợp lệ.")
    video, track, segments = dataset["video"], dataset["caption_track"], dataset["segments"]
    video_id = video["youtube_id"]
    if not isinstance(video_id, str) or not VIDEO_ID.fullmatch(video_id):
        raise ValueError("ID YouTube không hợp lệ.")
    if track["language"] != "ja" or track["kind"] not in ("manual", "asr"):
        raise ValueError("Cần phụ đề tiếng Nhật.")
    duration = video["duration_seconds"]
    if not positive_number(duration) or not segments or len(segments) != dataset["segment_count"]:
        raise ValueError("Thời lượng hoặc số đoạn không hợp lệ.")
    if not all(isinstance(video[key], str) and video[key].strip() for key in ("title", "channel")):
        raise ValueError("Thiếu thông tin video.")
    prepared = []
    previous_start = -1
    for sequence, item in enumerate(segments, 1):
        text, start, end = item["text"], item["start_seconds"], item["end_seconds"]
        identifier = f"{video_id}-ja-{sequence:04d}"
        if item["sequence"] != sequence or item["id"] != identifier:
            raise ValueError("ID hoặc thứ tự đoạn không hợp lệ.")
        if not isinstance(text, str) or not normalize_text(text) or "\x00" in text:
            raise ValueError("Nội dung phụ đề không hợp lệ.")
        if (not positive_number(start, True) or not positive_number(end)
                or start < previous_start or end <= start or end > duration):
            raise ValueError("Mốc thời gian phụ đề không hợp lệ.")
        previous_start = start
        prepared.append(CaptionSegment(id=identifier, video_id=video_id, sequence=sequence,
            text=text.strip(), search_text=normalize_text(text), start_seconds=start, end_seconds=end))
    # Validate everything before touching persisted rows. The replacement is one transaction.
    row = db.session.get(ExampleVideo, video_id)
    if row is None:
        row = ExampleVideo(id=video_id)
        db.session.add(row)
    row.title, row.channel = video["title"], video["channel"]
    row.duration_seconds, row.language, row.caption_kind = duration, "ja", track["kind"]
    db.session.flush()
    db.session.execute(delete(CaptionSegment).where(CaptionSegment.video_id == video_id))
    db.session.add_all(prepared)
    db.session.commit()
    return {"video_id": video_id, "segments": len(prepared)}


@click.command("video-examples-import")
@click.option("--source", type=click.Path(exists=True, path_type=Path), default=DEFAULT_SOURCE)
@with_appcontext
def import_command(source):
    """Import/update a Japanese caption snapshot without duplicate rows."""
    try:
        result = import_dataset(json.loads(source.read_text(encoding="utf-8")))
    except (ValueError, KeyError, TypeError, OSError, SQLAlchemyError) as error:
        db.session.rollback()
        raise click.ClickException("Không nhập được phụ đề. Kiểm tra file và chạy db upgrade trước.") from error
    click.echo(f"Đã nhập {result['video_id']}: {result['segments']} đoạn phụ đề.")

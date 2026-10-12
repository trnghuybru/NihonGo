"""Owned deletion with durable, retryable cleanup of S3-compatible audio."""
import time
from datetime import timedelta

import click
from flask.cli import with_appcontext
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

from api_errors import ApiError
from extensions import db
from .models import ConversationSession, ConversationAudioAsset, utc_now
from .conversation import as_utc
from .service import parse_id
from .storage import delete_session_audio

# Already-issued upload URLs last 15 minutes. A final sweep catches late uploads.
UPLOAD_GRACE_SECONDS = 16 * 60


def delete_session(user_id, session_id):
    identifier = parse_id(session_id)
    session = db.session.scalar(select(ConversationSession).where(
        ConversationSession.id == identifier, ConversationSession.user_id == user_id).with_for_update())
    if session is None:
        raise ApiError("Không tìm thấy buổi hội thoại.", 404, "session_not_found")
    if session.deleted_at is None:
        has_audio = db.session.scalar(select(ConversationAudioAsset.id).where(
            ConversationAudioAsset.session_id == identifier).limit(1)) is not None
        session.deleted_at = utc_now()
        session.audio_cleanup_after = session.deleted_at + timedelta(seconds=UPLOAD_GRACE_SECONDS) if has_audio else None
        db.session.commit()  # Block every owned-session API before storage IO.
    pending = False
    try:
        if session.audio_cleanup_after is not None:
            delete_session_audio(identifier)
        if session.audio_cleanup_after is None or as_utc(session.audio_cleanup_after) <= utc_now():
            db.session.execute(delete(ConversationSession).where(
                ConversationSession.id == identifier, ConversationSession.user_id == user_id,
                ConversationSession.deleted_at.is_not(None)))
            db.session.commit()
    except ApiError:
        db.session.rollback()
        pending = True  # Tombstone and cleanup deadline survive storage failure.
    return {"deleted": True, "audio_cleanup_pending": pending}


def cleanup_deleted_sessions():
    identifiers = db.session.scalars(select(ConversationSession.id).where(
        ConversationSession.deleted_at.is_not(None),
        (ConversationSession.audio_cleanup_after.is_(None) |
         (ConversationSession.audio_cleanup_after <= utc_now())))
        .order_by(ConversationSession.deleted_at).limit(100)).all()
    cleaned = 0
    for identifier in identifiers:
        session = db.session.scalar(select(ConversationSession).where(
            ConversationSession.id == identifier, ConversationSession.deleted_at.is_not(None)).with_for_update())
        if session is None:
            db.session.rollback()
            continue
        try:
            if session.audio_cleanup_after is not None:
                delete_session_audio(identifier)
            db.session.execute(delete(ConversationSession).where(ConversationSession.id == identifier))
            db.session.commit()
            cleaned += 1
        except ApiError:
            db.session.rollback()
    return cleaned


@click.command("audio-cleanup-deleted")
@click.option("--watch", is_flag=True, help="Retry expired deletion jobs every 30 seconds.")
@with_appcontext
def cleanup_command(watch):
    """Purge deleted sessions after outstanding upload URLs have expired."""
    while True:
        try:
            cleaned = cleanup_deleted_sessions()
        except SQLAlchemyError:
            db.session.rollback()
            if not watch:
                raise click.ClickException("Không truy cập được database để dọn phiên đã xóa.") from None
            click.echo("Deleted session cleanup: database unavailable; retrying later.")
            cleaned = 0
        if cleaned or not watch:
            click.echo(f"Deleted session cleanup: {cleaned}")
        if not watch:
            return
        db.session.remove()
        time.sleep(30)

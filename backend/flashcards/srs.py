"""FSRS-6 scheduling. Dates shown to learners use the Vietnam study day."""
from datetime import datetime, time, timedelta, timezone
import hashlib
import uuid
from zoneinfo import ZoneInfo

import click
from flask import g, jsonify, request
from fsrs import Card, Rating, Scheduler
from sqlalchemy import case, func, select

from api_errors import ApiError
from auth.security import require_auth
from extensions import db
from .models import FlashcardDeck, FlashcardReminderPreference, FlashcardReviewLog, FlashcardSchedule, FlashcardSession
from .routes import bp, body, locked_user, public_session, timestamp

STUDY_ZONE = ZoneInfo('Asia/Ho_Chi_Minh')
DAY_MS = 86400000


def utc_now():
    return datetime.now(timezone.utc)


def millis(value):
    return int(value.timestamp() * 1000)


def scheduler():
    # Keep minute learning/relearning steps. No hand-written interval multipliers.
    return Scheduler(desired_retention=0.9, enable_fuzzing=False)


def rating_options(user_id, card, reviewed_at):
    """Preview the current card without changing its memory or review history."""
    key = card.get('srs_id', card['id'])
    state = db.session.get(FlashcardSchedule, (user_id, key))
    instant = datetime.fromtimestamp(reviewed_at / 1000, timezone.utc)
    memory = Card.from_dict(state.fsrs_card) if state else Card(
        card_id=int.from_bytes(hashlib.sha256(key.encode()).digest()[:6], 'big'), due=instant)
    engine = scheduler()
    return [{'grade': grade, 'due_at': millis(engine.review_card(
        memory, Rating(grade + 1), review_datetime=instant)[0].due)} for grade in range(4)]


def schedule_rating(session, card, grade, reviewed_at):
    key = card.get('srs_id', card['id'])
    state = db.session.get(FlashcardSchedule, (session.user_id, key))
    instant = datetime.fromtimestamp(reviewed_at / 1000, timezone.utc)
    if state is None:
        # Stable numeric identity for FSRS logs, including lesson/favorite views.
        identifier = int.from_bytes(hashlib.sha256(key.encode()).digest()[:6], 'big')
        memory = Card(card_id=identifier, due=instant)
        state = FlashcardSchedule(user_id=session.user_id, card_id=key,
            card={**card, 'id': key}, fsrs_card={}, due_at=reviewed_at,
            last_review_at=reviewed_at, review_count=0, active=True)
        if session.kind == 'custom' and not session.deck_id.startswith('review:'):
            deck = db.session.get(FlashcardDeck, session.deck_id)
            state.active = bool(deck and any(item['id'] == key for item in deck.cards))
        db.session.add(state)
    else:
        memory = Card.from_dict(state.fsrs_card)
        if reviewed_at < state.last_review_at:
            raise ApiError('Thời điểm ôn không hợp lệ. Hãy tải lại phiên học.', 409)
    memory, log = scheduler().review_card(memory, Rating(grade + 1), review_datetime=instant)
    state.card = {**card, 'id': key}
    state.fsrs_card = memory.to_dict()
    state.due_at = millis(memory.due)
    state.last_review_at = reviewed_at
    state.review_count += 1
    db.session.add(FlashcardReviewLog(id=str(uuid.uuid4()), user_id=session.user_id,
        card_id=key, session_id=session.id, grade=grade, reviewed_at=reviewed_at,
        due_at=state.due_at, fsrs_log=log.to_dict()))


def due_query(user_id, at=None):
    return select(FlashcardSchedule).where(FlashcardSchedule.user_id == user_id,
        FlashcardSchedule.active.is_(True), FlashcardSchedule.due_at <= millis(at or utc_now()))


def due_count(user_id, at=None):
    return db.session.scalar(select(func.count()).select_from(due_query(user_id, at).subquery()))


def due_today_count(user_id, at=None):
    today = (at or utc_now()).astimezone(STUDY_ZONE).date()
    end = datetime.combine(today + timedelta(days=1), time.min, STUDY_ZONE)
    return due_count(user_id, end - timedelta(milliseconds=1))


def next_due_time(user_id):
    return db.session.scalar(select(func.min(FlashcardSchedule.due_at)).where(
        FlashcardSchedule.user_id == user_id, FlashcardSchedule.active.is_(True)))


def prune_due_session(session):
    """A second session/device may already have reviewed some snapshot cards."""
    if session.deck_id != 'review:due' or session.finished_at is not None:
        return
    due_ids = set(db.session.scalars(due_query(session.user_id).with_only_columns(FlashcardSchedule.card_id)))
    session.cards = [card for card in session.cards if card['id'] in session.ratings or card['id'] in due_ids]
    if len(session.ratings) == len(session.cards):
        session.finished_at = timestamp()


@bp.post('/due-review')
@require_auth
def start_due_review():
    locked_user()
    existing = db.session.scalar(select(FlashcardSession).where(FlashcardSession.user_id == g.user.id,
        FlashcardSession.deck_id == 'review:due', FlashcardSession.finished_at.is_(None))
        .order_by(FlashcardSession.started_at.desc()).limit(1))
    if existing:
        prune_due_session(existing)
        if existing.finished_at is None:
            db.session.commit()
            return jsonify(public_session(existing))
    states = list(db.session.scalars(due_query(g.user.id).order_by(
        FlashcardSchedule.due_at, FlashcardSchedule.card_id).limit(100)))
    if not states:
        # Commit a stale session's completion even when all its cards moved ahead.
        db.session.commit()
        raise ApiError('Hiện chưa có thẻ đến hạn. Bạn có thể xem lịch ôn sắp tới.', 409)
    session = FlashcardSession(id=str(uuid.uuid4()), user_id=g.user.id, kind='custom',
        deck_id='review:due', title='Ôn thẻ đến hạn', cards=[state.card for state in states],
        ratings={}, started_at=timestamp())
    db.session.add(session)
    db.session.commit()
    return jsonify(public_session(session)), 201


def reminder_preference(user_id):
    row = db.session.get(FlashcardReminderPreference, user_id)
    return {'enabled': row.enabled if row else False, 'hour': row.hour if row else 19,
        'minute': row.minute if row else 0}


@bp.put('/reminder')
@require_auth
def update_reminder():
    data = body()
    enabled, hour, minute = data.get('enabled'), data.get('hour'), data.get('minute')
    if type(enabled) is not bool or type(hour) is not int or type(minute) is not int or not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ApiError('Chọn giờ nhắc hợp lệ (00:00–23:59).')
    locked_user()
    row = db.session.get(FlashcardReminderPreference, g.user.id)
    if row is None:
        row = FlashcardReminderPreference(user_id=g.user.id)
        db.session.add(row)
    row.enabled, row.hour, row.minute = enabled, hour, minute
    db.session.commit()
    return jsonify(reminder_preference(g.user.id))


def schedule_summary(user_id, days=30):
    now = utc_now()
    today = now.astimezone(STUDY_ZONE).date()
    start = millis(datetime.combine(today, time.min, STUDY_ZONE))
    end = start + days * DAY_MS
    base = [FlashcardSchedule.user_id == user_id, FlashcardSchedule.active.is_(True)]
    # Group in SQL rather than loading every card's memory into the API process.
    bucket = case((FlashcardSchedule.due_at < start, 0),
        else_=func.floor((FlashcardSchedule.due_at - start) / DAY_MS))
    counts = dict(db.session.execute(select(bucket, func.count()).where(
        *base, FlashcardSchedule.due_at < end).group_by(bucket)).all())
    overdue = db.session.scalar(select(func.count()).select_from(FlashcardSchedule).where(
        *base, FlashcardSchedule.due_at < start))
    total = db.session.scalar(select(func.count()).select_from(FlashcardSchedule).where(*base))
    next_due = next_due_time(user_id)
    reviewed_today = db.session.scalar(select(func.count(func.distinct(FlashcardReviewLog.card_id))).where(
        FlashcardReviewLog.user_id == user_id, FlashcardReviewLog.reviewed_at >= start,
        FlashcardReviewLog.reviewed_at <= millis(now)))
    preference = reminder_preference(user_id)
    # One reminder per day; include outstanding cards from prior days. Dates with
    # zero due cards are omitted, and overdue cards remain eligible on later days.
    reminder_start = start + (preference['hour'] * 60 + preference['minute']) * 60000
    reminder_bucket = case((FlashcardSchedule.due_at <= reminder_start, 0),
        else_=func.ceil((FlashcardSchedule.due_at - reminder_start) / DAY_MS))
    arrivals = dict(db.session.execute(select(reminder_bucket, func.count()).where(
        *base, FlashcardSchedule.due_at <= reminder_start + (days - 1) * DAY_MS)
        .group_by(reminder_bucket)).all())
    reminders, cumulative = [], 0
    for index in range(days):
        cumulative += arrivals.get(index, 0)
        at = reminder_start + index * DAY_MS
        if preference['enabled'] and cumulative and at > millis(now):
            reminders.append({'id': f'flashcard:{today + timedelta(days=index)}',
                'at': at, 'count': cumulative})
    return {'timezone': 'Asia/Ho_Chi_Minh', 'today': today.isoformat(),
        'due_count': due_count(user_id, now), 'overdue_count': overdue,
        'today_count': counts.get(0, 0), 'reviewed_today_count': reviewed_today,
        'scheduled_count': total, 'next_due_at': next_due,
        'days': [{'date': (today + timedelta(days=index)).isoformat(), 'count': counts.get(index, 0)}
            for index in range(days)], 'reminder': preference, 'reminders': reminders}


@bp.get('/schedule')
@require_auth
def get_schedule():
    try:
        days = int(request.args.get('days', 30))
    except (ValueError, TypeError):
        raise ApiError('Số ngày không hợp lệ.') from None
    if not 1 <= days <= 90:
        raise ApiError('Chọn từ 1 đến 90 ngày.')
    return jsonify(schedule_summary(g.user.id, days))


def register_commands(app):
    @app.cli.command('backfill-flashcard-srs')
    def backfill():
        """Replay original pre-FSRS session ratings once, without inventing times."""
        rows = list(db.session.scalars(select(FlashcardSession).order_by(
            FlashcardSession.started_at, FlashcardSession.id)))
        events = []
        for session in rows:
            for card in session.cards:
                # Older review snapshots used random IDs and cannot safely be
                # associated with original cards. New ones preserve srs_id.
                if session.deck_id.startswith('review:') and 'srs_id' not in card:
                    continue
                key = card.get('srs_id', card['id'])
                if card['id'] in session.ratings and not db.session.scalar(select(FlashcardReviewLog.id).where(
                        FlashcardReviewLog.session_id == session.id, FlashcardReviewLog.card_id == key)):
                    at = (session.rating_times or {}).get(card['id'], session.started_at)
                    events.append((at, session.id, card['id'], session, card))
        count = 0
        for at, _, _, session, card in sorted(events, key=lambda event: event[:3]):
            # Serialize with interactive reviews on PostgreSQL.
            from auth.models import User
            db.session.execute(select(User.id).where(User.id == session.user_id).with_for_update())
            state = db.session.get(FlashcardSchedule, (session.user_id, card.get('srs_id', card['id'])))
            if state and state.last_review_at > at:
                continue
            schedule_rating(session, card, session.ratings[card['id']], at)
            db.session.flush()
            count += 1
        db.session.commit()
        click.echo(f'Đã chuyển {count} lượt ôn sang FSRS.')

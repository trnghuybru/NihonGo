"""Home review suggestions and one durable multiple-choice quiz per Vietnam day."""
from datetime import datetime
import random
import re
import unicodedata
import uuid
from zoneinfo import ZoneInfo

from flask import g, jsonify
from sqlalchemy import select

from api_errors import ApiError
from auth.security import require_auth
from extensions import db
from .models import FlashcardDailyQuiz, FlashcardSession
from .routes import bp, body, locked_user, public_session, session_row, timestamp


def today():
    return datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()


def normalized(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def recent_cards():
    # Bound snapshot reads; merge words across decks and their subsequent reviews.
    sessions = list(db.session.scalars(select(FlashcardSession).where(
        FlashcardSession.user_id == g.user.id).order_by(
        FlashcardSession.started_at.desc(), FlashcardSession.id.desc()).limit(30)))
    entries = {}
    for session in sessions:
        for card in session.cards:
            key = (normalized(card['front']), normalized(card.get('reading', '')))
            grade = session.ratings.get(card['id'])
            rated_at = (session.rating_times or {}).get(card['id'], session.started_at)
            if key not in entries:
                entries[key] = {'card': card, 'grade': grade, 'pool': session.id, 'rated_at': rated_at if grade is not None else 0}
            elif grade is not None and rated_at > entries[key]['rated_at']:
                # An ungraded new session must not erase an earlier self-rating.
                entries[key]['grade'] = grade
                entries[key]['rated_at'] = rated_at
    return sessions, list(entries.values())


def senses(value):
    return {term for part in re.split(r'[;；,，/\n]', value)
            if (term := normalized(part).strip(' .!?…。:'))}


def quiz_questions(entries):
    # Bound comparison work even when many imported cards share overlapping meanings.
    eligible = [entry for entry in entries if 0 < len(entry['card']['back']) <= 160 and
                len(entry['card']['front']) <= 80 and '· Anh' not in entry['card']['back']][:500]
    eligible = [{**entry, 'senses': senses(entry['card']['back']),
                 'front_key': normalized(entry['card']['front'])} for entry in eligible]
    rng = random.Random(f'{g.user.id}:{today().isoformat()}')
    targets = [entry for entry in eligible if entry['grade'] is not None]
    rng.shuffle(targets)
    targets.sort(key=lambda entry: 0 if entry['grade'] < 2 else 1)
    questions = []
    used_fronts = set()
    for entry in targets:
        card = entry['card']
        front = entry['front_key']
        if front in used_fronts:
            continue
        candidates = [other for other in eligible if other['front_key'] != front]
        rng.shuffle(candidates)
        candidates.sort(key=lambda other: other['pool'] != entry['pool'])
        meanings = set(entry['senses'])
        distractors = []
        for other in candidates:
            other_senses = other['senses']
            if not other_senses or meanings & other_senses:
                continue
            distractors.append(other['card']['back'])
            meanings |= other_senses
            if len(distractors) == 3:
                break
        if len(distractors) != 3:
            continue
        correct_id = str(uuid.uuid4())
        options = [{'id': correct_id, 'text': card['back']}] + [
            {'id': str(uuid.uuid4()), 'text': meaning} for meaning in distractors]
        rng.shuffle(options)
        questions.append({'id': str(uuid.uuid4()), 'card': card, 'options': options, 'correct_id': correct_id})
        used_fronts.add(front)
        if len(questions) == 5:
            break
    return questions


def quiz_row(identifier, lock=False):
    query = select(FlashcardDailyQuiz).where(FlashcardDailyQuiz.id == identifier,
        FlashcardDailyQuiz.user_id == g.user.id)
    if lock:
        query = query.with_for_update()
    row = db.session.scalar(query)
    if row is None:
        raise ApiError('Không tìm thấy thử thách.', 404)
    return row


def public_quiz(row):
    questions = []
    for question in row.questions:
        item = {'id': question['id'], 'front': question['card']['front'], 'options': question['options']}
        selected = row.answers.get(question['id'])
        if selected is not None:
            item['answer'] = {'selected_id': selected, 'correct_id': question['correct_id'],
                'correct': selected == question['correct_id'], 'reading': question['card'].get('reading', ''),
                'meaning': question['card']['back']}
        questions.append(item)
    return {'id': row.id, 'date': row.study_date.isoformat(), 'total': len(questions),
        'answered': len(row.answers), 'correct': sum(q['correct_id'] == row.answers.get(q['id']) for q in row.questions),
        'finished_at': row.finished_at, 'questions': questions}


@bp.get('/home')
@require_auth
def home():
    from .srs import due_count, due_today_count, next_due_time
    _, entries = recent_cards()
    active = db.session.scalar(select(FlashcardSession).where(FlashcardSession.user_id == g.user.id,
        FlashcardSession.finished_at.is_(None)).order_by(FlashcardSession.started_at.desc()).limit(1))
    weak = sum(entry['grade'] is not None and entry['grade'] < 2 for entry in entries)
    quiz = db.session.scalar(select(FlashcardDailyQuiz).where(FlashcardDailyQuiz.user_id == g.user.id,
        FlashcardDailyQuiz.study_date == today()))
    return jsonify({'active_session': {'id': active.id, 'title': active.title,
        'remaining': len(active.cards) - len(active.ratings)} if active else None,
        'due_count': due_count(g.user.id),
        'today_count': due_today_count(g.user.id), 'next_due_at': next_due_time(g.user.id),
        'weak_count': weak, 'learned_count': sum(entry['grade'] is not None for entry in entries),
        'quiz': {'id': quiz.id, 'total': len(quiz.questions), 'answered': len(quiz.answers),
            'correct': public_quiz(quiz)['correct'], 'finished': quiz.finished_at is not None} if quiz else None,
        'quiz_available': len(quiz.questions) if quiz else len(quiz_questions(entries))})


@bp.post('/daily-quiz')
@require_auth
def start_quiz():
    locked_user()
    row = db.session.scalar(select(FlashcardDailyQuiz).where(FlashcardDailyQuiz.user_id == g.user.id,
        FlashcardDailyQuiz.study_date == today()))
    if row is None:
        _, entries = recent_cards()
        questions = quiz_questions(entries)
        if not questions:
            raise ApiError('Hãy học thêm flashcard có ít nhất 4 nghĩa khác nhau để mở thử thách.', 409)
        row = FlashcardDailyQuiz(id=str(uuid.uuid4()), user_id=g.user.id, study_date=today(),
            questions=questions, answers={}, started_at=timestamp())
        db.session.add(row)
        db.session.commit()
    return jsonify(public_quiz(row))


@bp.post('/daily-quiz/<identifier>/answer')
@require_auth
def answer_quiz(identifier):
    data = body()
    question_id, option_id = data.get('question_id'), data.get('option_id')
    if not isinstance(question_id, str) or not isinstance(option_id, str):
        raise ApiError('Chọn đáp án hợp lệ.')
    locked_user()
    row = quiz_row(identifier, lock=True)
    question = next((q for q in row.questions if q['id'] == question_id), None)
    if not question or option_id not in {option['id'] for option in question['options']}:
        raise ApiError('Đáp án không thuộc câu hỏi này.')
    if question_id in row.answers:
        if row.answers[question_id] != option_id:
            raise ApiError('Câu hỏi này đã được trả lời.', 409)
        return jsonify(public_quiz(row))
    current = next((q for q in row.questions if q['id'] not in row.answers), None)
    if row.finished_at or current['id'] != question_id:
        raise ApiError('Câu hỏi không phải lượt hiện tại.', 409)
    row.answers = {**row.answers, question_id: option_id}
    if len(row.answers) == len(row.questions):
        row.finished_at = timestamp()
    db.session.commit()
    return jsonify(public_quiz(row))


@bp.post('/review')
@require_auth
def start_review():
    data = body()
    mode = data.get('mode', 'weak')
    if mode not in ('weak', 'quiz', 'repeat'):
        raise ApiError('Chọn nội dung ôn tập hợp lệ.')
    locked_user()
    review_title = 'Ôn tập hôm nay'
    if mode == 'repeat':
        identifier = data.get('session_id')
        if not isinstance(identifier, str):
            raise ApiError('Chọn phiên cần ôn lại.')
        source = session_row(identifier)
        if not source.deck_id.startswith('review:'):
            raise ApiError('Phiên này không phải lượt ôn tập.')
        if source.finished_at is None:
            return jsonify(public_session(source))
        cards, deck_id, review_title = source.cards, source.deck_id, source.title
    elif mode == 'quiz':
        identifier = data.get('quiz_id')
        if not isinstance(identifier, str):
            raise ApiError('Chọn thử thách cần ôn lại.')
        quiz = quiz_row(identifier)
        if quiz.finished_at is None:
            raise ApiError('Hoàn thành thử thách trước khi ôn lại.', 409)
        cards = [q['card'] for q in quiz.questions if quiz.answers.get(q['id']) != q['correct_id']]
        deck_id = f'review:quiz:{quiz.id}'
        review_title = 'Ôn lại câu sai'
    else:
        _, entries = recent_cards()
        cards = [entry['card'] for entry in entries if entry['grade'] is not None and entry['grade'] < 2][:50]
        deck_id = 'review:weak'
    existing = db.session.scalar(select(FlashcardSession).where(FlashcardSession.user_id == g.user.id,
        FlashcardSession.deck_id == deck_id, FlashcardSession.finished_at.is_(None)).order_by(
        FlashcardSession.started_at.desc()).limit(1))
    if existing:
        return jsonify(public_session(existing))
    if not cards:
        raise ApiError('Chưa có từ cần ôn trong mục này.', 409)
    row = FlashcardSession(id=str(uuid.uuid4()), user_id=g.user.id, kind='custom', deck_id=deck_id,
        title=review_title,
        cards=[{**card, 'srs_id': card.get('srs_id', card['id']), 'id': str(uuid.uuid4())} for card in cards],
        ratings={}, started_at=timestamp())
    db.session.add(row)
    db.session.commit()
    return jsonify(public_session(row)), 201

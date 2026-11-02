"""Authoritative game rules. All mutations require the room's database row lock."""
import copy
import re
import secrets
import time
import unicodedata
import uuid
from sqlalchemy import select
from api_errors import ApiError
from extensions import db
from vocabulary.models import JLPT_LEVELS, VocabularyLesson, VocabularyTextbook, VocabularyWord
from .models import GameRoom


def millis():
    return int(time.time() * 1000)


def normalize(value):
    value = unicodedata.normalize('NFKC', value).strip().lower()
    value = ''.join(chr(ord(c)-0x60) if '\u30a1' <= c <= '\u30f6' else c for c in value)
    return ''.join(c for c in value if not c.isspace() and unicodedata.category(c)[0] not in ('P', 'Z'))


def readings(value):
    result = []
    for part in re.split(r'[/／、,;；]', value):
        part = re.sub(r'[（(].*?[）)]', '', part).strip('〜～~ ')
        kana = normalize(part)
        if re.fullmatch(r'[\u3041-\u3096ー]+', kana) and kana not in result:
            result.append(kana)
    return result


def word_pool(level, lesson_id=None):
    query = select(VocabularyWord).join(VocabularyLesson).join(VocabularyTextbook).where(VocabularyTextbook.level == level)
    if lesson_id:
        query = query.where(VocabularyLesson.id == lesson_id)
    pool = {}
    for word in db.session.scalars(query.order_by(VocabularyWord.id)):
        accepted = readings(word.reading)
        if not word.word.strip() or not accepted:
            continue
        key = normalize(word.word)
        if key not in pool:
            pool[key] = {'id': word.id, 'word': word.word, 'meaning': word.meaning_vi, 'reading': word.reading, 'accepted': []}
        pool[key]['accepted'] = list(dict.fromkeys(pool[key]['accepted'] + accepted))
    return list(pool.values())


def mutate(row, state):
    row.state = state
    row.version += 1
    row.updated_at = millis()
    row.status = state['phase']


def locked(code, user_id=None):
    row = db.session.scalar(select(GameRoom).where(GameRoom.code == code.upper()).with_for_update().execution_options(populate_existing=True))
    if not row:
        raise ApiError('Không tìm thấy phòng chơi.', 404, 'room_not_found')
    if row.expires_at <= millis():
        raise ApiError('Phòng chơi đã hết hạn.', 410, 'room_expired')
    if user_id is not None and not any(p['id'] == user_id and (not p['left'] or row.status == 'finished') for p in row.state['players']):
        raise ApiError('Bạn không ở trong phòng này.', 403, 'room_forbidden')
    return row, copy.deepcopy(row.state)


def new_question(state, at):
    index = state.get('index', -1) + 1
    if index >= len(state['questions']):
        state.update(phase='finished', deadline=None)
        return
    state.update(index=index, phase='question', round_id=str(uuid.uuid4()), holder=None,
                 attempts=[], sequence=0, deadline=at + state['seconds'] * 1000, result=None,
                 question_started_at=at, buzzed_at=None)


def conclude(state, at, technical_error=None):
    state['phase'] = 'results'
    state['deadline'] = at + 4500
    question = state['questions'][state['index']]
    state['result'] = {'word': question['word'], 'reading': question['reading'], 'meaning': question['meaning'], 'technical_error': technical_error}
    state['history'].append({'number': state['index'] + 1, **state['result'], 'attempts': copy.deepcopy(state['attempts'])})


def tick(state, mode, at):
    if state.get('deadline') is None or at < state['deadline']:
        return False
    if state['phase'] == 'countdown':
        new_question(state, at)
    elif state['phase'] == 'question':
        conclude(state, at)
    elif state['phase'] == 'reading':
        state.update(phase='judging', deadline=at + 30000)
    elif state['phase'] == 'judging':
        conclude(state, at, 'Không xử lý được âm thanh. Câu này không tính điểm.')
    elif state['phase'] == 'results':
        new_question(state, at)
    else:
        return False
    return True


def create_room(user, data):
    mode, level, source = data.get('mode'), data.get('level'), data.get('source')
    count, seconds = data.get('question_count', 10), data.get('seconds', 15)
    lesson_id = data.get('lesson_id') if source == 'lesson' else None
    if mode not in ('read', 'write') or level not in JLPT_LEVELS or source not in ('jlpt', 'lesson'):
        raise ApiError('Chọn mode chơi, cấp JLPT và nguồn từ hợp lệ.')
    if type(count) is not int or not 1 <= count <= 30 or type(seconds) is not int or seconds not in (10, 15, 20, 30):
        raise ApiError('Chọn 1–30 câu, mỗi câu 10, 15, 20 hoặc 30 giây.')
    if source == 'lesson' and (not isinstance(lesson_id, str) or not lesson_id or len(lesson_id) > 100):
        raise ApiError('Hãy chọn một bài học.')
    pool = word_pool(level, lesson_id)
    if len(pool) < count:
        raise ApiError(f'Nguồn đã chọn có {len(pool)} từ hợp lệ. Hãy giảm số câu hoặc chọn nguồn khác.', 422, 'insufficient_words')
    codes = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    for _ in range(20):
        code = ''.join(secrets.choice(codes) for _ in range(6))
        if not db.session.scalar(select(GameRoom.id).where(GameRoom.code == code)):
            break
    else:
        raise ApiError('Chưa tạo được mã phòng. Hãy thử lại.', 503)
    at = millis()
    state = {'phase': 'waiting', 'level': level, 'source': source, 'lesson_id': lesson_id,
             'seconds': seconds, 'questions': secrets.SystemRandom().sample(pool, count),
             'players': [{'id': user.id, 'name': user.name, 'ready': False, 'left': False, 'score': 0}],
             'index': -1, 'round_id': None, 'deadline': None, 'holder': None, 'attempts': [], 'history': [],
             'voice_ready_at': 0}
    row = GameRoom(id=str(uuid.uuid4()), code=code, host_id=user.id, mode=mode, status='waiting',
                   state=state, version=1, updated_at=at, expires_at=at + 2*3600000)
    db.session.add(row)
    db.session.flush()
    return row


def submit(state, user_id, answer, at, mode, technical_error=None, timing=None):
    phase = 'judging' if mode == 'read' else 'question'
    if state['phase'] != phase:
        raise ApiError('Câu hỏi đã kết thúc hoặc chưa sẵn sàng.', 409, 'round_closed')
    if any(a['user_id'] == user_id for a in state['attempts']):
        return  # A replay must never earn points twice.
    word = state['questions'][state['index']]
    correct = normalize(answer) in word['accepted'] if mode == 'write' else speech_matches(answer, word)
    state['sequence'] += 1
    rank = 1 + sum(a['correct'] for a in state['attempts']) if correct else None
    points = (10 if mode == 'read' else max(1, 12 - 2*rank)) if correct and not technical_error else 0
    response_ms = None
    if mode == 'read' and timing and timing.get('speech_ended_at') and state.get('question_started_at'):
        # Measure the actual answer, never the STT request latency or client clock.
        response_ms = max(0, timing['speech_ended_at'] - state['question_started_at'])
    state['attempts'].append({'user_id': user_id, 'answer': answer, 'correct': bool(correct and not technical_error),
                              'rank': rank if not technical_error else None, 'points': points, 'sequence': state['sequence'],
                              'response_ms': response_ms, 'spoken_ms': (timing or {}).get('spoken_ms')})
    next(p for p in state['players'] if p['id'] == user_id)['score'] += points
    active_ids = {p['id'] for p in state['players'] if not p['left']}
    if mode == 'read' or active_ids <= {a['user_id'] for a in state['attempts']}:
        conclude(state, at, technical_error)


def speech_matches(answer, word):
    text = normalize(answer)
    if text in word['accepted'] or text == normalize(word['word']):
        return True
    # STT commonly emits kanji. Compare the recognized reading without supplying the target as a prompt.
    if text:
        from shadowing.morphology import tokenizer
        tokens = tokenizer().tokenize(text)
        return normalize(''.join(t.reading_form() for t in tokens)) in word['accepted']
    return False


def public_room(row):
    state = row.state
    revealed = state['phase'] in ('results', 'finished', 'closed')
    question = None
    if state['index'] >= 0 and state['phase'] != 'finished':
        q = state['questions'][state['index']]
        question = {'word': q['word']}
        if revealed:
            question.update(reading=q['reading'], meaning=q['meaning'])
    return {'id': row.id, 'code': row.code, 'host_id': row.host_id, 'mode': row.mode, 'version': row.version,
            'phase': state['phase'], 'level': state['level'], 'source': state['source'], 'lesson_id': state['lesson_id'],
            'question_count': len(state['questions']), 'seconds': state['seconds'], 'number': max(0, state['index'] + 1),
            'round_id': state['round_id'], 'deadline': state['deadline'], 'server_time': millis(),
            'holder': state['holder'], 'voice_ready': state.get('voice_ready_at', 0) > millis()-10000,
            'players': [{**p, 'submitted': any(a['user_id'] == p['id'] for a in state['attempts'])} for p in state['players']],
            'question': question, 'result': state.get('result') if revealed else None,
            'attempts': state['attempts'] if revealed else [], 'history': state['history'] if state['phase'] == 'finished' else []}

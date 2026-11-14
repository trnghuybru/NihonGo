"""Luật Công thành online. Chỉ gọi khi đã khóa hàng GameRoom."""
import copy
import math
import secrets
import uuid
from sqlalchemy import select
from api_errors import ApiError
from auth.models import User
from extensions import db
from vocabulary.models import JLPT_LEVELS, VocabularyLesson, VocabularyTextbook
from .models import GameRoom
from . import engine

TIERS = [(18, 7, 90), (28, 10, 104), (42, 15, 125), (65, 22, 138)]
MAX_TIME, LEFT, RIGHT, GRACE = 180000, 130, 1070, 20000
RNG = secrets.SystemRandom()


def member(user, at):
    return dict(id=user.id, name=user.name, ready=False, left=False, last_seen=at,
                hp=100, energy=0, combo=0, bestCombo=0, correct=0, wrong=0, missed=0,
                responses=[], shieldUntil=0, cooldownUntil=0, choice=None, mistakes=[])


def emit(s, kind, **data):
    s['sequence'] += 1
    s['events'].append(dict(kind=kind, seq=s['sequence'], at=s['now'], **data))
    s['events'] = s['events'][-60:]


def question(word, pool, number, kind):
    key = 'hiragana' if kind == 'reading' else 'meaning' if kind == 'meaning' else 'kanji'
    options = [word[key]]
    candidates = RNG.sample(pool, len(pool))
    candidates.sort(key=lambda w: w['category'] != word['category'])
    for candidate in candidates:
        if kind == 'kanji' and candidate['hiragana'] == word['hiragana']:
            continue
        if kind == 'reverse' and candidate['meaning'] == word['meaning']:
            continue
        if candidate[key] not in options:
            options.append(candidate[key])
        if len(options) == 4:
            break
    if len(options) != 4:
        raise ApiError('Bộ từ chưa đủ 4 đáp án khác nhau cho mỗi dạng câu hỏi.', 422, 'insufficient_words')
    RNG.shuffle(options)
    return dict(id=number, word=word, kind=kind, prompt=word['hiragana'] if kind == 'kanji' else word['meaning'] if kind == 'reverse' else word['kanji'],
                reading=word['hiragana'] if kind == 'meaning' else None,
                instruction={'reading': 'Chọn cách đọc đúng', 'kanji': 'Chọn từ tiếng Nhật',
                             'meaning': 'Chọn nghĩa tiếng Việt', 'reverse': 'Chọn từ tương ứng'}[kind],
                options=options, correct=options.index(word[key]))


def create(user, data, at, *, state_only=False):
    level, source, seconds = data.get('level', 'N5'), data.get('source', 'starter'), data.get('round_seconds', 9)
    topic, lesson_id = data.get('topic', 'Tất cả'), data.get('lesson_id')
    if level not in JLPT_LEVELS or source not in ('starter', 'lesson') or type(seconds) is not int or seconds not in (8, 9, 10):
        raise ApiError('Chọn trình độ, nguồn từ và thời gian hợp lệ.')
    if source == 'starter':
        if topic != 'Tất cả':
            raise ApiError('Chủ đề không hợp lệ.')
        pool = [dict(id=w['id'], kanji=w['word'], hiragana=w['accepted'][0],
                     meaning=w['meaning'], romaji='', level=level, category='Kho từ NihonGO')
                for w in engine.word_pool(level) if w['meaning'].strip()][:240]
        targets = pool
    else:
        if not isinstance(lesson_id, str) or len(lesson_id) > 100:
            raise ApiError('Hãy chọn bài học.')
        lesson = db.session.scalar(select(VocabularyLesson).join(VocabularyTextbook).where(
            VocabularyLesson.id == lesson_id, VocabularyTextbook.level == level))
        if not lesson:
            raise ApiError('Không tìm thấy bài học ở trình độ này.', 404)
        pool = [dict(id=w['id'], kanji=w['word'], hiragana=w['accepted'][0], meaning=w['meaning'],
                     romaji='', level=level, category=lesson.title)
                for w in engine.word_pool(level, lesson_id) if w['meaning'].strip()][:240]
        targets = pool
    if len(pool) < 4:
        raise ApiError('Cần ít nhất 4 từ hợp lệ.', 422)
    kinds = ['reading', 'kanji', 'meaning', 'reverse']
    playable = []
    for word in targets:
        try:
            for kind in kinds:
                question(word, pool, 0, kind)
            playable.append(word)
        except ApiError:
            pass
    if not playable:
        raise ApiError('Bộ từ chưa đủ đáp án khác nhau.', 422)
    questions, bag, types = [], [], []
    for i in range(60):
        if not bag:
            bag = RNG.sample(playable, len(playable))
        if not types:
            types = RNG.sample(kinds, 4)
        questions.append(question(bag.pop(), pool, i + 1, types.pop()))
    state = dict(game='castle', phase='waiting', level=level, source=source, topic=topic if source == 'starter' else '',
                 lesson_id=lesson_id if source == 'lesson' else None, round_seconds=seconds,
                 players=[member(user, at)], questions=questions, now=0, round=0, deadline=0,
                 startedAt=0, finishedAt=0, last_tick=at, ending_at=0, resolutionAt=None,
                 winner=None, reason='', troops=[], events=[], sequence=0, next_troop=0, hitStopUntil=0)
    if state_only:
        return state
    # Dùng cùng bảng/mã phòng của game hiện có; discriminator nằm trong JSON,
    # giữ nguyên constraint mode read/write và không cần đổi schema production.
    db.session.execute(select(User.id).where(User.id == user.id).with_for_update())
    active = list(db.session.scalars(select(GameRoom).where(GameRoom.host_id == user.id,
        GameRoom.status.notin_(('finished', 'closed')), GameRoom.expires_at > at)))
    if len(active) >= 3:
        raise ApiError('Bạn đã có 3 phòng đang mở.', 409)
    for _ in range(20):
        code = ''.join(RNG.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
        if not db.session.scalar(select(GameRoom.id).where(GameRoom.code == code)):
            break
    else:
        raise ApiError('Chưa tạo được mã phòng.', 503)
    row = GameRoom(id=str(uuid.uuid4()), code=code, host_id=user.id, mode='write',
                   status='waiting', state=state, version=1, updated_at=at, expires_at=at + 7200000)
    db.session.add(row)
    db.session.flush()
    return row


def finish(s, reason, winner='hp'):
    if s['phase'] in ('ending', 'finished', 'closed'):
        return
    if winner == 'hp':
        winner = None if s['players'][0]['hp'] == s['players'][1]['hp'] else int(s['players'][1]['hp'] > s['players'][0]['hp'])
    s.update(phase='ending', finishedAt=s['now'], ending_at=s['now'] + 1000, winner=winner, reason=reason)
    emit(s, 'end', **({'side': winner} if winner is not None else {}))


def next_question(s):
    if s['round'] >= 60:
        finish(s, 'Đã hoàn thành 60 câu')
        return
    s['round'] += 1
    s.update(deadline=s['now'] + s['round_seconds'] * 1000, resolutionAt=None)
    for p in s['players']:
        p['choice'] = None
    emit(s, 'question')


def mistake(p, word):
    if not any(w['id'] == word['id'] for w in p['mistakes']):
        p['mistakes'].append(copy.deepcopy(word))


def answer(s, side, index, round_id):
    if s['phase'] != 'battle' or type(round_id) is not int or round_id != s['round']:
        raise ApiError('Câu hỏi đã thay đổi. Hãy chọn ở câu hiện tại.', 409, 'stale_round')
    if type(index) is not int or index not in range(4):
        raise ApiError('Đáp án không hợp lệ.')
    p, q = s['players'][side], s['questions'][s['round'] - 1]
    if p['choice']:
        return
    if s['now'] >= s['deadline'] or s['now'] < p['cooldownUntil']:
        raise ApiError('Đã hết lượt trả lời.', 409, 'round_closed')
    correct = index == q['correct']
    p['choice'] = dict(index=index, correct=correct)
    response = s['now'] - (s['deadline'] - s['round_seconds'] * 1000)
    p['responses'].append(response)
    if correct:
        p['correct'] += 1
        p['combo'] += 1
        p['bestCombo'] = max(p['bestCombo'], p['combo'])
        p['energy'] = min(100, p['energy'] + 22)
        tier = 3 if p['combo'] >= 10 else 2 if p['combo'] >= 5 else 1 if p['combo'] >= 3 else 0
        hp, power, speed = TIERS[tier]
        bonus = 1 + max(0, 1 - response / (s['round_seconds'] * 1000)) * .28
        s['next_troop'] += 1
        x = LEFT if side == 0 else RIGHT
        s['troops'].append(dict(id=s['next_troop'], side=side, x=x, hp=hp * bonus, maxHp=hp * bonus,
                                power=math.floor(power * bonus + .5), speed=speed * bonus, tier=tier, attackAt=s['now']))
        emit(s, 'correct', side=side)
        emit(s, 'spawn', side=side, x=x, tier=tier)
        if p['combo'] in (3, 5, 10):
            emit(s, 'tier', side=side, tier=tier, value=p['combo'])
    else:
        p['wrong'] += 1
        p.update(combo=0, cooldownUntil=s['now'] + 1000)
        mistake(p, q['word'])
        emit(s, 'wrong', side=side)
    if all(p['choice'] is not None for p in s['players']):
        s['resolutionAt'] = s['now'] + 1000


def skill(s, side, kind):
    p = s['players'][side]
    if kind not in ('arrow', 'shield'):
        raise ApiError('Kỹ năng không hợp lệ.')
    if s['phase'] != 'battle' or p['energy'] < 100:
        raise ApiError('Chưa đủ năng lượng hoặc trận đã kết thúc.', 409)
    p['energy'] = 0
    if kind == 'shield':
        p['shieldUntil'] = s['now'] + 5000
    else:
        for t in s['troops']:
            if t['side'] != side:
                t['hp'] -= 24
        s['troops'] = [t for t in s['troops'] if t['hp'] > 0]
    emit(s, kind, side=side)


def physics(s, dt):
    alive = [t for t in s['troops'] if t['hp'] > 0]
    previous = {t['id']: t['x'] for t in alive}
    for t in alive:
        direction = 1 if t['side'] == 0 else -1
        x = t['x'] + direction * t['speed'] * dt / 1000
        for enemy in alive:
            if enemy['side'] == t['side'] or direction * (previous[enemy['id']] - previous[t['id']]) < 0:
                continue
            x = min(x, previous[enemy['id']] - 28) if direction == 1 else max(x, previous[enemy['id']] + 28)
        t['x'] = max(LEFT, min(RIGHT, x))
    left = sorted((t for t in alive if t['side'] == 0), key=lambda t: -t['x'])
    right = sorted((t for t in alive if t['side'] == 1), key=lambda t: t['x'])
    engaged = set()
    for a in left:
        for b in right:
            if min(a['hp'], b['hp']) <= 0 or a['id'] in engaged or b['id'] in engaged or abs(a['x'] - b['x']) > 29:
                continue
            engaged.update((a['id'], b['id']))
            center = (a['x'] + b['x']) / 2
            a['x'], b['x'] = center - 14, center + 14
            da = a['power'] if s['now'] >= a['attackAt'] else 0
            db_ = b['power'] if s['now'] >= b['attackAt'] else 0
            a['hp'] -= db_
            b['hp'] -= da
            if da:
                a['attackAt'] = s['now'] + 430
            if db_:
                b['attackAt'] = s['now'] + 430
            if da or db_:
                emit(s, 'clash', x=center, value=max(da, db_))
                s['hitStopUntil'] = s['now'] + 50
    damage = [0, 0]
    for t in alive:
        if t['hp'] > 0 and (t['side'] == 0 and t['x'] >= RIGHT or t['side'] == 1 and t['x'] <= LEFT):
            target = 1 - t['side']
            amount = 0 if s['players'][target]['shieldUntil'] > s['now'] else t['power']
            damage[target] += amount
            t['hp'] = 0
            emit(s, 'castle', side=target, x=RIGHT if target else LEFT, value=amount)
    for i, p in enumerate(s['players']):
        p['hp'] = max(0, p['hp'] - damage[i])
    s['troops'] = [t for t in alive if t['hp'] > 0]
    if any(p['hp'] == 0 for p in s['players']):
        finish(s, 'Lâu đài đã thất thủ')


def tick(s, at):
    if s['phase'] in ('waiting', 'finished', 'closed'):
        return False
    # Heartbeat có khoảng chờ để tải lại trang/kết nối lại, không pause trận của đối thủ.
    changed = False
    if s['phase'] in ('countdown', 'battle'):
        lost = [i for i, p in enumerate(s['players']) if at - p['last_seen'] > GRACE]
        if lost:
            finish(s, 'Mất kết nối quá 20 giây', None if len(lost) == 2 else 1 - lost[0])
            changed = True
    remaining = max(0, min(240000, at - s['last_tick']))
    s['last_tick'] = at
    if not remaining:
        return changed
    while remaining > 0 and s['phase'] != 'finished':
        dt = min(20, remaining)
        remaining -= dt
        s['now'] += dt
        if s['phase'] == 'countdown':
            if s['now'] >= 3000:
                s.update(phase='battle', startedAt=s['now'])
                next_question(s)
            continue
        if s['phase'] == 'ending':
            if s['now'] >= s['ending_at']:
                s['phase'] = 'finished'
            continue
        if s['now'] - s['startedAt'] >= MAX_TIME:
            finish(s, 'Hết thời gian')
            continue
        if s['resolutionAt'] is not None and s['now'] >= s['resolutionAt']:
            next_question(s)
        if s['phase'] != 'battle':
            continue
        if s['resolutionAt'] is None and s['now'] >= s['deadline']:
            for p in s['players']:
                if p['choice'] is None:
                    p['choice'] = dict(index=None, correct=False, timeout=True)
                    p['wrong'] += 1
                    p['missed'] += 1
                    p['combo'] = 0
                    mistake(p, s['questions'][s['round'] - 1]['word'])
            s['resolutionAt'] = s['now'] + 1000
        if s['now'] >= s['hitStopUntil']:
            physics(s, dt)
    return True


def public(row, user_id):
    s = row.state
    me = next((i for i, p in enumerate(s['players']) if p['id'] == user_id), None)
    if me is None:
        raise ApiError('Bạn không ở trong phòng này.', 403)
    reveal = s['phase'] in ('ending', 'finished') or all(p['choice'] is not None for p in s['players'])
    players = []
    for i, p in enumerate(s['players']):
        item = {k: copy.deepcopy(v) for k, v in p.items() if k not in ('last_seen', 'mistakes')}
        if i != me and p['choice'] and not reveal:
            item['choice'] = dict(index=None, correct=False)
        players.append(item)
    frame = None
    if s['phase'] not in ('waiting', 'closed'):
        keys = ('phase', 'now', 'round', 'deadline', 'startedAt', 'finishedAt', 'resolutionAt',
                'winner', 'reason', 'hitStopUntil', 'troops', 'events')
        frame = {k: copy.deepcopy(s[k]) for k in keys}
        q = copy.deepcopy(s['questions'][s['round'] - 1]) if s['round'] else None
        if q and not reveal:
            q['correct'] = -1
            q['word'] = dict(id='', kanji='', hiragana='', romaji='', meaning='', level=s['level'], category='')
        frame.update(players=players, question=q, mistakes=copy.deepcopy(s['players'][me]['mistakes']))
    return dict(game='castle', id=row.id, code=row.code, host_id=row.host_id, version=row.version,
                phase=s['phase'], level=s['level'], source=s['source'], topic=s['topic'],
                lesson_id=s['lesson_id'], round_seconds=s['round_seconds'],
                players=players, me=me, frame=frame, server_time=engine.millis())

import time

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import Integer, case, cast, func, literal, or_, select

from api_errors import ApiError
from auth.security import limit, require_auth
from auth.models import User
from extensions import db
from .models import DictionaryEntry, DictionaryHistory, DictionaryKanji, DictionarySource, DictionaryTerm
from .normalize import normalize, romaji_to_kana
from .importer import kanji_characters

bp = Blueprint('dictionary', __name__, url_prefix='/api/dictionary')


def dictionary_filter():
    return or_(DictionaryEntry.id.like('jmdict:%'), DictionaryEntry.id.like('viwiktionary:%'))


def source_priority():
    return case((DictionaryEntry.id.like('viwiktionary:%'), 0), else_=1)


def preferred_entries(statement):
    candidates = statement.with_only_columns(DictionaryEntry.id).subquery()
    ranked = select(DictionaryEntry.id, func.row_number().over(
        partition_by=(DictionaryEntry.word, DictionaryEntry.reading),
        order_by=(source_priority(), DictionaryEntry.id)).label('position')).where(
            DictionaryEntry.id.in_(select(candidates.c.id)), dictionary_filter()).subquery()
    return select(DictionaryEntry).join(ranked, ranked.c.id == DictionaryEntry.id).where(ranked.c.position == 1)


@bp.errorhandler(ApiError)
def api_error(error):
    return jsonify({'error': error.message, 'code': error.code}), error.status


def arguments():
    query = request.args.get('q', '').strip()
    try:
        page = int(request.args.get('page', 1))
        size = int(request.args.get('page_size', 20))
    except (ValueError, TypeError):
        raise ApiError('Phân trang không hợp lệ.') from None
    if not query or len(query) > 100 or not 1 <= page <= 1000 or not 1 <= size <= 40:
        raise ApiError('Nhập tối đa 100 ký tự và chọn phân trang hợp lệ.')
    queries = list(dict.fromkeys([normalize(query), normalize(romaji_to_kana(query) or query)]))
    return queries, page, size


def pattern(value):
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def word_preview(row):
    data = row.content
    # Short list previews prefer Vietnamese. Detail still preserves every sense.
    glosses = [x for sense in data['senses'] for x in sense['glosses']]
    preferred = [x for x in glosses if x['language'] == 'vi'] or [x for x in glosses if x['language'] in ('eng', 'en')]
    return {'id': row.id, 'word': row.word, 'reading': row.reading,
            'glosses': preferred[:3], 'common': row.common, 'source_id': data['source_id']}


def source_info(identifier):
    row = db.session.get(DictionarySource, identifier)
    return {'id': identifier, **row.content} if row else {'id': identifier, 'name': identifier}


@bp.get('/sources')
@require_auth
def sources():
    return jsonify({'items': [{'id': row.id, **row.content} for row in db.session.scalars(
        select(DictionarySource).where(DictionarySource.id != 'local').order_by(DictionarySource.id))]})


def matching_words(queries, vietnamese_only=False):
    terms = DictionaryTerm
    exact = terms.text.in_(queries)
    beginning = or_(*(terms.text.like(pattern(q) + '%', escape='\\') for q in queries))
    containing = or_(*(terms.text.like('%' + pattern(q) + '%', escape='\\') for q in queries))
    # A meaning match must not outrank an exact Japanese spelling/reading.
    priority = case((exact & terms.kind.in_(['spelling', 'reading']), 0),
                    (exact, 1), (beginning & terms.kind.in_(['spelling', 'reading']), 2),
                    (beginning, 3), else_=4)
    matches = select(terms.entry_id, func.min(priority).label('rank')).where(
        containing, terms.kind == 'meaning_vi' if vietnamese_only else terms.kind != 'kanji').group_by(terms.entry_id).subquery()
    # Independent Vietnamese dictionary entries take precedence over English fallback.
    ranked = select(DictionaryEntry.id, matches.c.rank,
        func.row_number().over(partition_by=(DictionaryEntry.word, DictionaryEntry.reading),
            order_by=(matches.c.rank, source_priority(), DictionaryEntry.id)).label('pair_number')).join(
        matches, matches.c.entry_id == DictionaryEntry.id).where(
        dictionary_filter()).subquery()
    return select(DictionaryEntry, ranked.c.rank).join(ranked, ranked.c.id == DictionaryEntry.id).where(ranked.c.pair_number == 1)


@bp.get('/words')
@require_auth
def words():
    queries, page, size = arguments()
    language = request.args.get('language', 'auto')
    if language not in ('auto', 'vi'):
        raise ApiError('Ngôn ngữ tra cứu không hợp lệ.')
    if language == 'vi':
        queries = [normalize(request.args['q'])]
    statement = matching_words(queries, vietnamese_only=language == 'vi')
    total = db.session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = db.session.execute(statement.order_by('rank', source_priority(), DictionaryEntry.common.desc(),
        func.length(DictionaryEntry.word), DictionaryEntry.word, DictionaryEntry.id)
        .offset((page - 1) * size).limit(size))
    return jsonify({'items': [{**word_preview(row),
                              'match_type': 'exact' if rank <= 1 else 'prefix' if rank <= 3 else 'contains'}
                             for row, rank in rows],
        'pagination': {'page': page, 'page_size': size, 'total': total,
                       'total_pages': (total + size - 1) // size}})


@bp.get('/words/<entry_id>')
@require_auth
def word(entry_id):
    row = db.session.get(DictionaryEntry, entry_id)
    if row is None or not row.id.startswith(('jmdict:', 'viwiktionary:')):
        raise ApiError('Không tìm thấy mục từ.', 404, 'dictionary_word_not_found')
    characters = kanji_characters(row.word)
    kanji = {item.literal: item for item in db.session.scalars(
        select(DictionaryKanji).where(DictionaryKanji.literal.in_(characters)))}
    others = list(db.session.scalars(select(DictionaryEntry).where(DictionaryEntry.word == row.word,
        DictionaryEntry.reading == row.reading, DictionaryEntry.id != row.id,
        dictionary_filter()).order_by(source_priority(), DictionaryEntry.id).limit(10)))
    related_ids = select(DictionaryTerm.entry_id).where(DictionaryTerm.kind == 'spelling',
        DictionaryTerm.text.like('%' + pattern(normalize(row.word)) + '%', escape='\\')).distinct()
    related = db.session.scalars(preferred_entries(select(DictionaryEntry).where(DictionaryEntry.id.in_(related_ids),
        dictionary_filter(), DictionaryEntry.id != row.id,
        or_(DictionaryEntry.word != row.word, DictionaryEntry.reading != row.reading))).order_by(
        func.length(DictionaryEntry.word), DictionaryEntry.common.desc(), DictionaryEntry.word,
        DictionaryEntry.id).limit(12))
    return jsonify({**word_preview(row), **row.content, 'kanji': [x for x in characters if x in kanji],
                    'kanji_details': [kanji_preview(kanji[x]) for x in characters if x in kanji],
                    'source': source_info(row.content['source_id']),
                    'other_entries': [word_preview(other) for other in others],
                    'related_entries': [word_preview(item) for item in related]})


def kanji_preview(row):
    data = row.content
    return {'literal': row.literal, 'strokes': row.strokes, 'on': data['on'], 'kun': data['kun'],
            'han_viet': data['han_viet'],
            'meanings': [x for x in data['meanings'] if x['language'] == 'vi'] or
                        [x for x in data['meanings'] if x['language'] == 'en']}


@bp.get('/history')
@require_auth
def recent_history():
    row = db.session.get(DictionaryHistory, g.user.id)
    return jsonify({'items': row.items if row else []})


@bp.post('/history')
@require_auth
def record_history():
    limit('dictionary-history-user', g.user.id, 120, 60)
    data = request.get_json(silent=True)
    if (not isinstance(data, dict) or set(data) != {'kind', 'target'} or
            data['kind'] not in ('word', 'kanji') or not isinstance(data['target'], str) or
            not 1 <= len(data['target']) <= 80):
        raise ApiError('Mục lịch sử tra cứu không hợp lệ.')
    kind, target = data['kind'], data['target']
    if kind == 'word':
        entry = db.session.get(DictionaryEntry, target)
        if entry is None or not entry.id.startswith(('jmdict:', 'viwiktionary:')):
            raise ApiError('Không tìm thấy mục từ.', 404)
        preview = word_preview(entry)
        item = {key: preview[key] for key in ('word', 'reading', 'glosses')}
    else:
        entry = db.session.get(DictionaryKanji, target)
        if entry is None:
            raise ApiError('Không tìm thấy Hán tự.', 404)
        item = {'word': entry.literal, 'reading': ' · '.join(entry.content['han_viet']).upper(),
                'glosses': [gloss for gloss in entry.content['meanings'] if gloss['language'] == 'vi'][:3]}
    # Serialize updates across tabs/devices, including the first insertion.
    db.session.execute(select(User.id).where(User.id == g.user.id).with_for_update())
    row = db.session.get(DictionaryHistory, g.user.id)
    if row is None:
        row = DictionaryHistory(user_id=g.user.id, items=[])
        db.session.add(row)
    item.update(kind=kind, target=target, viewed_at=int(time.time() * 1000))
    row.items = [item] + [old for old in row.items
                          if (old['kind'], old['target']) != (kind, target)][:29]
    db.session.commit()
    return jsonify({'items': row.items})


@bp.delete('/history')
@require_auth
def clear_history():
    limit('dictionary-history-user', g.user.id, 120, 60)
    db.session.execute(select(User.id).where(User.id == g.user.id).with_for_update())
    row = db.session.get(DictionaryHistory, g.user.id)
    if row is not None:
        db.session.delete(row)
    db.session.commit()
    return jsonify({'items': []})


@bp.get('/kanji')
@require_auth
def kanji_search():
    queries, page, size = arguments()
    characters = kanji_characters(request.args['q'])
    exact = DictionaryKanji.literal.in_([*queries, *characters])
    match = or_(exact, *(DictionaryKanji.search_text.like('%' + pattern(q) + '%', escape='\\') for q in queries))
    statement = select(DictionaryKanji).where(match)
    total = db.session.scalar(select(func.count()).select_from(statement.subquery()))
    full_line = or_(*(('\n' + DictionaryKanji.search_text + '\n').like(
        '%\n' + pattern(q) + '\n%', escape='\\') for q in queries))
    frequency = cast(DictionaryKanji.content['frequency'].as_string(), Integer)
    rows = db.session.scalars(statement.order_by(case((exact, 0), (full_line, 1), else_=2),
        case({literal: index for index, literal in enumerate(characters)},
             value=DictionaryKanji.literal, else_=len(characters)) if characters else literal(0),
        func.coalesce(frequency, 999999), DictionaryKanji.strokes,
        DictionaryKanji.literal).offset((page - 1) * size).limit(size))
    return jsonify({'items': [kanji_preview(row) for row in rows],
        'pagination': {'page': page, 'page_size': size, 'total': total, 'total_pages': (total + size - 1) // size}})


@bp.get('/kanji/<literal>')
@require_auth
def kanji_detail(literal):
    row = db.session.get(DictionaryKanji, literal)
    if row is None:
        raise ApiError('Không tìm thấy Hán tự.', 404, 'dictionary_kanji_not_found')
    # Link compounds by actual kanji membership, not by their translated meaning.
    entries = db.session.scalars(preferred_entries(select(DictionaryEntry).join(DictionaryTerm,
        DictionaryTerm.entry_id == DictionaryEntry.id).where(DictionaryTerm.kind == 'kanji',
        DictionaryTerm.text == literal, dictionary_filter())).order_by(DictionaryEntry.common.desc(),
            func.length(DictionaryEntry.word), DictionaryEntry.word, DictionaryEntry.id).limit(20))
    result = {**kanji_preview(row), **row.content, 'source': source_info('kanjidic2'),
              'compounds': [word_preview(entry) for entry in entries]}
    if row.content.get('stroke_paths'):
        result['diagram_source'] = source_info('kanjivg')
    return jsonify(result)


@bp.post('/translate')
@require_auth
def translate_sentence():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError('Dữ liệu dịch không hợp lệ.')
    limit('sentence-translation', g.user.id, 12, 60)
    try:
        from translation.presentation import translation_view
        result = current_app.extensions['sentence_translation'].translate(
            g.user.id, data.get('text'), data.get('source', 'ja'), data.get('target', 'vi'))
        result = translation_view(result)
    except ApiError:
        raise
    except Exception:
        current_app.logger.exception('Sentence translation failed')
        raise ApiError('Không dịch được câu. Vui lòng thử lại.', 503, 'translation_failed') from None
    return jsonify(result)

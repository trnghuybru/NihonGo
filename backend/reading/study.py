"""On-demand study support, validated against exact source text and stored in the DB."""
import hashlib
import json
import os
from pathlib import Path
import re
import time
import uuid

from flask import g, current_app
from sqlalchemy import select
from api_errors import ApiError
from extensions import db
from shadowing.quiz import request_questions
from .models import ReadingInsight, ReadingPassage
from .quiz import question_set
from .study_source import anchor, sentences
from .study_prompts import prompt_for, provider_source
from .sentence_structure import sentence_structure

PROMPT_VERSION = 2
DEFAULT_MODEL = 'gemini-3.5-flash-lite'
# A reviewed application resource, never interpolated from client/source text.
METHOD_HASH = hashlib.sha256((Path(__file__).parent / 'resources' / 'reading-skill.md').read_text(encoding='utf-8').encode()).hexdigest()


def object_schema(properties):
    return {'type': 'object', 'properties': properties, 'required': list(properties)}


def provider_schema(value):
    # Nested bounded arrays make Gemini's schema automaton too complex (HTTP 400).
    # Keep the shape in the provider schema; enforce every count in normalize().
    if isinstance(value, dict):
        return {key: provider_schema(item) for key, item in value.items() if key not in ('minItems', 'maxItems')}
    if isinstance(value, list):
        return [provider_schema(item) for item in value]
    return value


STRING = {'type': 'string'}
LOCATION = object_schema({'sentence_id': STRING, 'quote': STRING})
SENTENCE_SCHEMA = object_schema({
    'sentence_id': STRING,
    'segments': {'type': 'array', 'items': object_schema({
        'text': STRING, 'role': {'type': 'string', 'enum': ['subject', 'predicate', 'object', 'modifier', 'adjunct', 'other']},
        'is_core': {'type': 'boolean'}, 'explanation': STRING})},
    'implicit_subject': STRING, 'core_translation_vi': STRING, 'translation_vi': STRING, 'caution': STRING})
ANALYSIS_SCHEMA = object_schema({
    'summary': STRING, 'caution': STRING,
    'structure': {'type': 'array', 'maxItems': 6, 'items': object_schema({'label': STRING, 'explanation': STRING, 'sentence_id': STRING})},
    'vocabulary': {'type': 'array', 'maxItems': 8, 'items': object_schema({'word': STRING, 'reading': STRING, 'meaning': STRING, 'location': LOCATION})},
    'grammar': {'type': 'array', 'maxItems': 5, 'items': object_schema({'pattern': STRING, 'explanation': STRING, 'location': LOCATION})}})
EXPLANATION_SCHEMA = object_schema({'explanation': STRING, 'answer_supported': {'type': 'boolean'}, 'caution': STRING,
    'evidence': {'type': 'array', 'minItems': 1, 'maxItems': 4, 'items': LOCATION}})


def source_for(passage, kind):
    source = {'title': passage.title, 'level': passage.level, 'original_text': passage.text,
              'paragraphs': [{'id': str(i), 'text': line} for i, line in enumerate(passage.text.split('\n'))],
              'sentences': sentences(passage.text)}
    if not source['sentences'] or len(passage.text) > 16000 or len(source['sentences']) > 300:
        raise ApiError('Bài đọc quá dài hoặc chưa có nội dung để phân tích.', 422, 'reading_source_limit')
    if kind.startswith('explanation:'):
        question = next((q for q in question_set(passage)[1] if q['id'] == kind.split(':', 1)[1]), None)
        if not question:
            raise ApiError('Không tìm thấy câu hỏi hợp lệ.', 404, 'reading_question_not_found')
        source['question'] = question
    if kind.startswith('sentence:'):
        identifier = kind.split(':', 1)[1]
        if not any(s['id'] == identifier for s in source['sentences']):
            raise ApiError('Không tìm thấy câu trong bài đọc.', 404, 'reading_sentence_not_found')
        source['requested_sentence_id'] = identifier
    return source


def fingerprint(source, kind):
    contract_version = 4 if kind.startswith('sentence:') else PROMPT_VERSION
    return hashlib.sha256(json.dumps([contract_version, METHOD_HASH, kind, source],
                                    ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def text(value, maximum=1600, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise ValueError('Invalid text')
    return value.strip()


def items(data, key, maximum, minimum=0):
    value = data[key]
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ValueError('Invalid item count')
    return value


def normalize(data, source, kind):
    if not isinstance(data, dict):
        raise ValueError('Invalid response')
    if kind.startswith('explanation:'):
        if type(data['answer_supported']) is not bool:
            raise ValueError('Invalid answer support')
        caution = text(data['caution'], empty=True)
        if not data['answer_supported'] and not caution:
            caution = 'Đáp án nguồn cần được kiểm tra lại với nội dung bài đọc.'
        return {'question_id': source['question']['id'], 'correct_index': source['question']['correct_index'],
                'explanation': text(data['explanation']), 'answer_supported': data['answer_supported'], 'caution': caution,
                'evidence': [anchor(location, source) for location in items(data, 'evidence', 4, 1)]}
    if kind.startswith('sentence:'):
        result = sentence_structure(data, source)
        if result['sentence_id'] != source['requested_sentence_id']:
            raise ValueError('Wrong requested sentence')
        return result
    return {'summary': text(data['summary'], 1200), 'caution': text(data['caution'], empty=True),
        'structure': [{'label': text(item['label'], 100), 'explanation': text(item['explanation']),
                       'location': anchor({'sentence_id': item['sentence_id'], 'quote': next(
                           s['text'] for s in source['sentences'] if s['id'] == item['sentence_id'])}, source)}
                      for item in items(data, 'structure', 6)],
        'vocabulary': [{'word': text(item['word'], 100), 'reading': text(item['reading'], 150, empty=True),
                        'meaning': text(item['meaning'], 800), 'location': anchor(item['location'], source)}
                       for item in items(data, 'vocabulary', 8)],
        'grammar': [{'pattern': text(item['pattern'], 150), 'explanation': text(item['explanation']),
                     'location': anchor(item['location'], source)} for item in items(data, 'grammar', 5)],
        'sentences': []}


def generate(source, kind):
    key = os.getenv('GEMINI_API_KEY', '').strip()
    model = os.getenv('READING_AI_MODEL', DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not key:
        raise ApiError('Chưa cấu hình Gemini cho phần đọc hiểu.', 503, 'reading_ai_unavailable')
    if not re.fullmatch(r'[a-zA-Z0-9._-]+', model):
        raise ApiError('Cấu hình model đọc hiểu chưa hợp lệ.', 503, 'reading_ai_unavailable')
    schema = EXPLANATION_SCHEMA if kind.startswith('explanation:') else SENTENCE_SCHEMA if kind.startswith('sentence:') else ANALYSIS_SCHEMA
    payload = {'systemInstruction': {'parts': [{'text': prompt_for(source, kind)}]},
        'contents': [{'role': 'user', 'parts': [{'text': json.dumps(provider_source(source, kind), ensure_ascii=False, separators=(',', ':'))}]}],
        'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 4096 if kind.startswith('sentence:') else 3000 if kind == 'analysis' else 1800,
                             'responseMimeType': 'application/json', 'responseJsonSchema': provider_schema(schema)}}
    if model.startswith('gemini-3'):
        payload['generationConfig'].pop('temperature', None)
        payload['generationConfig']['thinkingConfig'] = {'thinkingLevel': 'low' if kind.startswith('sentence:') else 'minimal'}
    deadline = time.monotonic() + 65
    for attempt in range(2):
        try:
            data = request_questions(key, model, payload, max(1, min(30, deadline - time.monotonic())))
        except ApiError as error:
            if error.code != 'quiz_invalid_response':
                if attempt == 0 and deadline - time.monotonic() > 3:
                    continue
                raise ApiError('Không kết nối được Gemini hoặc dịch vụ đang bận. Vui lòng thử lại.',
                               503, 'reading_ai_unavailable') from None
            data = None
        try:
            result = normalize(data, source, kind)
            return {**result, 'model': model, 'generated_at': int(time.time())}
        except (KeyError, ValueError, TypeError, IndexError, StopIteration):
            if attempt == 1:
                raise ApiError('Giải thích chưa hợp lệ hoặc chưa khớp bài gốc. Vui lòng thử lại.',
                               502, 'reading_ai_invalid_response') from None
            payload['contents'][0]['parts'].append({'text': 'Previous response failed validation. Use only supplied sentence IDs, exact source quotes, all required fields and valid counts. Return complete JSON.'})


def cached(passage, kind):
    try:
        source = source_for(passage, kind)
    except ApiError:
        return None
    row = db.session.get(ReadingInsight, (passage.id, kind))
    return row.payload if row and row.status == 'ready' and row.source_hash == fingerprint(source, kind) else None


def get_or_generate(passage_id, kind):
    # Commit a durable lease before the HTTP request, releasing the DB lock during inference.
    passage = db.session.scalar(select(ReadingPassage).where(ReadingPassage.id == passage_id).with_for_update())
    if passage is None:
        raise ApiError('Không tìm thấy bài đọc.', 404, 'reading_not_found')
    source = source_for(passage, kind)
    source_hash = fingerprint(source, kind)
    row = db.session.get(ReadingInsight, (passage_id, kind))
    now = int(time.time())
    if row and row.source_hash == source_hash:
        if row.status == 'ready':
            return row.payload
        if row.status == 'running' and row.updated_at > now - 120:
            raise ApiError('Nội dung này đang được chuẩn bị. Vui lòng thử lại sau ít giây.', 409, 'reading_ai_busy')
    from auth.security import limit
    limit('reading-ai', g.user.id, 12, 60)
    if row is None:
        row = ReadingInsight(passage_id=passage_id, kind=kind)
        db.session.add(row)
    lease = str(uuid.uuid4())
    row.source_hash, row.status, row.lease, row.updated_at, row.payload = source_hash, 'running', lease, now, None
    db.session.commit()
    try:
        result = generate(source, kind)
    except Exception as error:
        db.session.rollback()
        row = db.session.scalar(select(ReadingInsight).where(ReadingInsight.passage_id == passage_id,
            ReadingInsight.kind == kind).with_for_update())
        if row and row.lease == lease:
            row.status, row.lease, row.updated_at = 'failed', None, int(time.time())
            db.session.commit()
        if isinstance(error, ApiError):
            raise
        current_app.logger.exception('Reading AI processing failed')
        raise ApiError('Chưa chuẩn bị được nội dung phân tích. Vui lòng thử lại.', 503, 'reading_ai_unavailable') from None
    db.session.expire_all()
    passage = db.session.scalar(select(ReadingPassage).where(ReadingPassage.id == passage_id).with_for_update())
    row = db.session.get(ReadingInsight, (passage_id, kind))
    if not passage or not row or row.lease != lease or fingerprint(source_for(passage, kind), kind) != source_hash:
        db.session.rollback()
        raise ApiError('Bài đọc đã thay đổi. Hãy tải lại nội dung.', 409, 'reading_source_changed')
    row.payload, row.status, row.lease, row.updated_at = result, 'ready', None, int(time.time())
    db.session.commit()
    return result

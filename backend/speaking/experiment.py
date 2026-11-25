"""Opt-in LLM + Supertonic speaking transport; no Gemini Live calls."""
import base64
import binascii
import os
from flask import g, jsonify
from api_errors import ApiError
from auth.security import body, require_auth
from .routes import bp
from .conversation import TurnInput, owned_session, send_turn
from vocabulary.audio import supertonic_text_playback

MAX_AUDIO_BYTES = 16_000 * 2 * 10


def enabled():
    return os.getenv('SPEAKING_TTS_EXPERIMENT') == '1'


@bp.post('/sessions/<session_id>/experimental-transcribe')
@require_auth
def experimental_transcribe(session_id):
    if not enabled():
        raise ApiError('Thử nghiệm chỉ mở trên local.', 404, 'not_found')
    session = owned_session(g.user.id, session_id)
    if session.status != 'active':
        raise ApiError('Buổi hội thoại hiện không hoạt động.', 409, 'session_inactive')
    payload = body()
    encoded = payload.get('audio')
    if set(payload) != {'audio'} or not isinstance(encoded, str):
        raise ApiError('Dữ liệu âm thanh không hợp lệ.')
    if len(encoded) > ((MAX_AUDIO_BYTES + 2) // 3) * 4:
        raise ApiError('Bản ghi vượt quá thời lượng cho phép.', 413, 'audio_too_large')
    try:
        audio = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError('Dữ liệu âm thanh không hợp lệ.') from None
    if len(audio) > MAX_AUDIO_BYTES:
        raise ApiError('Bản ghi vượt quá thời lượng cho phép.', 413, 'audio_too_large')
    if not audio or len(audio) % 2:
        raise ApiError('Dữ liệu âm thanh không hợp lệ.')
    try:
        from services.cloud_speech import CloudSpeechRecognizer
        recognizer = CloudSpeechRecognizer()
    except RuntimeError:
        raise ApiError('Google Cloud Speech-to-Text chưa được cấu hình trên máy chủ.',
                       503, 'speech_unavailable') from None
    transcript, error = recognizer.recognize(audio)
    if error:
        message = error.removesuffix(' Câu này không tính điểm.')
        status = 503 if message.startswith('Dịch vụ') else 422
        raise ApiError(message, status, 'speech_recognition_failed')
    if not transcript:
        raise ApiError('Chưa nhận dạng được câu nói. Hãy thử lại.',
                       422, 'speech_recognition_failed')
    return jsonify({'text': transcript})


@bp.post('/sessions/<session_id>/experimental-turn')
@require_auth
def experimental_turn(session_id):
    if not enabled():
        raise ApiError('Thử nghiệm chỉ mở trên local.', 404, 'not_found')
    reply = send_turn(g.user.id, session_id, TurnInput.parse(body()), experimental=True)
    reply['audio'] = supertonic_text_playback(reply['assistant_message']['content'])
    return jsonify(reply)

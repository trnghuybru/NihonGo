"""Local-only LLM + Supertonic latency experiment; no Gemini Live calls."""
import os
import time
from flask import g, jsonify
from api_errors import ApiError
from auth.security import body, require_auth
from .routes import bp
from .conversation import TurnInput, send_turn
from vocabulary.audio import supertonic_text_playback


def enabled():
    return os.getenv('SPEAKING_TTS_EXPERIMENT') == '1' and os.getenv('APP_ENV') != 'production'


@bp.post('/sessions/<session_id>/experimental-turn')
@require_auth
def experimental_turn(session_id):
    if not enabled():
        raise ApiError('Thử nghiệm chỉ mở trên local.', 404, 'not_found')
    started = time.perf_counter()
    reply = send_turn(g.user.id, session_id, TurnInput.parse(body()), experimental=True)
    llm_done = time.perf_counter()
    # A retry reuses the saved turn and cached WAV instead of generating another reply.
    reply['audio'] = supertonic_text_playback(reply['assistant_message']['content'])
    finished = time.perf_counter()
    reply['timings'] = {'llm_ms': round((llm_done-started)*1000),
                        'tts_storage_ms': round((finished-llm_done)*1000)}
    return jsonify(reply)

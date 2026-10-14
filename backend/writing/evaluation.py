"""Gemini-backed writing assessment and response validation."""
import json
import os
import re

import requests

from api_errors import ApiError
from services.llm_service import DEFAULT_MODEL, gemini_text, gemini_url

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "corrected_text": {"type": "string", "minLength": 1, "maxLength": 20000},
        "feedback": {"type": "string", "minLength": 1, "maxLength": 4000},
    },
    "required": ["score", "corrected_text", "feedback"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are a careful Japanese-language teacher assessing a learner's submitted writing.
Assess task fulfillment, grammar, vocabulary, and naturalness at the stated JLPT level. Do not score by length alone. Japanese normally has no spaces between words, so never treat whitespace token count as Japanese word count.
Correct the writing into natural Japanese while preserving the learner's intended meaning and level. Do not invent details.
Write feedback in Vietnamese, with these four labeled sections: Điểm làm tốt, Cần cải thiện, Sửa cụ thể, Bài tập tiếp theo. Be concise but specific: quote exact phrases from the submission, explain at least one concrete grammar or word-choice point when supported, and give one actionable exercise. Do not praise or criticize something that is not present in the writing.
Return only a JSON object matching the supplied schema."""


def evaluate_writing(text, prompt_title, level, instruction=""):
    key = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
    if not key:
        raise ApiError("Chưa cấu hình GEMINI_API_KEY để nhận xét bài viết.", 503, "writing_ai_unavailable")
    if len(text) > 12000:
        raise ApiError("Bài viết quá dài để phân tích trong một lần.", 422, "writing_too_long")

    model = os.getenv("GEMINI_WRITING_MODEL", "").strip() or os.getenv("GEMINI_CHAT_MODEL", "").strip() or DEFAULT_MODEL
    if not re.fullmatch(r"[A-Za-z0-9._-]+", model):
        raise ApiError("Tên model Gemini không hợp lệ.", 503, "writing_ai_unavailable")

    essay = {
        "prompt_title": prompt_title,
        "level": level or "N5",
        "instruction": instruction,
        "submission": text,
    }
    request_body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(essay, ensure_ascii=False)}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            "responseJsonSchema": OUTPUT_SCHEMA,
        },
    }
    if model.startswith("gemini-3"):
        request_body["generationConfig"]["thinkingConfig"] = {"thinkingLevel": "minimal"}

    try:
        response = requests.post(
            gemini_url(model),
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json=request_body,
            timeout=(5, 45),
        )
        if response.status_code == 429:
            raise ApiError("AI đang giới hạn lượt nhận xét. Vui lòng thử lại sau.", 429, "writing_ai_rate_limited")
        if response.status_code in {400, 401, 403, 404}:
            raise ApiError("Model nhận xét chưa truy cập được. Hãy kiểm tra cấu hình Gemini.", 503, "writing_ai_unavailable")
        response.raise_for_status()
        result = json.loads(gemini_text(response.json()))
        if not isinstance(result, dict) or set(result) != {"score", "corrected_text", "feedback"}:
            raise ValueError("Unexpected writing assessment fields")
        score = result["score"]
        corrected_text = result["corrected_text"]
        feedback = result["feedback"]
        if type(score) is not int or not 0 <= score <= 100:
            raise ValueError("Invalid writing score")
        if not isinstance(corrected_text, str) or not corrected_text.strip() or len(corrected_text) > 20000:
            raise ValueError("Invalid corrected writing")
        if not isinstance(feedback, str) or not feedback.strip() or len(feedback) > 4000:
            raise ValueError("Invalid writing feedback")
        return {
            "score": score,
            "corrected_text": corrected_text.strip(),
            "feedback": feedback.strip(),
        }
    except ApiError:
        raise
    except requests.Timeout:
        raise ApiError("AI phản hồi quá lâu. Vui lòng thử nộp lại.", 504, "writing_ai_timeout") from None
    except requests.HTTPError:
        raise ApiError("Không nhận được nhận xét từ AI. Vui lòng thử lại.", 502, "writing_ai_failed") from None
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError):
        raise ApiError("Không nhận được nhận xét hợp lệ từ AI. Vui lòng thử lại.", 502, "writing_ai_failed") from None
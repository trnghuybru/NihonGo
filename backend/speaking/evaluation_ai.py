"""Text-only rubric, provider transport and validation of evidence-backed feedback."""
import json
import logging
import math
import os
import re
import time
from pathlib import Path

import requests

from api_errors import ApiError
from services.llm_service import DEFAULT_MODEL, OPENROUTER_API_URL
from .ai import provider_retry_after

RUBRIC_VERSION = "text-v1"
CRITERIA = {"grammar": ("Ngữ pháp", 0.4), "vocabulary": ("Từ vựng", 0.3),
            "naturalness": ("Độ tự nhiên", 0.3)}
SYSTEM_PROMPT = Path(__file__).with_name("evaluation_prompt.txt").read_text(encoding="utf-8")
logger = logging.getLogger(__name__)
TRANSIENT_PROVIDER_CODES = {408, 500, 502, 503, 504}


def object_schema(properties):
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


def text_schema(maximum):
    return {"type": "string", "minLength": 1, "maxLength": maximum}


CRITERION_SCHEMA = object_schema({
    "score": {"type": ["number", "null"], "minimum": 0, "maximum": 100},
    "feedback": text_schema(1200), "suggestion": text_schema(800)})
OUTPUT_SCHEMA = object_schema({
    "assessment_status": {"type": "string", "enum": ["scored", "insufficient_data"]},
    "summary": text_schema(1600),
    "criteria": object_schema({code: CRITERION_SCHEMA for code in CRITERIA}),
    "strengths": {"type": "array", "maxItems": 3, "items": text_schema(600)},
    "next_steps": {"type": "array", "minItems": 1, "maxItems": 3, "items": text_schema(800)},
    "items": {"type": "array", "maxItems": 8, "items": object_schema({
        "kind": {"type": "string", "enum": ["error", "alternative"]},
        "criterion": {"type": "string", "enum": list(CRITERIA)},
        "message_id": text_schema(36), "original": text_schema(2000),
        "improved": text_schema(2000), "explanation": text_schema(1200)})}})


def check_schema(value, schema):
    """Validate the bounded schema above without trusting provider JSON mode."""
    kind = schema["type"]
    if isinstance(kind, list):
        if value is None and "null" in kind:
            return
        kind = next(item for item in kind if item != "null")
    if kind == "object":
        if not isinstance(value, dict) or set(value) != set(schema["properties"]):
            raise ValueError("Unexpected fields")
        for key, child in schema["properties"].items():
            check_schema(value[key], child)
    elif kind == "array":
        if not isinstance(value, list) or not schema.get("minItems", 0) <= len(value) <= schema["maxItems"]:
            raise ValueError("Invalid list")
        for item in value:
            check_schema(item, schema["items"])
    elif kind == "string":
        if not isinstance(value, str) or not schema.get("minLength", 1) <= len(value.strip()) <= schema.get("maxLength", 2000):
            raise ValueError("Invalid text")
        if "enum" in schema and value not in schema["enum"]:
            raise ValueError("Invalid enum")
    elif kind == "number":
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ValueError("Invalid score")


def validate_result(result, messages):
    check_schema(result, OUTPUT_SCHEMA)
    scored = result["assessment_status"] == "scored"
    if any((item["score"] is not None) != scored for item in result["criteria"].values()):
        raise ValueError("Inconsistent assessment")
    if not scored and result["items"]:
        raise ValueError("Insufficient evidence")
    learner = {item["message_id"]: item["content"] for item in messages if item["speaker"] == "user"}
    seen = set()
    unique_items = []
    for item in result["items"]:
        if item["message_id"] not in learner or item["original"] not in learner[item["message_id"]]:
            raise ValueError("Invalid quotation")
        # Two suggestions can legitimately quote the same sentence. Repeated
        # copies of the same correction should not invalidate the whole score.
        evidence = (item["message_id"], item["original"], item["improved"])
        if evidence not in seen:
            unique_items.append(item)
            seen.add(evidence)
    return {**result, "items": unique_items}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def parse_result(content, messages):
    if not isinstance(content, str) or not content.strip() or len(content) > 40000:
        raise ValueError("Invalid response size")
    # A single outer code fence is presentation, not assessment data. Still
    # reject prose, multiple objects and all invalid scores/evidence underneath.
    content = content.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*\n([\s\S]*?)\n```", content, flags=re.IGNORECASE)
    if fenced:
        content = fenced.group(1)
    return validate_result(json.loads(content, object_pairs_hook=unique_object), messages)


def provider_failure(code):
    if code in {401, 402, 403, 404}:
        return ApiError("Model nhận xét chưa truy cập được. Kiểm tra API key, hạn mức và model trên máy chủ.",
                        503, "evaluation_unavailable")
    return ApiError("Dịch vụ model nhận xét đang gián đoạn. Hội thoại đã được lưu; vui lòng thử lại sau.",
                    503, "evaluation_provider_unavailable")


def provider_content(data):
    # OpenRouter can send an error envelope after HTTP response headers were
    # already sent with status 200. HTTP status alone is not proof of success.
    if not isinstance(data, dict):
        raise ValueError("Invalid provider envelope")
    error = data.get("error")
    if error is not None:
        code = error.get("code") if isinstance(error, dict) else None
        try:
            code = int(code)
        except (ValueError, TypeError):
            code = None
        if code == 429:
            raise ApiError("AI đang giới hạn lượt phân tích. Vui lòng thử lại sau.",
                           429, "evaluation_rate_limited", retry_after=30)
        raise provider_failure(code)
    choice = data["choices"][0]
    if choice.get("finish_reason") in {"length", "content_filter", "error"}:
        raise ValueError("Incomplete provider output")
    return choice["message"]["content"]


def evaluation_model():
    return os.getenv("SPEAKING_EVALUATION_MODEL") or os.getenv("OPENROUTER_MODEL") or DEFAULT_MODEL


def generate_evaluation(snapshot, messages, *, prompt=SYSTEM_PROMPT, schema=OUTPUT_SCHEMA,
                        parser=parse_result, target_message_id=None):
    key = os.getenv("OPENROUTER_API_KEY", "").strip().strip('"').strip("'")
    if not key:
        raise ApiError("Chưa cấu hình dịch vụ nhận xét AI.", 503, "evaluation_unavailable")
    # Never pass the private role instructions, account details or audio objects.
    context = {field: snapshot.get(field) for field in (
        "title", "context", "learning_objectives", "difficulty_level", "language_code")}
    context["role"] = {field: snapshot.get("role", {}).get(field) for field in ("name", "description")}
    payload = {"scenario": context, "transcript": messages}
    if target_message_id is not None:
        payload["target_message_id"] = target_message_id
    if len(json.dumps(payload, ensure_ascii=False)) > 120000:
        raise ApiError("Hội thoại quá dài để phân tích trong một lần.", 422, "evaluation_too_long")
    request_body = {
        "model": evaluation_model(), "stream": False, "max_tokens": 6000, "temperature": 0.2,
        "reasoning": {"enabled": False, "exclude": True},
        "messages": [
            {"role": "system", "content": prompt + "\nOutput schema:\n" + json.dumps(schema)},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]}
    # Optional strict mode for models verified to support structured outputs.
    # Text mode remains usable with the project's existing conversation model.
    if os.getenv("SPEAKING_EVALUATION_FORMAT", "text") == "json_schema":
        request_body["response_format"] = {"type": "json_schema", "json_schema": {
            "name": "message_feedback" if target_message_id else "conversation_evaluation", "strict": True, "schema": schema}}
        request_body["provider"] = {"require_parameters": True}
    deadline = time.monotonic() + 80
    for attempt in range(2):
        remaining = deadline - time.monotonic() - 5
        if remaining < 1:
            raise ApiError("Phân tích quá lâu. Bạn có thể thử lại, hội thoại đã được giữ.", 504, "evaluation_timeout")
        try:
            with requests.post(OPENROUTER_API_URL,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=request_body, timeout=(5, min(60 if attempt == 0 else 30, remaining))) as response:
                if response.status_code == 429:
                    raise ApiError("AI đang giới hạn lượt phân tích. Vui lòng thử lại sau.",
                                   429, "evaluation_rate_limited", retry_after=provider_retry_after(response))
                if response.status_code in TRANSIENT_PROVIDER_CODES:
                    raise provider_failure(response.status_code)
                response.raise_for_status()
                data = response.json()
            content = provider_content(data)
            return parser(content, messages)
        except ApiError as error:
            # Never log provider bodies, transcripts, signed URLs or credentials.
            logger.warning("Evaluation attempt failed; attempt=%s code=%s", attempt + 1, error.code)
            if attempt == 0 and error.code == "evaluation_provider_unavailable":
                continue
            raise
        except requests.Timeout:
            raise ApiError("Phân tích quá lâu. Bạn có thể thử lại, hội thoại đã được giữ.", 504, "evaluation_timeout") from None
        except requests.RequestException as error:
            status = error.response.status_code if error.response is not None else None
            logger.warning("Evaluation transport failed; status=%s", status)
            raise provider_failure(status) from None
        except (ValueError, KeyError, IndexError, TypeError, OverflowError) as error:
            # Exception text can contain provider data for JSONDecodeError/KeyError.
            # Log only a fixed failure category; send a fixed repair instruction.
            logger.warning("Evaluation output rejected; attempt=%s category=%s", attempt + 1, type(error).__name__)
            if attempt == 0:
                repair = (
                    "Return the complete JSON object again, following the system output schema exactly. "
                    "The previous response failed backend validation. Use numeric scores for all three "
                    "criteria when scored; for insufficient_data use null scores and an empty items array. "
                    "Copy message_id and original quotations exactly from learner messages in the supplied "
                    "transcript, never from assistant messages. Do not repeat a correction for the same "
                    "quotation. Include all required fields and no markdown or extra text.")
                if target_message_id is not None:
                    repair = ("Return summary and items only, matching the system schema. "
                              "Only cite target_message_id and exact substrings of that learner message. "
                              "Do not score, assess pronunciation, invent errors or repeat corrections. "
                              "Use items=[] if no useful correction is supported. Return JSON without markdown.")
                request_body = {**request_body, "messages": [*request_body["messages"], {"role": "user", "content": repair}]}
                continue
            raise ApiError("Chưa nhận được nhận xét hợp lệ từ AI. Vui lòng thử phân tích lại.",
                           502, "evaluation_failed") from None

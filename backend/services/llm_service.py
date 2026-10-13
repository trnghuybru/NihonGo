"""Gemini helpers and level guidelines used by conversation replies."""
import re

GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-3.1-flash-lite"

LEVEL_GUIDELINES = {
    "N5": "JLPT N5レベル：基本単語と初級文法（です・ます形）のみ使用。1文を短く、極めて分かりやすく返答すること。",
    "N4": "JLPT N4レベル：日常の基本会話（〜から、〜ので、〜たい、〜たことがある等）。丁寧語を基調とし、親しみやすく話すこと。",
    "N3": "JLPT N3レベル：より自然な日本語表現。場面に応じて丁寧語と普通形を自然に織り交ぜ、語彙の幅を広げて返答すること。",
    "N2": "JLPT N2/N1レベル：敬語（尊敬語・謙譲語）やビジネス表現、慣用句も含め、ネイティブに近い自然で豊かな表現を用いること。",
}


def gemini_url(model, method="generateContent"):
    if not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9._-]+", model):
        raise ValueError("Invalid Gemini model")
    return f"{GEMINI_API_ROOT}/{model}:{method}"


def gemini_payload(prompt, history, model):
    config = {"temperature": 0.4, "maxOutputTokens": 1024}
    if model.startswith("gemini-3"):
        config["thinkingConfig"] = {"thinkingLevel": "minimal"}
    return {
        "systemInstruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "model" if message["role"] == "assistant" else "user",
                      "parts": [{"text": message["content"]}]} for message in history],
        "generationConfig": config,
    }


def gemini_text(data):
    if not isinstance(data, dict):
        raise ValueError("Invalid provider response")
    if data.get("error") or data.get("promptFeedback", {}).get("blockReason"):
        raise ValueError("Provider rejected reply")
    candidate = data["candidates"][0]
    if not isinstance(candidate, dict):
        raise ValueError("Invalid provider candidate")
    finish = candidate.get("finishReason")
    if finish != "STOP":
        raise ValueError("Incomplete provider reply")
    parts = candidate.get("content", {}).get("parts", [])
    if not isinstance(parts, list) or any(
        not isinstance(part, dict) or not isinstance(part.get("text", ""), str) for part in parts
    ):
        raise ValueError("Invalid provider text")
    return "".join(part.get("text", "") for part in parts if not part.get("thought"))

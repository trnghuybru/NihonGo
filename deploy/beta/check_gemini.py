"""Verify the beta Gemini key can list required models without generating content."""
import json
import urllib.error
import urllib.request
from pathlib import Path

env_path = Path(__file__).resolve().parents[2] / "backend/.env"
values = {}
for line in env_path.read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

api_key = values.get("GEMINI_API_KEY", "")
if not api_key:
    raise SystemExit("Gemini key is missing")
models = {
    values.get(name, "gemini-3.1-flash-lite")
    for name in ("GEMINI_CHAT_MODEL", "SPEAKING_EVALUATION_MODEL", "READING_AI_MODEL", "SHADOWING_QUIZ_MODEL")
}
request = urllib.request.Request(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    headers={"x-goog-api-key": api_key},
)
try:
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
except urllib.error.HTTPError as error:
    raise SystemExit(f"Gemini model list failed (HTTP {error.code})") from None
except (OSError, ValueError) as error:
    raise SystemExit(f"Gemini model list failed ({type(error).__name__})") from None

available = {item.get("name", "").removeprefix("models/") for item in payload.get("models", [])}
missing = sorted(models - available)
if missing:
    raise SystemExit("Gemini key works, but model(s) unavailable: " + ", ".join(missing))
print("Gemini key valid; configured model(s) available: " + ", ".join(sorted(models)))

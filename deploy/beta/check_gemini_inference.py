"""Make one tiny Gemini inference to distinguish key metadata from billing access."""
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
model = values.get("GEMINI_CHAT_MODEL", "gemini-3.1-flash-lite")
if not api_key or not model:
    raise SystemExit("Gemini settings incomplete")
url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
payload = {"contents": [{"parts": [{"text": "こんにちは"}]}],
           "generationConfig": {"maxOutputTokens": 16}}
request = urllib.request.Request(
    url,
    data=json.dumps(payload).encode(),
    headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()
        print(f"Gemini inference succeeded (HTTP {response.status}, model {model}).")
except urllib.error.HTTPError as error:
    try:
        body = json.loads(error.read())
        message = str(body.get("error", {}).get("message", ""))
    except (ValueError, TypeError, AttributeError):
        message = ""
    message = message.replace(api_key, "[redacted]")[:300]
    raise SystemExit(f"Gemini inference failed (HTTP {error.code}, model {model}): {message}") from None
except OSError as error:
    raise SystemExit(f"Gemini inference failed ({type(error).__name__})") from None

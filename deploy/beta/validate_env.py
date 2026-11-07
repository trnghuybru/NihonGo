"""Check beta environment without printing secrets."""
import json
import re
import sys
from pathlib import Path

MAX_INVITES = 50


def main(path: Path) -> int:
    if not path.is_file():
        print(f"Missing environment file: {path}", file=sys.stderr)
        return 1
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

    errors = []

    def required(key):
        value = values.get(key, "")
        if not value or "CHANGE_ME" in value:
            errors.append(f"{key} is missing or still a placeholder")
        return value

    domain = required("BETA_DOMAIN")
    if values.get("APP_ENV") != "production" or values.get("BETA_MODE") != "true":
        errors.append("APP_ENV=production and BETA_MODE=true are required")
    quota_mode = values.get("BETA_QUOTA_MODE", "usd")
    if quota_mode not in {"usd", "daily"}:
        errors.append("BETA_QUOTA_MODE must be usd or daily")
    if values.get("PUBLIC_BASE_URL") != f"https://{domain}":
        errors.append("PUBLIC_BASE_URL must match the HTTPS beta domain")
    password = required("BETA_DB_PASSWORD")
    if not re.fullmatch(r"[A-Za-z0-9_-]{24,}", password):
        errors.append("BETA_DB_PASSWORD needs 24+ URL-safe characters")
    if len(required("AUTH_SECRET_KEY")) < 32:
        errors.append("AUTH_SECRET_KEY needs 32+ characters")
    provider = values.get("GEMINI_PROVIDER", "developer").strip().lower()
    if provider == "developer":
        required("GEMINI_API_KEY")
    elif provider == "vertex":
        project = required("VERTEX_PROJECT_ID")
        if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project):
            errors.append("VERTEX_PROJECT_ID is invalid")
        credentials = Path("deploy/beta/secrets/vertex.json")
        if not credentials.is_file():
            errors.append("Vertex credentials file is missing on VPS")
        elif credentials.stat().st_mode & 0o077:
            errors.append("Vertex credentials file must be readable only by its owner")
    else:
        errors.append("GEMINI_PROVIDER must be developer or vertex")
    required("SMTP_HOST")
    required("SMTP_FROM")
    required("SMTP_USERNAME")
    required("SMTP_PASSWORD")
    if values.get("SMTP_STARTTLS") != "true" and values.get("SMTP_SSL") != "true":
        errors.append("SMTP must use STARTTLS or SSL")
    live = values.get("BETA_LIVE_ENABLED", "false")
    if live not in {"false", "true"}:
        errors.append("BETA_LIVE_ENABLED must be true or false")
    if live == "true":
        required("GEMINI_LIVE_API_KEY")
    if live == "true" and quota_mode == "usd" and values.get("BETA_LIVE_RESERVE_USD") != "0.25":
        errors.append("Beta Live gateway reserves 0.25 USD per 90-second session")
    audio = values.get("BETA_AUDIO_STORAGE_ENABLED", "false")
    if audio not in {"false", "true"}:
        errors.append("BETA_AUDIO_STORAGE_ENABLED must be true or false")
    if audio == "true" and values.get("AUDIO_LOCAL_ROOT") != "/audio":
        errors.append("Beta audio storage needs AUDIO_LOCAL_ROOT=/audio")
    games = values.get("BETA_GAMES_ENABLED", "false")
    if games not in {"false", "true"}:
        errors.append("BETA_GAMES_ENABLED must be true or false")
    if games == "true":
        for key in ("LIVEKIT_URL", "LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
            required(key)
    invites = [email.strip().lower() for email in required("BETA_INVITE_EMAILS").split(",")]
    if not 1 <= len(set(invites)) <= MAX_INVITES or any(not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) for email in invites):
        errors.append(f"BETA_INVITE_EMAILS needs 1-{MAX_INVITES} distinct valid email addresses")
    if quota_mode == "usd":
        try:
            prices = json.loads(required("BETA_GEMINI_PRICES_JSON"))
            for key in ("GEMINI_CHAT_MODEL", "SPEAKING_EVALUATION_MODEL", "READING_AI_MODEL", "SHADOWING_QUIZ_MODEL"):
                model = values.get(key, "gemini-3.1-flash-lite")
                if model not in prices:
                    errors.append(f"{key} has no price entry")
        except (ValueError, TypeError):
            errors.append("BETA_GEMINI_PRICES_JSON is not valid JSON")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print("Beta environment validated; secrets were not displayed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "backend/.env")))

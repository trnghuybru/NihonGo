"""Create a private production env with fresh local secrets, once per VPS."""
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[2]
template = (root / "deploy/beta/env.template").read_text()
target = root / "backend/.env"
if target.exists():
    raise SystemExit("backend/.env already exists; refusing to overwrite it")
template = template.replace("CHANGE_ME_URL_SAFE_RANDOM", secrets.token_urlsafe(32))
template = template.replace("CHANGE_ME_RANDOM_48_PLUS_CHARACTERS", secrets.token_urlsafe(48))
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as stream:
    stream.write(template)
print("Created backend/.env with fresh database and auth secrets (values hidden).")
print("Fill the remaining CHANGE_ME fields on the VPS before starting the app.")

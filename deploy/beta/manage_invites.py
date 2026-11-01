"""View or add invited beta emails on the VPS without touching other secrets."""
import os
import re
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
env_path = Path(os.getenv("BETA_ENV_PATH", root / "backend/.env"))
if not env_path.is_file():
    raise SystemExit("Missing backend/.env")

lines = env_path.read_text().splitlines()
matches = [i for i, line in enumerate(lines) if line.startswith("BETA_INVITE_EMAILS=")]
if len(matches) != 1:
    raise SystemExit("Expected exactly one BETA_INVITE_EMAILS line")
index = matches[0]
current = [item.strip().lower() for item in lines[index].split("=", 1)[1].split(",") if item.strip()]
if len(current) != len(set(current)):
    raise SystemExit("Existing invite list contains duplicate emails")

if sys.argv[1:] == ["--list"]:
    print(f"Invited beta emails ({len(current)}/10):")
    for email in current:
        print(email)
    raise SystemExit(0)
if sys.argv[1:] != ["--add"]:
    raise SystemExit("Usage: python3 deploy/beta/manage_invites.py --list|--add")

raw = input("New email addresses (comma-separated): ").strip()
additions = [item.strip().lower() for item in raw.split(",") if item.strip()]
pattern = re.compile(r"^[^\s@,]+@[^\s@,]+\.[^\s@,]+$")
if not additions or len(additions) != len(set(additions)) or not all(pattern.fullmatch(email) for email in additions):
    raise SystemExit("Enter distinct valid email addresses")
new = current + [email for email in additions if email not in current]
if len(new) > 10:
    raise SystemExit(f"Too many invites: {len(new)}/10. No changes made.")
if new == current:
    print(f"All emails were already invited ({len(current)}/10). No changes made.")
    raise SystemExit(0)

lines[index] = "BETA_INVITE_EMAILS=" + ",".join(new)
fd, temporary = tempfile.mkstemp(prefix=".env.", dir=env_path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write("\n".join(lines) + "\n")
    os.replace(temporary, env_path)
except BaseException:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise
print(f"Invite list saved ({len(new)}/10). Restart backend and worker to apply it.")

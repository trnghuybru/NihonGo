"""Set beta Gemini key and invited emails interactively on the VPS."""
import getpass
import os
import re
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
env_path = Path(os.getenv("BETA_ENV_PATH", root / "backend/.env"))
if not env_path.is_file():
    raise SystemExit("Missing backend/.env")

key = getpass.getpass("Gemini API key for the beta project (hidden): ").strip()
if not key or any(char.isspace() for char in key):
    raise SystemExit("Invalid Gemini API key")
raw = input("Invited email addresses (1-10, comma-separated): ").strip()
emails = [item.strip().lower() for item in raw.split(",") if item.strip()]
pattern = re.compile(r"^[^\s@,]+@[^\s@,]+\.[^\s@,]+$")
if not 1 <= len(emails) <= 10 or len(set(emails)) != len(emails) or not all(pattern.fullmatch(email) for email in emails):
    raise SystemExit("Enter 1-10 distinct valid email addresses")

updates = {"GEMINI_API_KEY": key, "BETA_INVITE_EMAILS": ",".join(emails)}
lines = env_path.read_text().splitlines()
seen = set()
for index, line in enumerate(lines):
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    name = line.split("=", 1)[0].strip()
    if name in updates:
        lines[index] = f"{name}={updates[name]}"
        seen.add(name)
lines.extend(f"{name}={value}" for name, value in updates.items() if name not in seen)

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
print(f"Gemini key and {len(emails)} invited email(s) saved to backend/.env (key hidden).")

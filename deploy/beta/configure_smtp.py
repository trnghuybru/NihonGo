"""Interactively write Brevo SMTP credentials on the VPS without echoing the key."""
import getpass
import os
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
env_path = Path(os.getenv("BETA_ENV_PATH", root / "backend/.env"))
if not env_path.is_file():
    raise SystemExit("Missing backend/.env")

login = input("Brevo SMTP login (Settings > SMTP & API > SMTP > Login): ").strip()
key = getpass.getpass("Brevo SMTP key (hidden): ").strip()
if not login or "@" not in login or any(ch.isspace() for ch in login):
    raise SystemExit("Invalid SMTP login")
if not key or any(ch.isspace() for ch in key):
    raise SystemExit("Invalid SMTP key")

updates = {
    "SMTP_HOST": "smtp-relay.brevo.com",
    "SMTP_PORT": "587",
    "SMTP_FROM": "NihonGO <no-reply@momonihongo.app>",
    "SMTP_USERNAME": login,
    "SMTP_PASSWORD": key,
    "SMTP_SSL": "false",
    "SMTP_STARTTLS": "true",
}
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
print("Brevo SMTP settings saved to backend/.env (key hidden).")

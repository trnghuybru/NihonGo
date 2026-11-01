"""Atomically enable or disable beta vocabulary games on the VPS."""
import os
import sys
import tempfile
from pathlib import Path

if len(sys.argv) != 2 or sys.argv[1] not in {"on", "off"}:
    raise SystemExit("Usage: python3 deploy/beta/set_games_mode.py on|off")

path = Path(__file__).resolve().parents[2] / "backend/.env"
if not path.is_file():
    raise SystemExit("Missing backend/.env")
lines = path.read_text().splitlines()
name = "BETA_GAMES_ENABLED"
value = "true" if sys.argv[1] == "on" else "false"
seen = False
for index, line in enumerate(lines):
    if line.startswith(name + "="):
        lines[index] = f"{name}={value}"
        seen = True
if not seen:
    lines.append(f"{name}={value}")
fd, temporary = tempfile.mkstemp(prefix=".env.", dir=path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as target:
        target.write("\n".join(lines) + "\n")
    os.replace(temporary, path)
except BaseException:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise
print(f"Vocabulary games {'enabled' if value == 'true' else 'disabled'}; restart backend to apply.")

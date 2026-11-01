"""Read a Gemini Live API key from SSH stdin and store it in the private VPS env."""
import os
import re
import sys
import tempfile
from pathlib import Path

key = sys.stdin.readline().strip()
if not re.fullmatch(r"[A-Za-z0-9._-]{20,200}", key):
    raise SystemExit("Gemini Live API key format is invalid")

root = Path(__file__).resolve().parents[2]
path = root / "backend/.env"
if not path.is_file():
    raise SystemExit("Missing backend/.env")
lines = path.read_text().splitlines()
updates = {"GEMINI_LIVE_API_KEY": key, "GEMINI_API_KEY": ""}
seen = set()
for index, line in enumerate(lines):
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    name = line.split("=", 1)[0].strip()
    if name in updates:
        lines[index] = f"{name}={updates[name]}"
        seen.add(name)
lines.extend(f"{name}={value}" for name, value in updates.items() if name not in seen)
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
print("Dedicated Gemini Live API key saved on VPS; key hidden.")

"""Atomically enable or disable private VPS audio recordings for beta."""
import os
import sys
import tempfile
from pathlib import Path

if len(sys.argv) != 2 or sys.argv[1] not in {"on", "off"}:
    raise SystemExit("Usage: python3 deploy/beta/set_audio_mode.py on|off")

path = Path(__file__).resolve().parents[2] / "backend/.env"
if not path.is_file():
    raise SystemExit("Missing backend/.env")
updates = {"BETA_AUDIO_STORAGE_ENABLED": "true" if sys.argv[1] == "on" else "false"}
lines = path.read_text().splitlines()
# Keep the selected storage backend; toggling recording must not switch R2 to local.
if not any(line.strip().startswith("AUDIO_LOCAL_ROOT=") for line in lines):
    updates["AUDIO_LOCAL_ROOT"] = "/audio"
seen = set()
for index, line in enumerate(lines):
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    name = line.split("=", 1)[0].strip()
    if name in updates:
        lines[index] = f"{name}={updates[name]}"
        seen.add(name)
lines.extend(f"{key}={value}" for key, value in updates.items() if key not in seen)
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
print(f"Private audio storage {'enabled' if sys.argv[1] == 'on' else 'disabled'}; restart backend to apply.")

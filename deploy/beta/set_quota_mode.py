"""Select daily beta limits without printing the private environment file."""
import os
import sys
import tempfile
from pathlib import Path

if len(sys.argv) != 2 or sys.argv[1] not in {"daily", "usd"}:
    raise SystemExit("Usage: python3 deploy/beta/set_quota_mode.py daily|usd")
path = Path(__file__).resolve().parents[2] / "backend/.env"
if not path.is_file():
    raise SystemExit("Missing backend/.env")
lines = path.read_text().splitlines()
found = False
for index, line in enumerate(lines):
    if line.startswith("BETA_QUOTA_MODE="):
        lines[index] = "BETA_QUOTA_MODE=" + sys.argv[1]
        found = True
if not found:
    lines.append("BETA_QUOTA_MODE=" + sys.argv[1])
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
print(f"Beta quota mode: {sys.argv[1]}; restart backend and worker to apply.")

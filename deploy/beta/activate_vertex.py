"""Atomically switch the beta backend from Developer API to Vertex AI."""
import json
import os
import re
import sys
import tempfile
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 deploy/beta/activate_vertex.py PROJECT_ID")
project = sys.argv[1].strip()
if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project):
    raise SystemExit("Invalid Google Cloud Project ID")

root = Path(__file__).resolve().parents[2]
env_path = root / "backend/.env"
credential_path = root / "deploy/beta/secrets/vertex.json"
if not env_path.is_file() or not credential_path.is_file():
    raise SystemExit("Missing beta environment or Vertex credential")
if credential_path.stat().st_mode & 0o077:
    raise SystemExit("Vertex credential must have mode 600")
credential = json.loads(credential_path.read_text())
if credential.get("type") != "service_account" or credential.get("project_id") != project:
    raise SystemExit("Vertex credential belongs to a different project")

updates = {
    "GEMINI_PROVIDER": "vertex",
    "VERTEX_PROJECT_ID": project,
    "GEMINI_API_KEY": "",  # Prevent accidental Developer API calls in beta.
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
print(f"Beta configured for Vertex AI project {project}; Developer API key cleared.")

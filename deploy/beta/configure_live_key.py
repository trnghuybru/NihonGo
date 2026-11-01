"""Prompt for the Live key locally, then send it through the existing SSH key."""
import getpass
import re
import subprocess
from pathlib import Path

identity = Path.home() / ".ssh/momonihongo_deploy"
if not identity.is_file():
    raise SystemExit("Missing ~/.ssh/momonihongo_deploy")
key = getpass.getpass("Gemini Live API key (hidden): ").strip()
if not key:
    raise SystemExit("No key entered")
if not re.fullmatch(r"[A-Za-z0-9._-]{20,200}", key):
    raise SystemExit(
        "Invalid key format: expected a 20–200 character Gemini API key "
        "without spaces. Copy the key from Google AI Studio → API Keys."
    )
try:
    subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-i", str(identity),
         "root@178.238.231.247",
         "cd /opt/momonihongo && python3 deploy/beta/write_live_key.py"],
        input=key + "\n", text=True, check=True,
    )
except subprocess.CalledProcessError as error:
    raise SystemExit(
        f"VPS did not save the Live key (SSH exit {error.returncode}). "
        "Read the error line immediately above this message."
    ) from None

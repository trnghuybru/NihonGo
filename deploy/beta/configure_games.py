"""Create private LiveKit credentials and game settings on the beta VPS."""
import argparse
import ipaddress
import json
import os
import secrets
import tempfile
from pathlib import Path


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as target:
            target.write(content)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-ip", required=True)
    args = parser.parse_args()
    ip = str(ipaddress.IPv4Address(args.public_ip))
    root = Path(__file__).resolve().parents[2]
    env_path = root / "backend/.env"
    if not env_path.is_file():
        raise SystemExit("Missing backend/.env")
    lines = env_path.read_text().splitlines()
    values = dict(line.split("=", 1) for line in lines if "=" in line and not line.startswith("#"))
    key = values.get("LIVEKIT_API_KEY") or "nihongo-beta-" + secrets.token_hex(12)
    secret = values.get("LIVEKIT_API_SECRET") or secrets.token_urlsafe(48)
    updates = {
        "LIVEKIT_URL": "ws://livekit:7880",
        "LIVEKIT_PUBLIC_URL": "wss://voice.momonihongo.app",
        "LIVEKIT_API_KEY": key,
        "LIVEKIT_API_SECRET": secret,
        "GAME_REDIS_URL": "redis://redis:6379/4",
        "GAME_SOCKET_ORIGINS": "https://momonihongo.app",
        "GAME_WHISPER_THREADS": "2",
    }
    seen = set()
    for index, line in enumerate(lines):
        name = line.split("=", 1)[0].strip() if "=" in line and not line.startswith("#") else ""
        if name in updates:
            lines[index] = f"{name}={updates[name]}"
            seen.add(name)
    lines.extend(f"{name}={value}" for name, value in updates.items() if name not in seen)
    config = ("port: 7880\n"
              "log_level: warn\n"
              "rtc:\n"
              "  tcp_port: 7881\n"
              "  udp_port: 7882\n"
              f"  node_ip: {ip}\n"
              "  use_external_ip: false\n"
              "redis:\n"
              "  address: redis:6379\n"
              "keys:\n"
              f"  {json.dumps(key)}: {json.dumps(secret)}\n")
    atomic_write(root / "deploy/beta/secrets/livekit.yaml", config)
    atomic_write(env_path, "\n".join(lines) + "\n")
    print("Game server settings saved privately; BETA_GAMES_ENABLED remains unchanged.")


if __name__ == "__main__":
    main()

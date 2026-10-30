"""Generate local-only LiveKit credentials. Never overwrites configured credentials."""
from pathlib import Path
import secrets
import os
from dotenv import dotenv_values, set_key

if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    env = root / '.env'
    values = dotenv_values(env)
    media_ip = os.getenv('GAME_MEDIA_IP') or values.get('GAME_MEDIA_IP') or '127.0.0.1'
    key = values.get('LIVEKIT_API_KEY') or 'local-games'
    secret = values.get('LIVEKIT_API_SECRET') or secrets.token_hex(32)
    for name, value in {'LIVEKIT_URL':'ws://127.0.0.1:7880', 'LIVEKIT_API_KEY':key,
                        'LIVEKIT_API_SECRET':secret, 'GAME_REDIS_URL':'redis://127.0.0.1:6379/4', 'GAME_MEDIA_IP':media_ip}.items():
        if not values.get(name) or (name == 'GAME_MEDIA_IP' and os.getenv('GAME_MEDIA_IP')):
            set_key(str(env), name, value)
    directory = root / '.runtime' / 'games'
    directory.mkdir(parents=True, exist_ok=True)
    # Restrict keys to a safe YAML scalar; generated keys satisfy this as well.
    import json
    config = f'port: 7880\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  use_external_ip: false\n  node_ip: {media_ip}\n  advertise_internal_ip: true\n  enable_loopback_candidate: true\nlogging:\n  level: warn\nkeys:\n  {json.dumps(key)}: {json.dumps(secret)}\n'
    path = directory / 'livekit.yaml'
    path.write_text(config)
    path.chmod(0o600)
    print('Local game audio configured. Credentials stay in backend/.env and backend/.runtime/games/livekit.yaml.')

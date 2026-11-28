"""Apply schema and import the release's prepared JLPT package before serving it."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask_migrate import upgrade
from app import app
from .database import import_payload


def main():
    with app.app_context():
        upgrade()
        for source in sorted((Path(__file__).parent / 'import_data').glob('*.json')):
            payload = json.loads(source.read_text())
            from vocabulary.audio import _tts_client
            connection = _tts_client()
            def verify(asset):
                remote = connection.head_object(Bucket=asset['bucket'], Key=asset['storage_key'])
                if (remote.get('ContentLength') != asset['size_bytes']
                        or remote.get('Metadata', {}).get('sha256') != asset['id']):
                    raise ValueError('JLPT R2 integrity check failed.')
            with ThreadPoolExecutor(max_workers=6) as pool:
                list(pool.map(verify, payload['assets']))
            print('JLPT R2 verified:', len(payload['assets']), 'objects', flush=True)
            print('JLPT database import:', json.dumps(import_payload(payload)), flush=True)


if __name__ == '__main__':
    main()

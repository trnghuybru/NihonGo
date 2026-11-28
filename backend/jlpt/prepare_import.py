"""Prepare an immutable DB import; upload all embedded images to private R2 first."""
import argparse
import base64
import hashlib
import json
import os
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from botocore.exceptions import ClientError
from dotenv import load_dotenv


def prepare(source, sample_dir, bucket):
    raw = Path(source).read_bytes()
    original = json.loads(raw)
    assets = {}
    blobs = {}

    def transform(value):
        if isinstance(value, list):
            return [transform(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {k: transform(v) for k, v in value.items() if k != 'image_data_url'}
        if value.get('image_data_url'):
            prefix, encoded = value['image_data_url'].split(',', 1)
            if prefix != 'data:image/webp;base64':
                raise ValueError('Only embedded WebP source images are supported.')
            data = base64.b64decode(encoded, validate=True)
            if not data.startswith(b'RIFF') or data[8:12] != b'WEBP':
                raise ValueError('Invalid WebP source image.')
            digest = hashlib.sha256(data).hexdigest()
            from PIL import Image
            with Image.open(io.BytesIO(data)) as image:
                result.setdefault('width_px', image.width)
                result.setdefault('height_px', image.height)
            result['image_id'] = digest
            blobs[digest] = data
            assets[digest] = dict(id=digest, bucket=bucket,
                storage_key=f'jlpt/images/{digest}.webp', mime_type='image/webp', size_bytes=len(data))
        return result

    clean = transform(original)
    clean['source_sha256'] = hashlib.sha256(raw).hexdigest()
    clean['normalized'] = [transform(json.loads(p.read_text())) for p in sorted(Path(sample_dir).glob('*.json'))]
    clean['assets'] = list(assets.values())
    return clean, blobs


def upload_images(connection, payload, blobs):
    def upload(asset):
        data = blobs[asset['id']]
        try:
            remote = connection.head_object(Bucket=asset['bucket'], Key=asset['storage_key'])
            if (remote.get('ContentLength') == len(data)
                    and remote.get('Metadata', {}).get('sha256') == asset['id']):
                return 0
        except ClientError as error:
            if error.response['Error']['Code'] not in {'404', 'NoSuchKey', 'NotFound'}:
                raise
        connection.put_object(Bucket=asset['bucket'], Key=asset['storage_key'], Body=data,
            ContentType='image/webp', Metadata={'sha256': asset['id']},
            CacheControl='private, max-age=21600')
        remote = connection.head_object(Bucket=asset['bucket'], Key=asset['storage_key'])
        if remote['ContentLength'] != len(data) or remote.get('Metadata', {}).get('sha256') != asset['id']:
            raise ValueError('R2 object verification failed.')
        return 1
    with ThreadPoolExecutor(max_workers=6) as pool:
        return sum(pool.map(upload, payload['assets']))


def main():
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    bucket = os.getenv('JLPT_S3_BUCKET') or os.getenv('TTS_S3_BUCKET') or os.environ['S3_BUCKET']
    payload, blobs = prepare(args.source, Path(__file__).parent / 'data', bucket)
    from vocabulary.audio import _tts_client
    uploaded = upload_images(_tts_client(), payload, blobs)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps({'sessions': len(payload['sessions']), 'exams': sum(any(f['kind'] == 'exam' for f in s['files']) for s in payload['sessions']),
        'images': len(blobs), 'uploaded': uploaded, 'source_sha256': payload['source_sha256']}))


if __name__ == '__main__':
    main()

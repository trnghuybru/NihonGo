"""Prepare private R2 credentials without switching existing recordings from local storage."""
import getpass
import os
import re
import tempfile
from pathlib import Path


def main():
    configured_path = os.getenv('BETA_ENV_PATH')
    path = (Path(configured_path) if configured_path else
            Path(__file__).resolve().parents[2] / 'backend/.env')
    if not path.is_file():
        raise SystemExit('Missing backend/.env')
    endpoint = input('R2 S3 API endpoint (https://...r2.cloudflarestorage.com): ').strip().rstrip('/')
    if not re.fullmatch(r'https://[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com', endpoint):
        raise SystemExit('Invalid R2 S3 API endpoint; copy it from the bucket/account settings.')
    bucket = input('Private bucket name [nihongo-recordings]: ').strip() or 'nihongo-recordings'
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', bucket):
        raise SystemExit('Invalid bucket name')
    access = getpass.getpass('R2 Access Key ID (hidden): ').strip()
    secret = getpass.getpass('R2 Secret Access Key (hidden): ').strip()
    if not all(re.fullmatch(r'[A-Za-z0-9/+_=.-]{16,256}', value) for value in (access, secret)):
        raise SystemExit('Invalid R2 credentials')
    lines = path.read_text().splitlines()
    current = dict(line.split('=', 1) for line in lines if '=' in line and not line.lstrip().startswith('#'))
    if not current.get('AUDIO_LOCAL_ROOT', '/audio').strip():
        raise SystemExit('Remote storage is already active; refusing to replace its credentials with this preparation script.')
    updates = {
        'S3_ENDPOINT_URL': endpoint, 'S3_PUBLIC_ENDPOINT_URL': endpoint,
        'S3_BUCKET': bucket, 'S3_ADDRESSING_STYLE': 'path', 'AWS_DEFAULT_REGION': 'auto',
        'AWS_ACCESS_KEY_ID': access, 'AWS_SECRET_ACCESS_KEY': secret,
        'AWS_REQUEST_CHECKSUM_CALCULATION': 'when_required',
        'AWS_RESPONSE_CHECKSUM_VALIDATION': 'when_required',
    }
    seen = set()
    for index, line in enumerate(lines):
        key = line.split('=', 1)[0].strip()
        if key in updates:
            lines[index] = key + '=' + updates[key]
            seen.add(key)
    lines.extend(key + '=' + value for key, value in updates.items() if key not in seen)
    fd, temporary = tempfile.mkstemp(prefix='.env.', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as target:
            target.write('\n'.join(lines) + '\n')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('R2 credentials prepared (hidden). Local recordings remain active; migration and verification are still required before switching.')


if __name__ == '__main__':
    main()

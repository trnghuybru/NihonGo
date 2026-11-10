"""Copy and verify private local recordings to S3/R2, keeping every local file."""
import argparse
import hashlib
import json
import re
from pathlib import Path

from botocore.exceptions import ClientError

KEY = re.compile(r'sessions/[0-9a-f-]{36}/[0-9a-f-]{36}\.wav\Z')


def digest(stream):
    result = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        result.update(chunk)
    return result.hexdigest()


def transfer(connection, bucket, root, assets, *, copy=False):
    root = Path(root).resolve()
    copied = verified = size = 0
    for asset in assets:
        key = asset.storage_key
        if not KEY.fullmatch(key):
            raise ValueError('Invalid recording key; migration stopped.')
        path = root / key
        if (any(parent.is_symlink() for parent in (path, *path.parents)) or
                not path.is_file() or path.stat().st_size != asset.size_bytes):
            raise ValueError('Local recording is missing or has a different size; migration stopped.')
        with path.open('rb') as source:
            expected = digest(source)
        try:
            metadata = connection.head_object(Bucket=bucket, Key=key)
        except ClientError as error:
            if error.response['Error']['Code'] not in {'404', 'NoSuchKey', 'NotFound'}:
                raise
            if not copy:
                raise ValueError('Recording is not yet copied to R2.') from None
            with path.open('rb') as source:
                connection.put_object(Bucket=bucket, Key=key, Body=source,
                                      ContentType='audio/wav', ContentLength=asset.size_bytes)
            copied += 1
            metadata = connection.head_object(Bucket=bucket, Key=key)
        if metadata['ContentLength'] != asset.size_bytes:
            raise ValueError('Remote recording size differs; existing objects are never overwritten.')
        response = connection.get_object(Bucket=bucket, Key=key)
        stream = response['Body']
        try:
            if digest(stream) != expected:
                raise ValueError('Remote recording checksum differs; migration stopped.')
        finally:
            stream.close()
        verified += 1
        size += asset.size_bytes
    return {'copied': copied, 'verified': verified, 'bytes': size, 'local_files_retained': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='/audio')
    parser.add_argument('--copy', action='store_true', help='Upload missing objects; default only verifies.')
    args = parser.parse_args()
    from app import app
    from extensions import db
    from sqlalchemy import select
    from .models import ConversationAudioAsset, ConversationSession
    from .storage import bucket, client
    with app.app_context():
        try:
            # Serialize with owned deletion while checking and copying each live session.
            sessions = db.session.scalars(select(ConversationSession).where(
                ConversationSession.deleted_at.is_(None)).order_by(ConversationSession.id)
                .with_for_update()).all()
            assets = db.session.scalars(select(ConversationAudioAsset).where(
                ConversationAudioAsset.session_id.in_([item.id for item in sessions]),
                ConversationAudioAsset.status == 'ready').order_by(ConversationAudioAsset.id)).all()
            result = transfer(client(), bucket(), args.source, assets, copy=args.copy)
            print(json.dumps(result))
        finally:
            db.session.rollback()  # No database writes or local file removals.


if __name__ == '__main__':
    main()

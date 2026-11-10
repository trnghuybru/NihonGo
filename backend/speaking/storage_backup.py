"""Stream a private recording backup from the currently configured storage to stdout."""
import os
import re
import sys
import tarfile


def main():
    local = os.getenv('AUDIO_LOCAL_ROOT', '').strip()
    with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
        if local:
            archive.add(local, arcname='audio')
            return
        from .storage import bucket, client
        connection, name = client(), bucket()
        pages = connection.get_paginator('list_objects_v2').paginate(Bucket=name, Prefix='sessions/')
        for page in pages:
            for item in page.get('Contents', []):
                key = item['Key']
                if not re.fullmatch(r'sessions/[0-9a-f-]{36}/[0-9a-f-]{36}\.wav', key):
                    raise ValueError('Unexpected object key in recording backup.')
                response = connection.get_object(Bucket=name, Key=key)
                stream = response['Body']
                try:
                    entry = tarfile.TarInfo('audio/' + key)
                    entry.size, entry.mode = response['ContentLength'], 0o600
                    archive.addfile(entry, stream)
                finally:
                    stream.close()


if __name__ == '__main__':
    main()

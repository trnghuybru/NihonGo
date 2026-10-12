"""Shared vocabulary MP3 storage on S3-compatible services, separate from recordings."""
import hashlib
import os
import zipfile
from pathlib import Path

import click
from botocore.exceptions import BotoCoreError, ClientError
from flask.cli import with_appcontext
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from api_errors import ApiError
from extensions import db
from speaking.storage import client, unavailable
from .models import VocabularyLesson, VocabularyTextbook, VocabularyWord


def bucket():
    return os.getenv('VOCABULARY_S3_BUCKET', 'vocabulary-audio').strip() or 'vocabulary-audio'


def playback(word):
    audio = word.details.get('audio')
    if not audio:
        raise ApiError('Từ này chưa có âm thanh.', 404, 'vocabulary_audio_not_found')
    try:
        # Detect missing objects rather than handing the app a broken signed URL.
        client().head_object(Bucket=bucket(), Key=audio['storage_key'])
        url = client(public=True).generate_presigned_url('get_object',
            Params={'Bucket': bucket(), 'Key': audio['storage_key']}, ExpiresIn=300)
    except ClientError as error:
        if error.response['Error']['Code'] in {'404', 'NoSuchKey', 'NotFound'}:
            raise ApiError('Không tìm thấy file âm thanh. Vui lòng nhập lại audio.',
                           404, 'vocabulary_audio_not_found') from None
        raise unavailable() from None
    except BotoCoreError:
        raise unavailable() from None
    return {'url': url, 'expires_in': 300}


def import_audio(package, textbook_id):
    package = Path(package)
    checksum = hashlib.sha256(package.read_bytes()).hexdigest()
    book = db.session.get(VocabularyTextbook, textbook_id)
    if book is None:
        raise ValueError('Nhập dữ liệu từ vựng trước khi nhập audio.')
    words = db.session.scalars(select(VocabularyWord).join(VocabularyLesson)
        .where(VocabularyLesson.textbook_id == textbook_id).order_by(VocabularyWord.number)).all()
    prepared = {}
    links = []
    with zipfile.ZipFile(package) as archive:
        for word in words:
            source = word.details.get('source', {})
            if source.get('sha256') != checksum:
                raise ValueError('File Anki không khớp nguồn từ vựng đã nhập.')
            references = source.get('audio', [])
            if not references:
                continue
            # Current cards play one pronunciation; reject ambiguous mappings.
            if len(references) != 1:
                raise ValueError(f'Từ {word.number} có nhiều audio; cần kiểm tra ánh xạ.')
            reference = references[0]
            if (not reference.get('present_in_package')
                    or not reference['file_name'].lower().endswith('.mp3')):
                raise ValueError(f'Audio từ {word.number} thiếu hoặc không phải MP3.')
            member = reference['archive_member']
            info = archive.getinfo(member)
            if not 0 < info.file_size <= 10_000_000:
                raise ValueError('Kích thước audio không hợp lệ.')
            data = archive.read(member)
            if not (data.startswith(b'ID3') or (len(data) >= 2 and data[0] == 255 and data[1] & 224 == 224)):
                raise ValueError('Nội dung audio không có header MP3 hợp lệ.')
            sha256 = hashlib.sha256(data).hexdigest()
            key = f'{book.level.lower()}/{sha256}.mp3'
            prepared[key] = data
            links.append((word, {'storage_key': key, 'sha256': sha256,
                                 'size_bytes': len(data), 'mime_type': 'audio/mpeg'}))
    if not links:
        raise ValueError('Nguồn này không có audio để nhập.')
    connection = client()
    name = bucket()
    try:
        connection.head_bucket(Bucket=name)
    except ClientError as error:
        if error.response['Error']['Code'] not in {'404', 'NoSuchBucket', 'NotFound'}:
            raise
        region = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
        options = {} if region == 'us-east-1' else {'CreateBucketConfiguration': {'LocationConstraint': region}}
        connection.create_bucket(Bucket=name, **options)
    uploaded = 0
    for key, data in prepared.items():
        try:
            metadata = connection.head_object(Bucket=name, Key=key)
            ready = (metadata.get('ContentLength') == len(data)
                     and metadata.get('ContentType') == 'audio/mpeg'
                     and metadata.get('Metadata', {}).get('sha256') == key.split('/')[-1][:-4])
        except ClientError as error:
            if error.response['Error']['Code'] not in {'404', 'NoSuchKey', 'NotFound'}:
                raise
            ready = False
        if not ready:
            connection.put_object(Bucket=name, Key=key, Body=data, ContentType='audio/mpeg',
                                  Metadata={'sha256': key.split('/')[-1][:-4]},
                                  CacheControl='private, max-age=300')
            uploaded += 1
        if uploaded and uploaded % 100 == 0:
            click.echo(f'Uploaded {uploaded} files...')
    # Publish links only after every file is uploaded; retry safely reuses objects.
    for word, metadata in links:
        word.details = {**word.details, 'audio': metadata}
    db.session.commit()
    return {'bucket': name, 'words': len(links), 'objects': len(prepared), 'uploaded': uploaded}


@click.command('vocabulary-audio-import')
@click.option('--apkg', type=click.Path(exists=True, path_type=Path), required=True)
@click.option('--textbook', default='mimikara-n1', show_default=True)
@with_appcontext
def import_command(apkg, textbook):
    """Upload MP3s by content hash and link existing vocabulary notes."""
    try:
        result = import_audio(apkg, textbook)
    except (ValueError, KeyError, OSError, zipfile.BadZipFile, BotoCoreError, ClientError, SQLAlchemyError) as error:
        db.session.rollback()
        message = str(error) if isinstance(error, ValueError) else 'Kiểm tra file Anki và cấu hình kho audio.'
        raise click.ClickException(message) from None
    click.echo(f"Audio ready: {result['words']} words, {result['objects']} objects, "
               f"{result['uploaded']} uploaded, bucket {result['bucket']}.")

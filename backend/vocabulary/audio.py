"""Private vocabulary audio and generated Supertonic speech on S3-compatible storage."""
import hashlib
import io
import os
import threading
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

_supertonic_lock = threading.Lock()
_supertonic_engine = None
_supertonic_style = None
_SUPERTONIC_VOICE = 'F1'
_SUPERTONIC_VERSION = 'supertonic3-1.3.1'


def bucket():
    return os.getenv('VOCABULARY_S3_BUCKET', 'vocabulary-audio').strip() or 'vocabulary-audio'


def playback(word):
    if os.getenv('SUPERTONIC_TTS_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}:
        try:
            return supertonic_playback(word)
        except ApiError:
            # Keep imported textbook recordings available if TTS is temporarily unavailable.
            if not word.details.get('audio'):
                raise
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


def _supertonic_model():
    global _supertonic_engine, _supertonic_style
    if _supertonic_engine is None:
        from supertonic import TTS
        _supertonic_engine = TTS(auto_download=False)
        _supertonic_style = _supertonic_engine.get_voice_style(voice_name=_SUPERTONIC_VOICE)
    return _supertonic_engine, _supertonic_style


def _synthesize_japanese(text):
    import numpy as np
    import soundfile as sf

    engine, style = _supertonic_model()
    wav, duration = engine.synthesize(text=text, voice_style=style, total_steps=8,
                                      speed=1.0, lang='ja', verbose=False)
    samples = np.asarray(wav).squeeze()
    if samples.ndim != 1:
        raise ValueError('Unexpected Supertonic waveform shape')
    length = int(engine.sample_rate * float(np.asarray(duration).reshape(-1)[0]))
    buffer = io.BytesIO()
    sf.write(buffer, samples[:length], engine.sample_rate, format='WAV', subtype='PCM_16')
    return buffer.getvalue()


def supertonic_text_playback(text):
    """Create/cache Japanese pronunciation in private R2 and return a short-lived URL."""
    if os.getenv('SUPERTONIC_TTS_ENABLED', '').strip().lower() not in {'1', 'true', 'yes', 'on'}:
        raise ApiError('Giọng đọc Supertonic chưa được bật.', 503, 'vocabulary_tts_unavailable')
    if not isinstance(text, str):
        raise ApiError('Văn bản cần đọc không hợp lệ.', 422, 'vocabulary_audio_invalid')
    text = text.strip()
    if not text or len(text) > 500:
        raise ApiError('Không thể tạo phát âm cho từ này.', 422, 'vocabulary_audio_invalid')
    target_bucket = os.getenv('S3_BUCKET', '').strip()
    if not target_bucket:
        raise unavailable()
    digest = hashlib.sha256(f'{_SUPERTONIC_VERSION}:ja:{_SUPERTONIC_VOICE}:8:1.0:{text}'.encode()).hexdigest()
    key = f'tts/{_SUPERTONIC_VERSION}/{_SUPERTONIC_VOICE}/{digest}.wav'
    with _supertonic_lock:
        try:
            connection = client()
            try:
                connection.head_object(Bucket=target_bucket, Key=key)
            except ClientError as error:
                if error.response['Error']['Code'] not in {'404', 'NoSuchKey', 'NotFound'}:
                    raise
                data = _synthesize_japanese(text)
                connection.put_object(Bucket=target_bucket, Key=key, Body=data,
                    ContentType='audio/wav', Metadata={'sha256': digest},
                    CacheControl='private, max-age=31536000, immutable')
            url = client(public=True).generate_presigned_url('get_object',
                Params={'Bucket': target_bucket, 'Key': key}, ExpiresIn=300)
            return {'url': url, 'expires_in': 300}
        except (BotoCoreError, ClientError):
            raise unavailable() from None
        except ApiError:
            raise
        except Exception:
            raise ApiError('Chưa tạo được giọng đọc. Vui lòng thử lại.', 503,
                           'vocabulary_tts_unavailable') from None


def supertonic_playback(word):
    return supertonic_text_playback(word.reading or word.word)


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

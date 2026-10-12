"""S3-compatible transport. Object keys, ownership and metadata live in audio.py."""
import os

import click
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from api_errors import ApiError


def bucket():
    value = os.getenv("S3_BUCKET", "").strip()
    if not value:
        raise ApiError("Chưa cấu hình dịch vụ lưu âm thanh.", 503, "audio_unavailable")
    return value


def client(public=False):
    import boto3
    endpoint = os.getenv("S3_ENDPOINT_URL", "").strip() or None
    if public:
        endpoint = os.getenv("S3_PUBLIC_ENDPOINT_URL", "").strip() or endpoint
    return boto3.client("s3", endpoint_url=endpoint,
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
        config=Config(signature_version="s3v4", connect_timeout=5, read_timeout=20,
                      retries={"max_attempts": 2},
                      s3={"addressing_style": os.getenv("S3_ADDRESSING_STYLE", "auto")}))


def unavailable():
    return ApiError("Không truy cập được kho âm thanh. Vui lòng thử lại.", 503, "audio_unavailable")


def upload_url(key, size):
    try:
        return client(public=True).generate_presigned_url("put_object",
            Params={"Bucket": bucket(), "Key": key, "ContentType": "audio/wav",
                    "ContentLength": size}, ExpiresIn=900)
    except (BotoCoreError, ClientError):
        raise unavailable() from None


def download_url(key):
    try:
        return client(public=True).generate_presigned_url("get_object",
            Params={"Bucket": bucket(), "Key": key}, ExpiresIn=300)
    except (BotoCoreError, ClientError):
        raise unavailable() from None


def inspect_object(key):
    try:
        connection = client()
        metadata = connection.head_object(Bucket=bucket(), Key=key)
        response = connection.get_object(Bucket=bucket(), Key=key, Range="bytes=0-43")
        stream = response["Body"]
        try:
            header = stream.read(44)
        finally:
            stream.close()
        return metadata, header
    except (BotoCoreError, ClientError):
        raise unavailable() from None


def delete_session_audio(session_id):
    """Remove only this session's objects, including unfinished uploads."""
    prefix = f"sessions/{session_id}/"
    try:
        connection = client()
        name = bucket()
        # Re-list the first page after deleting it; no stale pagination offsets.
        for _ in range(50):
            objects = connection.list_objects_v2(Bucket=name, Prefix=prefix, MaxKeys=1000).get("Contents", [])
            if not objects:
                return
            response = connection.delete_objects(Bucket=name,
                Delete={"Objects": [{"Key": item["Key"]} for item in objects], "Quiet": True})
            if response.get("Errors"):
                raise unavailable()
        raise unavailable()
    except ClientError as error:
        if error.response["Error"]["Code"] in {"NoSuchBucket", "404", "NotFound"}:
            return
        raise unavailable() from None
    except BotoCoreError:
        raise unavailable() from None


@click.command("audio-storage-init")
def initialize_bucket():
    """Create the configured audio bucket (explicit local setup, never per request)."""
    name = bucket()
    connection = client()
    try:
        connection.head_bucket(Bucket=name)
    except ClientError as error:
        if error.response["Error"]["Code"] not in {"404", "NoSuchBucket", "NotFound"}:
            raise click.ClickException("Không truy cập được bucket đã cấu hình.") from None
        region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        options = {} if region == "us-east-1" else {"CreateBucketConfiguration": {"LocationConstraint": region}}
        connection.create_bucket(Bucket=name, **options)
    click.echo(f"Audio bucket ready: {name}")

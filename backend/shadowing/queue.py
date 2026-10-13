import json
import os
import time

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from extensions import db


def client(read_timeout=15):
    endpoint = os.getenv('SHADOWING_SQS_ENDPOINT', 'http://localhost:9324').strip() or None
    credentials = {'aws_access_key_id': 'local', 'aws_secret_access_key': 'local'} if endpoint else {}
    return boto3.client('sqs', endpoint_url=endpoint,
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'), **credentials,
        config=Config(connect_timeout=2, read_timeout=read_timeout, retries={'max_attempts': 0}))


def queue_url(connection):
    configured = os.getenv('SHADOWING_SQS_QUEUE_URL', '').strip()
    return configured or connection.get_queue_url(QueueName='shadowing')['QueueUrl']


def enqueue(job, kind='shadowing'):
    try:
        connection = client(read_timeout=3)
        connection.send_message(QueueUrl=queue_url(connection), MessageBody=json.dumps({'job_id': job.id, 'kind': kind}))
        job.last_enqueued_at = int(time.time())
        db.session.commit()
        return True
    except (BotoCoreError, ClientError):
        db.session.rollback()
        return False

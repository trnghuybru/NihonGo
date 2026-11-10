import argparse
import importlib.util
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from flask import Flask
from dotenv import load_dotenv
from sqlalchemy import select, func
from sqlalchemy.engine import make_url
from auth import init_auth
from extensions import db
from reading.models import ReadingPassage, ReadingAttempt, ReadingInsight
parser=argparse.ArgumentParser()
parser.add_argument('--dataset', required=True)
parser.add_argument('--backup-dir', required=True)
parser.add_argument('--module', required=True)
parser.add_argument('--expected-host', required=True)
parser.add_argument('--execute', action='store_true')
args=parser.parse_args()
load_dotenv('.env')
app=Flask('reading-data-replacement');init_auth(app)
url=make_url(app.config['SQLALCHEMY_DATABASE_URI'])
if url.host != args.expected_host:
    raise SystemExit('Unexpected database host; no changes made.')
with app.app_context():
    counts=lambda: {model.__tablename__:db.session.scalar(select(func.count()).select_from(model)) for model in [ReadingPassage,ReadingAttempt,ReadingInsight]}
    print(json.dumps({'database_host':url.host,'database':url.database,'before':counts()}),flush=True)
    if args.execute:
        from reading.importer import read_dataset
        proposed, mismatches=read_dataset(args.dataset)
        assert len(proposed)==209 and sum(len(row['questions']) for row in proposed)==429 and not mismatches
        assert all(row['level']=='N3' and row['source_url'].startswith('https://rakuyomi.net/vi/passages/') for row in proposed)
        spec=importlib.util.spec_from_file_location('reading.replacement',args.module)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        result=module.replace_dataset(args.dataset,args.backup_dir)
        rows=list(db.session.scalars(select(ReadingPassage)))
        assert len(rows)==209 and all(row.level=='N3' and row.source_url.startswith('https://rakuyomi.net/vi/passages/') for row in rows)
        assert sum(len(row.questions) for row in rows)==429
        print(json.dumps({'replacement':result,'after':counts()},ensure_ascii=False),flush=True)

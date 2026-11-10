import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid
sys.path.insert(0,str(Path.cwd()))
from flask import Flask
from dotenv import load_dotenv
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from auth import init_auth
from extensions import db
from reading.models import ReadingPassage, ReadingAttempt, ReadingInsight, TYPES
from reading.importer import read_dataset, import_dataset
from reading.quiz import question_set
parser=argparse.ArgumentParser()
parser.add_argument('--dataset',required=True)
parser.add_argument('--manifest',required=True)
parser.add_argument('--backup-dir',required=True)
parser.add_argument('--expected-host',required=True)
args=parser.parse_args()
manifest=json.loads(Path(args.manifest).read_text())
assert hashlib.sha256(Path(args.dataset).read_bytes()).hexdigest()==manifest['dataset_sha256']
assert {'integrated','thematic'} <= set(TYPES), 'Backend reading categories are not deployed yet; no database changes.'
proposed,mismatches=read_dataset(args.dataset)
assert not mismatches
assert dict(Counter(p['level'] for p in proposed))==manifest['passages']
assert {level:sum(len(p['questions']) for p in proposed if p['level']==level) for level in manifest['passages']}==manifest['questions']
assert set(manifest['passages'])=={'N2','N1'}
assert all(p['source_url'].startswith('https://rakuyomi.net/vi/passages/') for p in proposed)
load_dotenv('.env')
app=Flask('reading-data-addition');init_auth(app)
url=make_url(app.config['SQLALCHEMY_DATABASE_URI'])
assert url.host==args.expected_host, 'Unexpected database host; no changes.'
with app.app_context():
    try:
        db.session.execute(text("SET LOCAL lock_timeout = '10s'"))
        db.session.execute(text('LOCK TABLE reading_passages, reading_attempts, reading_insights IN SHARE ROW EXCLUSIVE MODE'))
        models=[ReadingPassage,ReadingAttempt,ReadingInsight]
        before={m.__tablename__:[dict(row) for row in db.session.execute(select(m.__table__)).mappings()] for m in models}
        n3={row['id']:row for row in before['reading_passages'] if row['level']=='N3'}
        assert len(n3)==209, 'Unexpected N3 baseline; no changes.'
        print(json.dumps({'database_host':url.host,'before':{name:len(rows) for name,rows in before.items()} }),flush=True)
        directory=Path(args.backup_dir);directory.mkdir(parents=True,exist_ok=True,mode=0o700);directory.chmod(0o700)
        now=datetime.now(timezone.utc)
        backup=directory/f'reading-before-add-{now:%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}.json'
        snapshot={'schema_version':1,'created_at':now.isoformat(),'tables':before,'dataset_sha256':manifest['dataset_sha256']}
        descriptor=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'w',encoding='utf-8') as file:
            json.dump(snapshot,file,ensure_ascii=False);file.flush();os.fsync(file.fileno())
        assert json.loads(backup.read_text())==snapshot
        result=import_dataset(args.dataset)
        current=list(db.session.scalars(select(ReadingPassage)))
        by_id={row.id:row for row in current}
        for identifier,old in n3.items():
            assert identifier in by_id
            for key in ['level','kind','title','text','questions','source_url']:
                assert getattr(by_id[identifier],key)==old[key], 'N3 was unexpectedly modified.'
        for model in [ReadingAttempt,ReadingInsight]:
            keys=[c.name for c in model.__table__.primary_key.columns]
            original={tuple(row[k] for k in keys) for row in before[model.__tablename__]}
            retained={tuple(row[k] for k in keys) for row in db.session.execute(select(model.__table__)).mappings()}
            assert original<=retained,'Existing reading history or analysis was removed.'
        counts=dict(Counter(row.level for row in current))
        valid={level:sum(len(question_set(row)[1]) for row in current if row.level==level) for level in counts}
        for level,count in manifest['passages'].items():assert counts[level]==count
        for level,count in manifest['questions'].items():assert valid[level]==count
        print(json.dumps({'import':result,'backup':str(backup),'passages_by_level':counts,'valid_questions_by_level':valid,'n3_unchanged':True,'existing_history_retained':True},ensure_ascii=False),flush=True)
    except Exception:
        db.session.rollback()
        raise

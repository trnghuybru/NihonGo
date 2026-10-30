import copy
import unittest
from unittest.mock import patch
from flask import Flask
from sqlalchemy import delete
from auth import init_auth
from auth.models import AuthSession, User, db, now
from auth.security import digest
from games import init_games, engine
from games.models import GameRoom
from vocabulary.models import VocabularyTextbook, VocabularyLesson, VocabularyWord


class GameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app=Flask(__name__)
        cls.app.config.update(TESTING=True,AUTH_CONFIGURED=True,AUTH_SECRET_KEY='game-test-'*8,SQLALCHEMY_DATABASE_URI='sqlite://')
        init_auth(cls.app);cls.socket=init_games(cls.app,start_timer=False)
        with cls.app.app_context():db.create_all()

    def setUp(self):
        self.ctx=self.app.app_context();self.ctx.push()
        for table in reversed(db.metadata.sorted_tables):db.session.execute(delete(table))
        for i in range(3):
            db.session.add(User(id=f'u{i}',name=f'Player {i}',email=f'p{i}@example.com',phone=f'+8491234500{i}'));db.session.flush()
            db.session.add(AuthSession(user_id=f'u{i}',access_hash=digest(f'token{i}'),access_expires_at=now()+900,expires_at=now()+3600))
        for level in ['N5','N4']:
            db.session.add(VocabularyTextbook(id=level,title=level,level=level,source_url='test'));db.session.flush()
            db.session.add(VocabularyLesson(id=level,textbook_id=level,unit_number=1,unit_title='Unit',number=1,title='Lesson '+level,source_url='test',audio_urls=[]));db.session.flush()
            for i,(word,reading) in enumerate([('学校','がっこう'),('猫','ねこ'),('犬','いぬ')]):
                db.session.add(VocabularyWord(id=f'{level}-{i}',lesson_id=level,number=i+1,word=word,reading=reading,meaning_vi='nghĩa',details={}))
        db.session.commit();self.client=self.app.test_client();self.app.config.update(LIVEKIT_URL='',LIVEKIT_API_KEY='',LIVEKIT_API_SECRET='')

    def tearDown(self):db.session.rollback();db.session.remove();self.ctx.pop()
    def post(self,path,data=None,user=0):return self.client.post('/api/games'+path,json=data or {},headers={'Authorization':f'Bearer token{user}'})
    def get(self,path,user=0):return self.client.get('/api/games'+path,headers={'Authorization':f'Bearer token{user}'})
    def create(self,mode='write',**extra):
        r=self.post('/rooms',{'mode':mode,'level':'N5','source':'jlpt','question_count':2,'seconds':15,**extra})
        self.assertEqual(r.status_code,200,r.json);return r.json['code']
    def start(self,code):
        self.post(f'/rooms/{code}/join',user=1)
        for user in [0,1]:self.post(f'/rooms/{code}/ready',{'ready':True},user)
        row=db.session.query(GameRoom).filter_by(code=code).one();state=copy.deepcopy(row.state);state['voice_ready_at']=engine.millis();engine.mutate(row,state);db.session.commit()
        r=self.post(f'/rooms/{code}/start');self.assertEqual(r.status_code,200,r.json)
        row=db.session.query(GameRoom).filter_by(code=code).one();state=copy.deepcopy(row.state);engine.new_question(state,engine.millis());engine.mutate(row,state);db.session.commit();return state

    def test_sources_level_lesson_and_unique_random_words(self):
        catalog=self.get('/catalog?level=N5');self.assertEqual(catalog.status_code,200,catalog.json)
        self.assertEqual(catalog.json['available_count'],3);self.assertEqual([x['id'] for x in catalog.json['lessons']],['N5'])
        code=self.create(source='lesson',lesson_id='N5',question_count=3)
        words=db.session.query(GameRoom).filter_by(code=code).one().state['questions']
        self.assertEqual(len({q['word'] for q in words}),3);self.assertTrue(all(q['id'].startswith('N5-') for q in words))
        self.assertEqual(self.post('/rooms',{'mode':'write','level':'N4','source':'lesson','lesson_id':'N5','question_count':1}).status_code,422)
        self.assertEqual(self.post('/rooms',{'mode':'write','level':'N5','source':'jlpt','question_count':30}).status_code,422)

    def test_auth_membership_host_and_ready(self):
        self.assertEqual(self.client.get('/api/games/catalog').status_code,401)
        code=self.create();self.assertEqual(self.get(f'/rooms/{code}',2).status_code,403)
        self.assertEqual(self.post(f'/rooms/{code}/start').status_code,409)
        self.post(f'/rooms/{code}/join',user=1);self.assertEqual(self.post(f'/rooms/{code}/start',user=1).status_code,403)

    def test_write_rank_idempotency_and_private_answers(self):
        code=self.create();state=self.start(code);reading=state['questions'][0]['accepted'][0]
        self.assertEqual(set(self.get(f'/rooms/{code}').json['question']),{'word'})
        data={'round_id':state['round_id'],'answer':reading}
        first=self.post(f'/rooms/{code}/answer',data,1);self.assertEqual(first.status_code,200,first.json)
        self.assertEqual(first.json['attempts'],[]);self.assertEqual(first.json['phase'],'question')
        again=self.post(f'/rooms/{code}/answer',data,1);self.assertEqual(next(p for p in again.json['players'] if p['id']=='u1')['score'],10)
        second=self.post(f'/rooms/{code}/answer',data);self.assertEqual(second.json['phase'],'results')
        self.assertEqual([a['points'] for a in second.json['attempts']],[10,8]);self.assertIn('reading',second.json['question'])

    def test_stale_and_late_answers_and_rejoining(self):
        code=self.create();state=self.start(code)
        self.assertEqual(self.post(f'/rooms/{code}/answer',{'round_id':'old','answer':'ねこ'}).status_code,409)
        row=db.session.query(GameRoom).filter_by(code=code).one();new=copy.deepcopy(row.state);new['deadline']=engine.millis()-1;engine.mutate(row,new);db.session.commit()
        self.assertEqual(self.post(f'/rooms/{code}/answer',{'round_id':state['round_id'],'answer':'ねこ'}).status_code,409)
        self.assertEqual(self.get(f'/rooms/{code}').json['phase'],'results')
        self.assertEqual(self.post(f'/rooms/{code}/join',user=1).status_code,200)
        self.assertEqual(self.post(f'/rooms/{code}/join',user=2).status_code,409)

    def test_read_one_winner_no_handoff_and_no_client_transcript(self):
        self.app.config.update(LIVEKIT_URL='ws://localhost:7880',LIVEKIT_API_KEY='key',LIVEKIT_API_SECRET='secret'*8)
        code=self.create('read');state=self.start(code);data={'round_id':state['round_id']}
        with patch('games.media.permission') as permission:
            winner=self.post(f'/rooms/{code}/buzz',data);self.assertEqual(winner.json['holder'],'u0')
            self.assertEqual(self.post(f'/rooms/{code}/buzz',data,1).status_code,409);permission.assert_called_once()
            self.assertEqual(self.post(f'/rooms/{code}/answer',{**data,'answer':'ねこ'}).status_code,403)
            self.assertEqual(self.post(f'/rooms/{code}/finish-reading',data).json['phase'],'judging')
        row=db.session.query(GameRoom).filter_by(code=code).one();state=copy.deepcopy(row.state);engine.submit(state,'u0','まちがい',engine.millis(),'read');engine.mutate(row,state);db.session.commit()
        self.assertEqual(self.post(f'/rooms/{code}/buzz',data,1).status_code,409)
        self.assertEqual(self.get(f'/rooms/{code}').json['phase'],'results')
        self.assertEqual(self.get(f'/rooms/{code}').json['players'][0]['score'],0)

    def test_socket_ticket_membership(self):
        code=self.create();ticket=self.post('/socket-ticket',user=2).json['ticket']
        client=self.socket.test_client(self.app,namespace='/games',auth={'ticket':ticket})
        self.assertTrue(client.is_connected('/games'))
        self.assertEqual(client.emit('subscribe',{'code':code},namespace='/games',callback=True),{'ok':False});client.disconnect(namespace='/games')
        bad=self.socket.test_client(self.app,namespace='/games',auth={'ticket':'invalid'});self.assertFalse(bad.is_connected('/games'))

    def test_kana_and_technical_errors(self):
        self.assertEqual(engine.normalize(' ガッコウ '),'がっこう');self.assertEqual(engine.readings('にほん／にっぽん'),['にほん','にっぽん'])
        state={'phase':'judging','holder':'u0','index':0,'round_id':'one','players':[{'id':'u0','score':0,'left':False}], 'questions':[{'word':'猫','reading':'ねこ','accepted':['ねこ'],'meaning':'mèo'}], 'attempts':[],'sequence':0,'history':[]}
        engine.submit(state,'u0','ねこ',engine.millis(),'read','Không nghe rõ')
        self.assertEqual(state['phase'],'results');self.assertEqual(state['players'][0]['score'],0)

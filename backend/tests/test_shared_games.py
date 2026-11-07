import copy
import unittest
from unittest.mock import patch
import test_games as fixtures
from extensions import db
from games.models import GameRoom
from games import engine


class SharedGamesTests(unittest.TestCase):
    setUpClass = classmethod(fixtures.GameTests.setUpClass.__func__)
    setUp = fixtures.GameTests.setUp
    tearDown = fixtures.GameTests.tearDown
    post = fixtures.GameTests.post
    get = fixtures.GameTests.get

    def create(self):
        r = self.post('/lobbies', {'level':'N5'})
        self.assertEqual(r.status_code,200,r.json)
        code=r.json['code']
        self.assertEqual(self.post('/lobbies/'+code+'/join',user=1).status_code,200)
        return code

    def select(self,code,game):
        r=self.post('/lobbies/'+code+'/select',{'game':game,'level':'N5','source':'starter' if game=='castle' else 'jlpt','seconds':9 if game=='castle' else 15,'question_count':2})
        self.assertEqual(r.status_code,200,r.json)
        return r.json

    def finish(self,code):
        row=db.session.query(GameRoom).filter_by(code=code).one()
        s=copy.deepcopy(row.state);s.update(phase='finished',deadline=None)
        engine.mutate(row,s);db.session.commit()

    def test_one_code_and_roster_across_all_games(self):
        code=self.create()
        self.assertEqual(self.get('/resolve/'+code).json['game'],'shared')
        identity=db.session.query(GameRoom).filter_by(code=code).one().id
        for game in ['castle','write','read','castle']:
            r=self.select(code,game)
            self.assertEqual(r['code'],code)
            self.assertEqual(r['id'],identity)
            self.assertEqual([p['id'] for p in r['members']],['u0','u1'])
            self.assertTrue(all(not p['ready'] for p in r['members']))
            for user in [0,1]:
                self.assertEqual(self.post('/lobbies/'+code+'/ready',{'ready':True},user).status_code,200)
            if game=='read':
                self.app.config.update(LIVEKIT_URL='ws://localhost:7880',LIVEKIT_API_KEY='key',LIVEKIT_API_SECRET='secret'*8)
                row=db.session.query(GameRoom).filter_by(code=code).one()
                s=copy.deepcopy(row.state);s['voice_ready_at']=engine.millis();engine.mutate(row,s);db.session.commit()
            started=self.post('/lobbies/'+code+'/start')
            self.assertEqual(started.status_code,200,started.json)
            self.assertEqual(started.json['phase'],'countdown')
            self.assertEqual(self.post('/lobbies/'+code+'/select',{'game':'write'}).status_code,409)
            self.finish(code)
        self.assertEqual(db.session.query(GameRoom).count(),1)
        self.assertEqual(self.get('/lobbies/'+code,user=1).json['round'],4)

    def test_host_only_settings_reset_ready_and_membership(self):
        code=self.create()
        self.assertEqual(self.get('/lobbies/'+code,user=2).status_code,403)
        self.assertEqual(self.post('/lobbies/'+code+'/select',{'game':'castle'},user=1).status_code,403)
        self.select(code,'castle')
        for user in [0,1]:
            self.post('/lobbies/'+code+'/ready',{'ready':True},user)
        self.select(code,'write')
        self.assertTrue(all(not p['ready'] for p in self.get('/lobbies/'+code).json['members']))
        self.assertEqual(self.post('/lobbies/'+code+'/start').status_code,409)
        self.assertEqual(self.post('/rooms/'+code+'/start').status_code,409)
        self.assertEqual(self.post('/rooms/'+code+'/join',user=2).status_code,409)
        self.assertEqual(self.post('/lobbies/'+code+'/join',user=2).status_code,200)
        self.select(code,'castle')
        for user in [0,1,2]:
            self.post('/lobbies/'+code+'/ready',{'ready':True},user)
        self.assertEqual(self.post('/lobbies/'+code+'/start').status_code,409)
        self.assertEqual(len(self.get('/lobbies/'+code).json['members']),3)

    def test_return_after_round_does_not_leave_party_or_transfer_host(self):
        code=self.create()
        self.select(code,'write')
        self.finish(code)
        self.assertEqual(self.post('/rooms/'+code+'/leave').status_code,200)
        same=self.get('/lobbies/'+code).json
        self.assertEqual(same['host_id'],'u0')
        self.assertEqual(len(same['members']),2)
        self.select(code,'castle')
        self.assertEqual(self.post('/castle/rooms/'+code+'/join',user=2).status_code,409)
        self.assertEqual(self.post('/castle/rooms/'+code+'/start').status_code,409)
        self.assertEqual(self.post('/lobbies/'+code+'/leave').status_code,200)
        self.assertEqual(self.get('/lobbies/'+code,user=1).json['host_id'],'u1')
        self.assertEqual(self.get('/lobbies/'+code).status_code,403)

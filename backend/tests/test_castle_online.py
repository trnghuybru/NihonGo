import copy
import unittest
from unittest.mock import patch
import test_games as fixtures
from games import castle, engine, sync_rooms
from games.models import GameRoom
from extensions import db


class CastleOnlineTests(unittest.TestCase):
    setUpClass = classmethod(fixtures.GameTests.setUpClass.__func__)
    tearDown = fixtures.GameTests.tearDown

    def setUp(self):
        fixtures.GameTests.setUp(self)
        self.at = engine.millis()

    def call(self, path, data=None, user=0, method='post'):
        with patch('games.engine.millis', return_value=self.at):
            return getattr(self.client, method)('/api/games' + path,
                **({'json': data or {}} if method == 'post' else {}),
                headers={'Authorization': 'Bearer token' + str(user)})

    def create(self):
        r = self.call('/castle/rooms', {'level': 'N5', 'source': 'starter', 'round_seconds': 9})
        self.assertEqual(r.status_code, 200, r.json)
        return r.json['code']

    def ready(self, code):
        self.assertEqual(self.call('/castle/rooms/' + code + '/join', user=1).status_code, 200)
        for user in [0, 1]:
            self.assertEqual(self.call('/castle/rooms/' + code + '/ready', {'ready': True}, user).status_code, 200)
        self.assertEqual(self.call('/castle/rooms/' + code + '/start').status_code, 200)
        self.at += 3000
        r = self.call('/castle/rooms/' + code, method='get')
        self.assertEqual(r.json['phase'], 'battle', r.json)
        return db.session.query(GameRoom).filter_by(code=code).one()

    def test_auth_capacity_and_host_control(self):
        self.assertEqual(self.client.post('/api/games/castle/rooms', json={}).status_code, 401)
        code = self.create()
        self.assertEqual(self.call('/resolve/' + code, method='get').json['game'], 'castle')
        self.assertEqual(self.call('/castle/rooms/' + code, user=1, method='get').status_code, 403)
        self.assertEqual(self.call('/castle/rooms/' + code + '/start').status_code, 409)
        self.call('/castle/rooms/' + code + '/join', user=1)
        self.assertEqual(self.call('/castle/rooms/' + code + '/join', user=2).status_code, 409)
        self.assertEqual(len(self.call('/castle/rooms/' + code + '/join', user=1).json['players']), 2)
        self.assertEqual(self.call('/castle/rooms/' + code + '/start', user=1).status_code, 403)
        self.assertEqual(self.call('/rooms/' + code + '/join', user=2).status_code, 409)
        self.assertEqual(self.call('/castle/rooms', {'level': 'N0'}).status_code, 400)

    def test_server_scoring_privacy_idempotency_and_shared_state(self):
        code = self.create()
        correct = self.ready(code).state['questions'][0]['correct']
        before = self.call('/castle/rooms/' + code, user=1, method='get').json
        self.assertEqual(before['frame']['question']['correct'], -1)
        self.assertEqual(before['frame']['question']['word']['hiragana'], '')
        self.assertNotIn('questions', before)
        r = self.call('/castle/rooms/' + code + '/answer', {'round_id': 1, 'index': correct, 'side': 1, 'hp': 0, 'energy': 999})
        self.assertEqual(r.json['frame']['players'][0]['correct'], 1)
        self.assertEqual(r.json['frame']['players'][0]['energy'], 22)
        self.assertEqual(r.json['frame']['players'][1]['correct'], 0)
        self.assertEqual(len(r.json['frame']['troops']), 1)
        again = self.call('/castle/rooms/' + code + '/answer', {'round_id': 1, 'index': (correct + 1) % 4})
        self.assertEqual(again.json['frame']['players'][0]['correct'], 1)
        other = self.call('/castle/rooms/' + code, user=1, method='get').json
        self.assertIsNone(other['frame']['players'][0]['choice']['index'])
        self.assertEqual(other['frame']['question']['correct'], -1)
        self.assertEqual(self.call('/castle/rooms/' + code + '/answer', {'round_id': 1, 'index': True}, user=1).status_code, 400)
        r = self.call('/castle/rooms/' + code + '/answer', {'round_id': 1, 'index': (correct + 1) % 4}, user=1).json
        self.assertEqual(r['frame']['question']['correct'], correct)
        self.assertEqual(len(r['frame']['mistakes']), 1)
        self.at += 1000
        host = self.call('/castle/rooms/' + code, method='get').json
        guest = self.call('/castle/rooms/' + code, user=1, method='get').json
        self.assertEqual(host['frame']['round'], 2)
        self.assertEqual(host['frame']['troops'], guest['frame']['troops'])
        self.assertEqual(host['frame']['question'], guest['frame']['question'])
        self.assertEqual(host['frame']['mistakes'], [])
        self.assertEqual(self.call('/castle/rooms/' + code + '/answer', {'round_id': 1, 'index': correct}).status_code, 409)
        self.assertEqual(self.call('/castle/rooms/' + code + '/skill', {'kind': 'shield'}).status_code, 409)

    def test_reconnect_forfeit_and_both_results(self):
        code = self.create()
        self.ready(code)
        self.at += 10000
        self.assertEqual(self.call('/castle/rooms/' + code, user=1, method='get').json['me'], 1)
        self.assertEqual(self.call('/castle/rooms/' + code + '/leave', user=1).json['frame']['winner'], 0)
        self.at += 1000
        for user in [0, 1]:
            r = self.call('/castle/rooms/' + code, user=user, method='get').json
            self.assertEqual(r['phase'], 'finished')
            self.assertEqual(r['frame']['winner'], 0)
            self.assertEqual(len(r['players']), 2)

    def test_disconnected_player_times_out_while_host_heartbeats(self):
        code = self.create()
        self.ready(code)
        for _ in range(5):
            self.at += 5000
            self.call('/castle/rooms/' + code, method='get')
        self.at += 1000
        r = self.call('/castle/rooms/' + code, method='get').json
        self.assertEqual(r['phase'], 'finished')
        self.assertEqual(r['frame']['winner'], 0)

    def test_timer_and_socket_subscribe(self):
        code = self.create()
        self.ready(code)
        with patch('games.engine.millis', return_value=self.at + 500):
            sync_rooms(self.socket, {})
        ticket = self.call('/socket-ticket').json['ticket']
        client = self.socket.test_client(self.app, namespace='/games', auth={'ticket': ticket})
        self.assertTrue(client.emit('subscribe', {'code': code}, namespace='/games', callback=True)['ok'])
        client.disconnect(namespace='/games')

    def test_combat_and_simultaneous_castle_damage(self):
        s = copy.deepcopy(self.ready(self.create()).state)
        def troop(side, x, hp=18, power=7):
            return dict(id=side+1, side=side, x=x, hp=hp, maxHp=hp, power=power, speed=100, tier=0, attackAt=0)
        s['troops'] = [troop(0, 500, 42, 15), troop(1, 570)]
        for _ in range(50):
            s['now'] += 20
            castle.physics(s, 20)
        self.assertEqual(len(s['troops']), 1)
        self.assertTrue(0 < s['troops'][0]['hp'] < 42)
        for p in s['players']:
            p['hp'] = 1
        s['troops'] = [troop(0, 1069), troop(1, 131)]
        castle.physics(s, 20)
        self.assertEqual([p['hp'] for p in s['players']], [0, 0])
        self.assertIsNone(s['winner'])

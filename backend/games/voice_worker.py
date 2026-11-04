"""Receives the winner's LiveKit track for Cloud Speech fallback.
Run separately: python -m games.voice_worker. Browser-success rounds skip Cloud Speech.
"""
import asyncio
import copy
import logging
import os
from pathlib import Path
import uuid
from flask import Flask
from dotenv import load_dotenv
from sqlalchemy import select
from auth import init_auth
from extensions import db
from . import engine, media
from .models import GameRoom
from .speech import CloudSpeechRecognizer, TurnAudio

log = logging.getLogger('games.voice')


class VoiceRoom:
    def __init__(self, app, identifier, owner, model, semaphore):
        self.app, self.identifier, self.owner = app, identifier, owner
        self.model, self.semaphore = model, semaphore
        self.state = {}
        self.buffers = {}
        self.tasks = set()
        self.processing = set()
        self.captured = set()
        self.room = None
        self.last_permission = None
        self.done = False

    def read(self):
        with self.app.app_context():
            row = db.session.get(GameRoom, self.identifier)
            if not row or row.expires_at <= engine.millis() or row.status in ('closed', 'finished'):
                self.done = True
                return None
            self.state = copy.deepcopy(row.state)
            return row

    def heartbeat(self):
        with self.app.app_context():
            row = db.session.scalar(select(GameRoom).where(GameRoom.id == self.identifier).with_for_update())
            if not row:
                return
            state = copy.deepcopy(row.state)
            if state.get('voice_owner') != self.owner:
                self.done = True
                return
            state['voice_ready_at'] = engine.millis()
            state['voice_lease_at'] = engine.millis()
            engine.mutate(row, state)
            db.session.commit()

    async def capture(self, track, identity):
        from livekit import rtc
        self.read()
        stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
        try:
            async for event in stream:
                state = self.state
                if state.get('phase') in ('reading', 'judging') and state.get('holder') == identity:
                    key = state['round_id']
                    if key not in self.captured:
                        self.buffers.setdefault(key, TurnAudio()).append(bytes(event.frame.data), engine.millis())
        except Exception:
            log.exception('Audio track interrupted')
        finally:
            await stream.aclose()

    def recognize(self, raw):
        return self.model.recognize(raw)

    def end_on_silence(self, at):
        """Commit the turn before revoking publication; only this round may end."""
        state = self.state
        captured = self.buffers.get(state.get('round_id'))
        if state.get('recognizer') == 'browser' or state.get('phase') != 'reading' or not captured or not captured.ended(at):
            return
        with self.app.app_context():
            row = db.session.scalar(select(GameRoom).where(GameRoom.id == self.identifier).with_for_update())
            if not row:
                return
            latest = copy.deepcopy(row.state)
            if latest.get('round_id') == state.get('round_id') and latest.get('phase') == 'reading':
                latest.update(phase='judging', deadline=at + 15000)
                engine.mutate(row, latest)
                db.session.commit()
                self.state = latest

    async def judge(self, round_id, holder):
        await asyncio.sleep(.15)  # Drain the last in-flight audio frames after publication is revoked.
        captured = self.buffers.pop(round_id, TurnAudio())
        self.captured.add(round_id)
        raw = bytes(captured.data)
        try:
            async with self.semaphore:
                self.read()
                if (self.done or self.state.get('round_id') != round_id or
                        self.state.get('recognizer') == 'browser' or
                        self.state.get('phase') != 'judging' or self.state.get('deadline', 0) <= engine.millis()):
                    return
                transcript, error = await asyncio.to_thread(self.recognize, raw)
        except Exception:
            log.exception('Speech recognition failed')
            transcript, error = '', 'Bộ nhận dạng tạm lỗi. Câu này không tính điểm.'
        with self.app.app_context():
            row = db.session.scalar(select(GameRoom).where(GameRoom.id == self.identifier).with_for_update())
            if not row:
                return
            state = copy.deepcopy(row.state)
            if state.get('round_id') != round_id or state['phase'] != 'judging' or state.get('holder') != holder:
                return
            timing = {'speech_ended_at': captured.last_voice_at, 'spoken_ms': round(captured.voiced_ms)}
            engine.submit(state, holder, transcript, engine.millis(), 'read', error, timing=timing)
            engine.mutate(row, state)
            db.session.commit()

    def task(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    async def run(self):
        from livekit import rtc
        row = self.read()
        if not row:
            return
        self.room = rtc.Room()
        @self.room.on('disconnected')
        def disconnected(*_):
            self.done = True
        @self.room.on('track_subscribed')
        def subscribed(track, publication, participant):
            if track.kind == rtc.TrackKind.KIND_AUDIO and publication.source == rtc.TrackSource.SOURCE_MICROPHONE:
                self.task(self.capture(track, participant.identity))
        with self.app.app_context():
            token = media.access_token(row, 'transcriber-'+self.owner, 'Speech judge', worker=True)
        try:
            await self.room.connect(self.app.config['LIVEKIT_URL'], token)
            heartbeat_at = 0
            while not self.done:
                self.read()
                if self.done:
                    break
                at = engine.millis()
                if at - heartbeat_at > 1500:
                    self.heartbeat()
                    heartbeat_at = at
                self.end_on_silence(at)
                state = self.state
                # Browser-success turns have no judge task to release their PCM.
                for round_id in list(self.buffers):
                    if round_id != state.get('round_id') or state.get('phase') not in ('reading', 'judging'):
                        self.buffers.pop(round_id, None)
                holder = state.get('holder')
                if holder and state.get('phase') != 'reading' and self.last_permission != (holder, state.get('round_id')):
                    try:
                        await media.update_permissions(dict(self.app.config), self.identifier, holder, False)
                        self.last_permission = (holder, state.get('round_id'))
                    except Exception:
                        log.warning('Cannot revoke audio permission yet')
                if state.get('phase') == 'judging' and state['round_id'] not in self.processing:
                    self.processing.add(state['round_id'])
                    self.task(self.judge(state['round_id'], holder))
                await asyncio.sleep(.1)
        finally:
            self.done = True
            for task in list(self.tasks):
                task.cancel()
            await asyncio.gather(*self.tasks, return_exceptions=True)
            await self.room.disconnect()


async def serve(app, model):
    owner = str(uuid.uuid4())
    semaphore = asyncio.Semaphore(2)
    tasks = {}
    while True:
        with app.app_context():
            rows = list(db.session.scalars(select(GameRoom).where(GameRoom.mode == 'read',
                GameRoom.status.notin_(('closed', 'finished')), GameRoom.expires_at > engine.millis()).limit(30)))
            for room in rows:
                if room.id in tasks:
                    continue
                row = db.session.scalar(select(GameRoom).where(GameRoom.id == room.id).with_for_update().execution_options(populate_existing=True))
                state = copy.deepcopy(row.state)
                if state.get('voice_lease_at', 0) > engine.millis()-10000:
                    db.session.rollback()
                    continue
                state.update(voice_owner=owner, voice_lease_at=engine.millis())
                engine.mutate(row, state)
                db.session.commit()
                identifier = row.id
                runner = VoiceRoom(app, identifier, owner, model, semaphore)
                tasks[identifier] = asyncio.create_task(runner.run())
        for identifier, task in list(tasks.items()):
            if task.done():
                try:
                    task.result()
                except Exception:
                    log.exception('Voice room disconnected')
                del tasks[identifier]
        await asyncio.sleep(1)


if __name__ == '__main__':
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
    logging.basicConfig(level=logging.INFO)
    app = Flask('game-voice-worker')
    init_auth(app)
    for key in ('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'):
        app.config[key] = os.getenv(key, '')
    if not all(app.config[k] for k in ('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET')):
        raise RuntimeError('Configure LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET first')
    asyncio.run(serve(app, CloudSpeechRecognizer()))

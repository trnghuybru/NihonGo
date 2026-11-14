import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { CastleBattle, CastleConfig, CastleEvent, Side } from './engine';
import { createCastleAudio } from './audio';
import { castleProgress } from './progress';
import type { CastleRoom } from './online.types';
import { romanize } from './data';
import { CastleProgress, defaultProgress } from './progress.types';

export function useCastleGame(accountId: string) {
  const battleRef = useRef<CastleBattle | null>(null);
  const effectsRef = useRef<CastleEvent[]>([]);
  const audioRef = useRef<ReturnType<typeof createCastleAudio> | null>(null);
  const [revision, redraw] = useState(0);
  const [progress, setProgress] = useState(defaultProgress);
  const progressRef = useRef(progress);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const saved = useRef<CastleBattle | null>(null);
  const mounted = useRef(true);
  const persist = useCallback(
    (next: CastleProgress) => {
      progressRef.current = next;
      setProgress(next);
      castleProgress.save(accountId, next).catch(() => {
        if (mounted.current)
          setStorageError(
            'Thiết bị chưa cho phép lưu tiến trình. Bạn vẫn có thể chơi.',
          );
      });
    },
    [accountId],
  );
  useEffect(() => {
    mounted.current = true;
    let active = true;
    castleProgress
      .load(accountId)
      .then(value => {
        if (active) {
          progressRef.current = value;
          setProgress(value);
        }
      })
      .catch(() => {
        if (active)
          setStorageError('Không đọc được tiến trình đã lưu trên thiết bị.');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [accountId]);
  const flush = useCallback(() => {
    const events = battleRef.current?.drainEvents() || [];
    effectsRef.current.push(...events);
    if (effectsRef.current.length > 200)
      effectsRef.current.splice(0, effectsRef.current.length - 200);
    events.forEach(event => audioRef.current?.cue(event));
    redraw(n => n + 1);
  }, []);
  const saveResult = useCallback(
    (battle: CastleBattle, side: Side = 0) => {
      if (battle.phase !== 'finished' || saved.current === battle) return;
      saved.current = battle;
      const p = battle.players[side],
        level = battle.config.level ?? battle.config.words[0]?.level ?? 'N5',
        previous = progressRef.current;
      const score = Math.max(
        0,
        p.correct * 100 + p.bestCombo * 20 + Math.round(p.hp * 5),
      );
      const mistakes = new Map(previous.mistakes.map(word => [word.id, word]));
      battle.mistakes[side].forEach((word, id) => mistakes.set(id, word));
      persist({
        ...previous,
        best: {
          ...previous.best,
          [level]: Math.max(previous.best[level] || 0, score),
        },
        mistakes: [...mistakes.values()].slice(-300),
      });
    },
    [persist],
  );
  const pause = useCallback(() => {
    const battle = battleRef.current;
    if (
      battle &&
      battle.config.mode !== 'online' &&
      battle.phase !== 'finished'
    ) {
      battle.paused = true;
      redraw(n => n + 1);
    }
  }, []);
  useEffect(() => {
    let frame = 0,
      last = 0,
      painted = 0,
      lastTick = '';
    const tick = (time: number) => {
      const battle = battleRef.current;
      const delta = last ? time - last : 0;
      last = time;
      if (battle?.config.mode === 'online') {
        if (battle.phase !== 'finished') audioRef.current?.beat(battle.now);
        frame = requestAnimationFrame(tick);
        return;
      }
      if (battle && !battle.paused && battle.phase !== 'finished') {
        battle.update(delta);
        const phase: string = battle.phase;
        const events = battle.drainEvents();
        effectsRef.current.push(...events);
        if (effectsRef.current.length > 200)
          effectsRef.current.splice(0, effectsRef.current.length - 200);
        events.forEach(event => audioRef.current?.cue(event));
        audioRef.current?.beat(battle.now);
        const seconds =
          battle.phase === 'countdown'
            ? Math.ceil((3000 - battle.now) / 1000)
            : Math.ceil((battle.deadline - battle.now) / 1000);
        const tickKey = `${battle.round}:${seconds}`;
        if (
          seconds > 0 &&
          seconds <= 3 &&
          tickKey !== lastTick &&
          !battle.players.every(player => player.choice)
        ) {
          audioRef.current?.tick();
          lastTick = tickKey;
        }
        if (phase === 'finished') saveResult(battle);
        if (events.length || time - painted >= 100 || phase === 'finished') {
          painted = time;
          redraw(n => n + 1);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') pause();
    });
    const hidden = () => {
      if (document.hidden) pause();
    };
    if (Platform.OS === 'web')
      document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelAnimationFrame(frame);
      app.remove();
      if (Platform.OS === 'web')
        document.removeEventListener('visibilitychange', hidden);
      audioRef.current?.close().catch(() => undefined);
    };
  }, [pause, saveResult]);
  useEffect(() => {
    audioRef.current?.configure(
      progress.settings.sound,
      progress.settings.music,
    );
  }, [progress.settings]);
  const unlock = useCallback(() => {
    audioRef.current ??= createCastleAudio();
    audioRef.current.configure(
      progressRef.current.settings.sound,
      progressRef.current.settings.music,
    );
    audioRef.current.unlock().catch(() => undefined);
  }, []);
  const start = useCallback(
    (config: CastleConfig) => {
      const battle = new CastleBattle(config);
      saved.current = null;
      effectsRef.current.length = 0;
      battleRef.current = battle;
      unlock();
      redraw(n => n + 1);
    },
    [unlock],
  );
  const answer = useCallback(
    (side: Side, index: number, questionId?: number) => {
      const battle = battleRef.current;
      if (
        battle?.question &&
        battle.answer(side, index, questionId ?? battle.question.id)
      ) {
        unlock();
        flush();
      }
    },
    [flush, unlock],
  );
  const skill = useCallback(
    (side: Side, kind: 'arrow' | 'shield') => {
      if (battleRef.current?.skill(side, kind)) {
        unlock();
        flush();
      }
    },
    [flush, unlock],
  );
  const resume = useCallback(() => {
    if (battleRef.current) {
      battleRef.current.paused = false;
      unlock();
      redraw(n => n + 1);
    }
  }, [unlock]);
  const quit = useCallback(() => {
    battleRef.current = null;
    effectsRef.current.length = 0;
    redraw(n => n + 1);
  }, []);
  const onlineId = useRef('');
  const eventSequence = useRef(0);
  const applyOnline = useCallback(
    (room: CastleRoom) => {
      const value = room.frame;
      if (!value) {
        if (battleRef.current?.config.mode === 'online')
          battleRef.current = null;
        redraw(n => n + 1);
        return;
      }
      let battle = battleRef.current;
      if (
        !battle ||
        battle.config.mode !== 'online' ||
        onlineId.current !== room.id
      ) {
        battle = new CastleBattle({
          mode: 'online',
          difficulty: 'normal',
          roundSeconds: room.round_seconds,
          level: room.level,
          words: [],
          names: [value.players[0].name, value.players[1].name],
        });
        battleRef.current = battle;
        onlineId.current = room.id;
        eventSequence.current = 0;
        saved.current = null;
        effectsRef.current.length = 0;
      }
      const received = performance.now();
      const from = new Map(
        battle.troops.map(t => [t.id, battle!.visualX(t, received)]),
      );
      Object.assign(battle, value);
      battle.paused = false;
      battle.events = [];
      battle.visualFrom = from;
      battle.visualStartedAt = received;
      battle.mistakes = [new Map(), new Map()];
      for (const item of value.mistakes) {
        const word = {
          ...item,
          romaji: item.romaji || romanize(item.hiragana),
        };
        battle.mistakes[room.me].set(word.id, word);
      }
      const events = value.events.filter(
        event =>
          event.seq > eventSequence.current && value.now - event.at < 1200,
      );
      eventSequence.current = Math.max(
        eventSequence.current,
        ...value.events.map(event => event.seq),
      );
      effectsRef.current.push(...events);
      if (effectsRef.current.length > 200)
        effectsRef.current.splice(0, effectsRef.current.length - 200);
      events.forEach(event => audioRef.current?.cue(event));
      if (battle.phase === 'finished') saveResult(battle, room.me);
      redraw(n => n + 1);
    },
    [saveResult],
  );
  return {
    battleRef,
    applyOnline,
    prepareAudio: unlock,
    effectsRef,
    revision,
    progress,
    ready,
    storageError,
    persist,
    start,
    answer,
    skill,
    pause,
    resume,
    quit,
  };
}

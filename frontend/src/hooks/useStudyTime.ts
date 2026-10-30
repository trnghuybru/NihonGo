import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { StudyProgress, studyTimeService } from '../services/studyTimeService';
import {
  appendStudyInterval,
  studyDate,
  StudyInterval,
  studySeconds,
} from '../utils/studyTime';

type Cache = {
  progress: StudyProgress | null;
  pending: StudyInterval[];
  offset: number;
};

/** One timer per authenticated account; foreground study screens are the only source of time. */
export function useStudyTime(accountId: string, goalMinutes: number) {
  const [studying, setStudying] = useState(false);
  const [display, setDisplay] = useState({
    seconds: 0,
    running: false,
    ready: false,
    error: '',
    goalSeconds: goalMinutes * 60,
  });
  const cache = useRef<Cache>({ progress: null, pending: [], offset: 0 });
  const initialized = useRef(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const active = useRef(false);
  const foreground = useRef(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const previous = useRef<number | null>(null);
  const writes = useRef(Promise.resolve());
  const storage = `com.nihongoflow.study.${accountId}`;
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const clock = useRef<{ time: number; monotonic: number } | null>(null);
  const currentTime = useCallback(() => {
    const anchor = clock.current;
    return Math.floor(
      anchor
        ? anchor.time + performance.now() - anchor.monotonic
        : Date.now() + cache.current.offset,
    );
  }, []);

  const persist = useCallback(() => {
    if (!initialized.current) return;
    const snapshot = JSON.stringify(cache.current);
    writes.current = writes.current
      .then(async () => {
        await Keychain.setGenericPassword('study', snapshot, {
          service: storage,
        });
      })
      .catch(() => {});
  }, [storage]);

  const render = useCallback(
    (error?: string) => {
      if (!mounted.current) return;
      const now = currentTime();
      const day = studyDate(now);
      const base =
        cache.current.progress?.date === day ? cache.current.progress : null;
      setDisplay(old => ({
        seconds: studySeconds(
          [...(base?.intervals ?? []), ...cache.current.pending],
          day,
        ),
        goalSeconds: base?.goal_seconds ?? goalMinutes * 60,
        running:
          active.current && foreground.current && !!cache.current.progress,
        ready: initialized.current && !!cache.current.progress,
        error: error ?? old.error,
      }));
    },
    [currentTime, goalMinutes],
  );

  const sample = useCallback(() => {
    const now = currentTime();
    const last = previous.current;
    previous.current = now;
    // Timer throttling, device sleep and clock jumps must never become study time.
    if (
      initialized.current &&
      cache.current.progress &&
      active.current &&
      foreground.current &&
      last !== null &&
      now > last &&
      now - last <= 5000
    ) {
      appendStudyInterval(cache.current.pending, last, now);
    }
    render();
  }, [currentTime, render]);

  const sync = useCallback(async () => {
    if (!initialized.current || busy.current) return;
    busy.current = true;
    const batch = cache.current.pending
      .slice(0, 60)
      .map(([a, b]): StudyInterval => [a, b]);
    persist();
    try {
      const result = batch.length
        ? await studyTimeService.record(accountId, batch)
        : await studyTimeService.load(accountId);
      const acknowledgedEnd = batch[batch.length - 1]?.[1];
      if (acknowledgedEnd !== undefined) {
        cache.current.pending = cache.current.pending.flatMap(
          ([start, end]): StudyInterval[] =>
            end <= acknowledgedEnd
              ? []
              : [[Math.max(start, acknowledgedEnd), end]],
        );
      }
      const needsCalibration =
        !clock.current ||
        !cache.current.progress ||
        Math.abs(result.server_time_ms - currentTime()) > 5000;
      cache.current.offset = result.server_time_ms - Date.now();
      if (needsCalibration) {
        clock.current = {
          time: result.server_time_ms,
          monotonic: performance.now(),
        };
        previous.current = currentTime();
      }
      cache.current.progress = result;
      persist();
      render('');
    } catch {
      render('Chưa đồng bộ');
    } finally {
      busy.current = false;
    }
  }, [accountId, currentTime, persist, render]);
  syncRef.current = sync;

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const saved = await Keychain.getGenericPassword({ service: storage });
        if (cancelled) return;
        if (saved) {
          const stored = JSON.parse(saved.password) as Cache;
          if (
            Array.isArray(stored.pending) &&
            Number.isFinite(stored.offset) &&
            stored.progress &&
            Array.isArray(stored.progress.intervals)
          ) {
            cache.current = stored;
            cache.current.pending = stored.pending.filter(
              row =>
                Array.isArray(row) &&
                row.length === 2 &&
                row.every(Number.isInteger) &&
                row[0] >= Date.now() + stored.offset - 86400000 &&
                row[1] > row[0] &&
                row[1] - row[0] <= 60000,
            );
          }
        }
      } catch {
        /* A missing cache does not prevent loading the account's progress. */
      }
      if (cancelled) return;
      clock.current = {
        time: Date.now() + cache.current.offset,
        monotonic: performance.now(),
      };
      initialized.current = true;
      previous.current = currentTime();
      await syncRef.current();
    })();
    return () => {
      cancelled = true;
      sample();
      persist();
      mounted.current = false;
      syncRef.current();
    };
    // Account lifetime only; changing a goal must not restart or reload the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  useEffect(() => {
    sample();
    active.current = studying;
    previous.current = currentTime();
    render();
    if (!studying) syncRef.current();
  }, [studying, currentTime, sample, render]);

  useEffect(() => {
    const updateForeground = (visible: boolean) => {
      sample();
      foreground.current = visible;
      previous.current = currentTime();
      render();
      persist();
      syncRef.current();
    };
    const subscription = AppState.addEventListener('change', state => {
      updateForeground(
        state === 'active' && (Platform.OS !== 'web' || document.hasFocus()),
      );
    });
    const onFocus = () =>
      updateForeground(document.visibilityState !== 'hidden');
    const onBlur = () => updateForeground(false);
    if (Platform.OS === 'web') {
      foreground.current =
        document.visibilityState !== 'hidden' && document.hasFocus();
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onBlur);
    }
    let ticks = 0;
    let day = studyDate(currentTime());
    const timer = setInterval(() => {
      sample();
      ticks += 1;
      const nextDay = studyDate(currentTime());
      if (
        (ticks % 15 === 0 && cache.current.pending.length > 0) ||
        (ticks % 60 === 0 && foreground.current) ||
        day !== nextDay
      ) {
        day = nextDay;
        if (cache.current.pending.length || foreground.current)
          syncRef.current();
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onBlur);
      }
    };
  }, [currentTime, sample, persist, render]);

  return { ...display, setStudying, retry: sync };
}

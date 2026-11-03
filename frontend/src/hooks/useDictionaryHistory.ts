import { useCallback, useEffect, useState } from 'react';
import {
  dictionaryService,
  DictionaryHistoryItem,
} from '../services/dictionaryService';

export function useRecordDictionaryHistory(
  kind: DictionaryHistoryItem['kind'],
  target: string | undefined,
  active = true,
) {
  useEffect(() => {
    if (active && target) {
      // History availability must not prevent viewing a definition.
      dictionaryService.recordHistory(kind, target).catch(() => undefined);
    }
  }, [active, kind, target]);
}

export function useDictionaryHistory(active = true) {
  const [items, setItems] = useState<DictionaryHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = true;
    // A completed write takes precedence over an older in-flight history read.
    let changed = false;
    const unsubscribe = dictionaryService.subscribeHistory(next => {
      changed = true;
      if (current) {
        setItems(next);
        setError('');
      }
    });
    dictionaryService
      .history()
      .then(result => {
        if (current && !changed) {
          setItems(result.items);
          setError('');
        }
      })
      .catch(() => {
        if (current && !changed) setError('Chưa tải được lịch sử.');
      });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [active, attempt]);
  const clear = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await dictionaryService.clearHistory();
      setItems(result.items);
    } catch {
      setError('Chưa xoá được lịch sử.');
    } finally {
      setBusy(false);
    }
  }, []);
  return {
    items,
    busy,
    error,
    clear,
    retry: () => setAttempt(value => value + 1),
  };
}
export type DictionaryHistoryState = ReturnType<typeof useDictionaryHistory>;

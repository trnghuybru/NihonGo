import { useEffect } from 'react';
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

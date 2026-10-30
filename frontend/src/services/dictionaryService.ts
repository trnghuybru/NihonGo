import { authenticatedRequest } from './authService';

export type Gloss = { language: string; text: string; machine?: boolean };
export type DictionarySource = {
  id: string;
  name: string;
  url?: string;
  license?: string;
  license_url?: string;
  count?: number;
  notes?: string;
};
export type WordPreview = {
  id: string;
  word: string;
  reading: string;
  common: boolean;
  glosses: Gloss[];
  source_id: string;
  match_type?: 'exact' | 'prefix' | 'contains';
};
export type WordDetail = WordPreview & {
  forms: { text: string; info: string[] }[];
  readings: {
    text: string;
    applies_to: string[];
    info: string[];
    no_kanji: boolean;
  }[];
  senses: {
    parts_of_speech: string[];
    glosses: Gloss[];
    notes: string[];
    tags: string[];
    applies_to_forms?: string[];
    applies_to_readings?: string[];
    reference_id?: string;
  }[];
  examples: {
    japanese: string;
    reading?: string;
    meaning_vi?: string | null;
  }[];
  han_viet?: string[];
  references?: {
    word_id: string;
    title: string;
    url: string;
    level: string;
    quality: string;
  }[];
  kanji: string[];
  kanji_details?: KanjiPreview[];
  related_entries?: WordPreview[];
  other_entries: WordPreview[];
  source: DictionarySource;
};
export type KanjiPreview = {
  literal: string;
  strokes: number;
  on: string[];
  kun: string[];
  han_viet: string[];
  meanings: Gloss[];
};
export type KanjiDetail = KanjiPreview & {
  radicals: number[];
  nanori: string[];
  grade: string | null;
  frequency?: string | number | null;
  stroke_paths?: string[];
  source: DictionarySource;
  diagram_source?: DictionarySource;
  compounds: WordPreview[];
};
export type DictionaryResults<T> = {
  items: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};
export type DictionaryHistoryItem = {
  kind: 'word' | 'kanji';
  target: string;
  word: string;
  reading: string;
  glosses: Gloss[];
  viewed_at: number;
};
type HistoryResult = { items: DictionaryHistoryItem[] };
const historyListeners = new Set<(items: DictionaryHistoryItem[]) => void>();
async function historyWrite(data: unknown, method: 'POST' | 'DELETE') {
  // Never deliver an old account's in-flight response to newly mounted listeners.
  const recipients = [...historyListeners];
  const result = await authenticatedRequest<HistoryResult>(
    '/dictionary/history',
    data,
    method,
  );
  recipients.forEach(listener => {
    if (historyListeners.has(listener)) listener(result.items);
  });
  return result;
}
export const dictionaryService = {
  history: () => authenticatedRequest<HistoryResult>('/dictionary/history'),
  recordHistory: (kind: DictionaryHistoryItem['kind'], target: string) =>
    historyWrite({ kind, target }, 'POST'),
  clearHistory: () => historyWrite(undefined, 'DELETE'),
  subscribeHistory: (listener: (items: DictionaryHistoryItem[]) => void) => {
    historyListeners.add(listener);
    return () => {
      historyListeners.delete(listener);
    };
  },
  words: (query: string, page = 1, language: 'auto' | 'vi' = 'auto') =>
    authenticatedRequest<DictionaryResults<WordPreview>>(
      `/dictionary/words?q=${encodeURIComponent(query)}&page=${page}${
        language === 'vi' ? '&language=vi' : ''
      }`,
    ),
  word: (id: string) =>
    authenticatedRequest<WordDetail>(
      `/dictionary/words/${encodeURIComponent(id)}`,
    ),
  kanji: (query: string, page = 1) =>
    authenticatedRequest<DictionaryResults<KanjiPreview>>(
      `/dictionary/kanji?q=${encodeURIComponent(query)}&page=${page}`,
    ),
  character: (literal: string) =>
    authenticatedRequest<KanjiDetail>(
      `/dictionary/kanji/${encodeURIComponent(literal)}`,
    ),
  sources: () =>
    authenticatedRequest<{ items: DictionarySource[] }>('/dictionary/sources'),
};

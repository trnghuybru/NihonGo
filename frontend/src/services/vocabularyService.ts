import { authenticatedRequest } from './authService';

export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];
export type VocabularyTextbook = {
  id: string;
  title: string;
  level: JlptLevel;
  source_url: string;
  word_count: number;
  lesson_count: number;
};
export type VocabularyLessonSummary = {
  id: string;
  number: number;
  title: string;
  word_count: number;
};
export type VocabularyUnit = {
  number: number;
  title: string;
  word_count: number;
  lessons: VocabularyLessonSummary[];
};
export type VocabularyBookDetail = {
  textbook: VocabularyTextbook;
  units: VocabularyUnit[];
};
type VocabularyExample = {
  japanese: string;
  reading: string;
  meaning_vi: string | null;
};
export type VocabularyWord = {
  id: string;
  number: number;
  word: string;
  reading: string;
  meaning_vi: string;
  han_viet: string | null;
  has_audio?: boolean;
  examples: VocabularyExample[];
  related: (VocabularyExample & { label: string; type: string })[];
};
export type VocabularyLessonDetail = {
  lesson: VocabularyLessonSummary & {
    textbook_id: string;
    unit_number: number;
    unit_title: string;
    source_url: string;
    audio_urls: string[];
  };
  words: VocabularyWord[];
};
export type VocabularySearchResult = {
  items: VocabularyWord[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export const vocabularyService = {
  audioPlayback: (wordId: string) =>
    authenticatedRequest<{ url: string; expires_in: number }>(
      `/vocabulary/words/${encodeURIComponent(wordId)}/audio/playback`,
    ),
  textbooks: (level: JlptLevel) =>
    authenticatedRequest<{ level: JlptLevel; items: VocabularyTextbook[] }>(
      `/vocabulary/textbooks?level=${level}`,
    ),
  textbook: (id: string) =>
    authenticatedRequest<VocabularyBookDetail>(
      `/vocabulary/textbooks/${encodeURIComponent(id)}`,
    ),
  lesson: (id: string) =>
    authenticatedRequest<VocabularyLessonDetail>(
      `/vocabulary/lessons/${encodeURIComponent(id)}`,
    ),
  search: (level: JlptLevel, query: string, page = 1) =>
    authenticatedRequest<VocabularySearchResult>(
      `/vocabulary/words?level=${level}&q=${encodeURIComponent(
        query,
      )}&page=${page}&page_size=20`,
    ),
};

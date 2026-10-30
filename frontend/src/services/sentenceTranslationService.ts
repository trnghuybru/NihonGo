import type { ShadowingLookupWord, ShadowingToken } from './shadowingService';
import { authenticatedRequest } from './authService';
export type TranslationLanguage = 'ja' | 'vi';
export type SentenceTranslationResult = {
  text: string;
  translation: string;
  source: TranslationLanguage;
  target: TranslationLanguage;
  model: string;
  cached: boolean;
  elapsed_ms: number;
  japanese: string;
  vietnamese: string;
  paragraphs: { id: string; text: string; tokens: ShadowingToken[] }[];
  words: Record<string, ShadowingLookupWord>;
};
export const sentenceTranslationService = {
  translate: (
    text: string,
    source: TranslationLanguage,
    target: TranslationLanguage,
  ) =>
    authenticatedRequest<SentenceTranslationResult>(
      '/dictionary/translate',
      { text, source, target },
      'POST',
      { timeoutMs: 90000 },
    ),
};

// Exact dictionary matches take priority; this only identifies likely sentences for fallback.
export function isSentenceQuery(query: string): boolean {
  const value = query.trim();
  if (value.length > 100) return true;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) {
    return (
      /[。！？!?\n]/u.test(value) ||
      /(?:です|ます|でした|ました|ません|ください|でしょう|だろう)[。！？!?]?$/u.test(
        value,
      ) ||
      (value.length >= 4 &&
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][はがをにでとへ][\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
          value,
        ))
    );
  }
  return value.split(/\s+/).filter(Boolean).length >= 4;
}

import { authenticatedRequest } from './authService';
import type { ShadowingLookupWord, ShadowingToken } from './shadowingService';
export type ReadingFilters = {
  level: string;
  type: string;
  q: string;
  page: number;
};
export type ReadingPreview = {
  id: string;
  title: string;
  level: string;
  kind: string;
  kind_label: string;
  exercise: number;
  paragraph: number;
  excerpt: string;
  character_count: number;
  source_url: string;
};
export type ReadingCatalog = {
  items: ReadingPreview[];
  types: { id: string; label: string }[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};
export type ReadingQuestion = { id: string; text: string; options: string[] };
export type ReadingGrade = {
  id: string;
  version: string;
  submitted_at: number;
  correct: number;
  total: number;
  score: number;
  results: (ReadingQuestion & {
    selected_index: number;
    correct_index: number;
    correct: boolean;
  })[];
};
export type ReadingQuizData = {
  version: string;
  questions: ReadingQuestion[];
  last_attempt: ReadingGrade | null;
};
export type ReadingSubmission = {
  request_id: string;
  version: string;
  answers: Record<string, number>;
};
export type ReadingAnchor = {
  sentence_id: string;
  paragraph_id: string;
  quote: string;
  start: number;
  end: number;
};
export type ReadingSentence = {
  id: string;
  paragraph_id: string;
  text: string;
  start: number;
  end: number;
};
export type ReadingSentenceRole =
  | 'subject'
  | 'predicate'
  | 'object'
  | 'modifier'
  | 'adjunct'
  | 'other';
export type ReadingSentenceSegment = {
  id: string;
  text: string;
  role: ReadingSentenceRole;
  is_core: boolean;
  explanation: string;
  location: ReadingAnchor;
};
export type ReadingSentenceAnalysis = {
  segments?: ReadingSentenceSegment[];
  core_text?: string;
  core_translation_vi?: string;
  implicit_subject?: string;
  sentence_id: string;
  original: string;
  main_idea: string;
  translation_vi: string;
  core: { subject: string; predicate: string; object: string };
  layers: { text: string; meaning: string }[];
  parts: { role: string; explanation: string; location: ReadingAnchor }[];
  caution: string;
};
export type ReadingAnalysis = {
  summary: string;
  caution: string;
  structure: { label: string; explanation: string; location: ReadingAnchor }[];
  vocabulary: {
    word: string;
    reading: string;
    meaning: string;
    location: ReadingAnchor;
  }[];
  grammar: { pattern: string; explanation: string; location: ReadingAnchor }[];
  sentences: ReadingSentenceAnalysis[];
};
export type ReadingExplanation = {
  question_id: string;
  correct_index: number;
  explanation: string;
  answer_supported: boolean;
  caution: string;
  evidence: ReadingAnchor[];
};
export type ReadingPassage = ReadingPreview & {
  quiz: ReadingQuizData;
  sentences?: ReadingSentence[];
  study_analysis?: ReadingAnalysis | null;
  text: string;
  paragraphs: { id: string; text: string; tokens: ShadowingToken[] }[];
  words: Record<string, ShadowingLookupWord>;
};
export const readingService = {
  analyze: (id: string) =>
    authenticatedRequest<ReadingAnalysis>(
      '/reading/passages/' + encodeURIComponent(id) + '/analysis',
      {},
      'POST',
      { timeoutMs: 90000 },
    ),
  analyzeSentence: (id: string, sentence: string) =>
    authenticatedRequest<ReadingSentenceAnalysis>(
      '/reading/passages/' +
        encodeURIComponent(id) +
        '/sentences/' +
        encodeURIComponent(sentence) +
        '/analysis',
      {},
      'POST',
      { timeoutMs: 90000 },
    ),
  explain: (id: string, question: string, attempt: string) =>
    authenticatedRequest<ReadingExplanation>(
      '/reading/passages/' +
        encodeURIComponent(id) +
        '/questions/' +
        encodeURIComponent(question) +
        '/explanation',
      { attempt_id: attempt },
      'POST',
      { timeoutMs: 90000 },
    ),
  submit: (id: string, submission: ReadingSubmission) =>
    authenticatedRequest<ReadingGrade>(
      '/reading/passages/' + encodeURIComponent(id) + '/attempts',
      submission,
      'POST',
    ),
  list: (filters: ReadingFilters) =>
    authenticatedRequest<ReadingCatalog>(
      '/reading/passages?' +
        new URLSearchParams({ ...filters, page: String(filters.page) }),
    ),
  passage: (id: string) =>
    authenticatedRequest<ReadingPassage>(
      '/reading/passages/' + encodeURIComponent(id),
    ),
};

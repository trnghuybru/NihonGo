import { authenticatedRequest } from './authService';
import type { ShadowingLookupWord, ShadowingToken } from './shadowingService';

export type ExamQuestion = {
  id: string;
  number: number;
  group: number;
  subquestion?: number;
  content_format?: 'image';
  prompt: string;
  instruction: string;
  target?: string;
  passage: string | null;
  options: string[];
  images: {
    id: string;
    image_data_url: string;
    width_px: number;
    height_px: number;
  }[];
  audio_only_options?: boolean;
};
export type ExamSection = {
  id: string;
  label: string;
  original_label: string;
  questions: ExamQuestion[];
  duration_seconds?: number | null;
};
export type ExamPreview = {
  id: string;
  title: string;
  level: string;
  year: number;
  month: number;
  version: number;
  audio_url: string | null;
  total: number;
  content_note: string;
  timing_source_url?: string | null;
  source_only?: boolean;
  sections: {
    id: string;
    label: string;
    original_label: string;
    total: number;
    duration_seconds?: number | null;
  }[];
};
export type Exam = Omit<ExamPreview, 'sections'> & {
  sections: ExamSection[];
  source_filename: string;
};
export type ExamGrade = {
  review_token?: string;
  total: number;
  answered: number;
  correct: number;
  note: string;
  sections: {
    id: string;
    label: string;
    total: number;
    answered: number;
    correct: number;
  }[];
  results: Record<
    string,
    {
      selected_index: number | null;
      correct_index: number;
      status: 'unanswered' | 'correct' | 'incorrect';
    }
  >;
};
export type ExamSource = {
  id: string;
  title: string;
  documents: {
    filename: string;
    kind: string;
    pages: {
      page: number;
      text: string;
      method: string;
      image_data_url?: string;
      width_px?: number;
      height_px?: number;
    }[];
    question_images?: {
      id: string;
      source_page: number;
      image_data_url: string;
      width_px: number;
      height_px: number;
    }[];
  }[];
};
export type ExamReview = {
  prompt_tokens: ShadowingToken[];
  paragraphs: { text: string; tokens: ShadowingToken[] }[];
  words: Record<string, ShadowingLookupWord>;
};
export type ExamExplanation = {
  option_index: number;
  correct_index: number;
  explanation: string;
  caution: string;
  grammar: {
    pattern: string;
    meaning: string;
    source_quote: string;
    example: string;
    translation: string;
  }[];
};
export const jlptService = {
  source: (id: string) =>
    authenticatedRequest<ExamSource>('/jlpt/sources/' + encodeURIComponent(id)),
  review: (id: string, question: string, review_token: string) =>
    authenticatedRequest<ExamReview>(
      `/jlpt/exams/${encodeURIComponent(id)}/questions/${encodeURIComponent(
        question,
      )}/review`,
      { review_token },
      'POST',
    ),
  explain: (
    id: string,
    question: string,
    review_token: string,
    option_index: number,
  ) =>
    authenticatedRequest<ExamExplanation>(
      `/jlpt/exams/${encodeURIComponent(id)}/questions/${encodeURIComponent(
        question,
      )}/explanation`,
      { review_token, option_index },
      'POST',
      { timeoutMs: 65000 },
    ),
  list: () => authenticatedRequest<{ items: ExamPreview[] }>('/jlpt/exams'),
  exam: (id: string) =>
    authenticatedRequest<Exam>('/jlpt/exams/' + encodeURIComponent(id)),
  grade: (id: string, version: number, answers: Record<string, number>) =>
    authenticatedRequest<ExamGrade>(
      '/jlpt/exams/' + encodeURIComponent(id) + '/grade',
      { version, answers },
      'POST',
    ),
};

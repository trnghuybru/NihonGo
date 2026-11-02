import { authenticatedRequest } from './authService';
import type { VideoExample } from './videoExamplesService';

export type ShadowingJob = {
  id: string;
  video_id: string;
  title: string;
  status:
    | 'queued'
    | 'extracting'
    | 'transcribing'
    | 'normalizing'
    | 'ready'
    | 'failed';
  error_code: string | null;
  error_message: string | null;
  can_retry: boolean;
  is_mine?: boolean;
};
export type ShadowingToken = { text: string; key?: string };
export type ShadowingLookupWord = {
  surface: string;
  lemma: string;
  reading: string;
  pos: string;
};
export type ShadowingLesson = {
  job: ShadowingJob;
  video: VideoExample['video'] & { duration_seconds?: number };
  caption_kind: 'manual' | 'asr';
  segments: VideoExample[];
  captions?: (VideoExample & { segment_id: string })[];
  tokens?: {
    segments: Record<string, ShadowingToken[]>;
    captions: Record<string, ShadowingToken[]>;
  };
  words?: Record<string, ShadowingLookupWord>;
};
const root = '/listening/shadowing/jobs';
export type ShadowingQuizLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type ShadowingQuestion = {
  id: string;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  trigger_seconds: number;
  evidence_segment_ids: string[];
};
export type ShadowingTranslation = {
  status: 'not_requested' | 'queued' | 'translating' | 'ready' | 'failed';
  language: 'vi';
  items: Record<string, string>;
  completed: number;
  total: number;
  error_message: string | null;
  model?: string;
};
export const shadowingService = {
  savedQuestions: (id: string, level: ShadowingQuizLevel = 'N3') =>
    authenticatedRequest<{
      questions: ShadowingQuestion[];
      level?: ShadowingQuizLevel;
      available_levels?: ShadowingQuizLevel[];
    }>(`${root}/${encodeURIComponent(id)}/questions?level=${level}`),
  questions: (id: string, level: ShadowingQuizLevel = 'N3') =>
    authenticatedRequest<{
      questions: ShadowingQuestion[];
      level?: ShadowingQuizLevel;
      available_levels?: ShadowingQuizLevel[];
    }>(
      `${root}/${encodeURIComponent(id)}/questions`,
      { count: 5, level },
      'POST',
      { timeoutMs: 75000 },
    ),
  translation: (id: string) =>
    authenticatedRequest<ShadowingTranslation>(
      `${root}/${encodeURIComponent(id)}/translation`,
    ),
  requestTranslation: (id: string) =>
    authenticatedRequest<ShadowingTranslation>(
      `${root}/${encodeURIComponent(id)}/translation`,
      {},
      'POST',
    ),
  list: (scope: 'all' | 'mine' = 'all', cursor?: string) =>
    authenticatedRequest<{
      items: ShadowingJob[];
      next_cursor?: string | null;
    }>(
      `${root}?scope=${scope}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`,
    ),
  submit: (url: string) =>
    authenticatedRequest<{ job: ShadowingJob }>(root, { url }),
  status: (id: string) =>
    authenticatedRequest<{ job: ShadowingJob }>(
      `${root}/${encodeURIComponent(id)}`,
    ),
  retry: (id: string) =>
    authenticatedRequest<{ job: ShadowingJob }>(
      `${root}/${encodeURIComponent(id)}/retry`,
      {},
      'POST',
    ),
  lesson: (id: string) =>
    authenticatedRequest<ShadowingLesson>(
      `${root}/${encodeURIComponent(id)}/lesson`,
    ),
};

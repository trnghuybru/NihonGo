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
  entries: {
    id: string;
    word: string;
    reading: string;
    meaning_vi: string;
    level: string;
  }[];
};
export type ShadowingLesson = {
  job: ShadowingJob;
  video: VideoExample['video'];
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
export const shadowingService = {
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

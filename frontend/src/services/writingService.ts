import { authenticatedRequest } from './authService';

export type WritingPrompt = {
  id: string;
  title: string;
  level: string;
  prompt_type: string;
  category?: string;
  instruction: string;
  model_hint: string;
  sort_order: number;
};

export type WritingDraft = {
  id: string;
  user_id: string;
  prompt_id: string;
  text: string;
  word_count: number;
  status: string;
  created_at: number;
  updated_at: number;
  prompt: WritingPrompt | null;
};

export type WritingCorrection = {
  start: number;
  end: number;
  original: string;
  replacement: string;
  explanation: string;
  criterion_id: string;
  kind: 'error' | 'suggestion';
};

export type WritingAssessment = {
  version: 1;
  level: string;
  criteria: {
    id: string;
    title: string;
    score: number;
    comment: string;
    subcriteria: { id: string; title: string; score: number }[];
  }[];
  corrections: WritingCorrection[];
  next_step: string;
};

export type WritingSubmissionApi = {
  id: string;
  user_id: string;
  prompt_id?: string | null;
  prompt_title: string;
  text: string;
  corrected_text: string;
  correctedText?: string;
  score: number;
  feedback: string;
  assessment?: WritingAssessment | null;
  prompt?: WritingPrompt | null;
  submitted_at: number;
  submittedAt?: number | string;
};

export type WritingPromptPage = {
  items: WritingPrompt[];
  categories?: { id: string; label: string }[];
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    has_more: boolean;
  };
};
export const writingService = {
  prompts: (filters?: {
    page: number;
    level?: string;
    category?: string;
    q?: string;
  }) => {
    const query = filters
      ? '?' +
        Object.entries({ ...filters, per_page: 12 })
          .filter(([, value]) => value !== '')
          .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
          .join('&')
      : '';
    return authenticatedRequest<WritingPromptPage>('/writing/prompts' + query);
  },
  drafts: () =>
    authenticatedRequest<{ items: WritingDraft[] }>('/writing/drafts'),
  submissions: () =>
    authenticatedRequest<{ items: WritingSubmissionApi[] }>(
      '/writing/submissions',
    ),
  saveDraft: (promptId: string, text: string, customTitle?: string) =>
    authenticatedRequest<{ draft: WritingDraft }>(
      '/writing/drafts',
      {
        prompt_id: promptId || undefined,
        text,
        ...(customTitle ? { custom_title: customTitle } : {}),
      },
      'POST',
    ),
  saveCustomDraft: (text: string, customTitle?: string) =>
    authenticatedRequest<{ draft: WritingDraft }>(
      '/writing/drafts',
      {
        text,
        ...(customTitle ? { custom_title: customTitle } : {}),
      },
      'POST',
    ),
  updateDraft: (draftId: string, text: string) =>
    authenticatedRequest<{ draft: WritingDraft }>(
      `/writing/drafts/${encodeURIComponent(draftId)}`,
      { text },
      'PUT',
    ),
  deleteDraft: (draftId: string) =>
    authenticatedRequest<{ deleted: boolean; draft_id: string }>(
      `/writing/drafts/${encodeURIComponent(draftId)}`,
      undefined,
      'DELETE',
    ),
  submitWriting: (payload: {
    prompt_id?: string;
    prompt_title?: string;
    text: string;
    level?: string;
  }) =>
    authenticatedRequest<{ submission: WritingSubmissionApi }>(
      '/writing/submissions',
      payload,
      'POST',
      { timeoutMs: 90000 },
    ),
  evaluateSubmission: (submissionId: string) =>
    authenticatedRequest<{ submission: WritingSubmissionApi }>(
      `/writing/submissions/${encodeURIComponent(submissionId)}/evaluate`,
      {},
      'POST',
      { timeoutMs: 90000 },
    ),
};

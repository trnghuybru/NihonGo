import { authenticatedRequest } from './authService';

export type WritingPrompt = {
  id: string;
  title: string;
  level: string;
  prompt_type: string;
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
  submitted_at: number;
  submittedAt?: number | string;
};

export const writingService = {
  prompts: () =>
    authenticatedRequest<{ items: WritingPrompt[] }>('/writing/prompts'),
  drafts: () =>
    authenticatedRequest<{ items: WritingDraft[] }>('/writing/drafts'),
  submissions: () =>
    authenticatedRequest<{ items: WritingSubmissionApi[] }>('/writing/submissions'),
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
  }) =>
    authenticatedRequest<{ submission: WritingSubmissionApi }>(
      '/writing/submissions',
      payload,
      'POST',
    ),
  evaluateSubmission: (submissionId: string) =>
    authenticatedRequest<{ submission: WritingSubmissionApi }>(
      `/writing/submissions/${encodeURIComponent(submissionId)}/evaluate`,
      {},
      'POST',
    ),
};

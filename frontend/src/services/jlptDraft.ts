import type { Exam, ExamPreview } from './jlptService';
import { jlptDraftStorage } from './jlptDraftStorage';
import type { ExamMode, ExamTiming } from './jlptTiming';

export type ExamDraft = {
  version: number;
  answers: Record<string, number>;
  flagged: string[];
  index: number;
  startedAt: number;
  submitted: boolean;
  updatedAt?: number;
  elapsedMs?: number;
  mode?: ExamMode;
  timing?: ExamTiming;
  result?: { correct: number; answered: number; total: number };
};
export type ExamProgress = {
  answered: number;
  total: number;
  index: number;
  submitted: boolean;
  updatedAt: number;
  mode: ExamMode;
  correct?: number;
};
const memory = new Map<string, string>();
const writes = new Map<string, Promise<boolean>>();
const key = (account: string, exam: string) =>
  `nihongo.jlpt.v1.${account}.${exam}`;
export function saveExamDraft(
  account: string,
  exam: string,
  draft: ExamDraft,
): Promise<boolean> {
  const storageKey = key(account, exam);
  const value = JSON.stringify({ ...draft, updatedAt: Date.now() });
  memory.set(storageKey, value);
  // Serial writes prevent an older native save from overwriting a newer answer.
  const pending = (writes.get(storageKey) ?? Promise.resolve(true)).then(
    async () => {
      if (memory.get(storageKey) !== value) return true;
      try {
        await jlptDraftStorage.write(storageKey, value);
        return true;
      } catch {
        return false;
      }
    },
  );
  writes.set(storageKey, pending);
  return pending;
}

export async function loadExamDrafts(account: string, catalog: ExamPreview[]) {
  await Promise.all(
    catalog.map(async exam => {
      const storageKey = key(account, exam.id);
      if (memory.has(storageKey)) return;
      try {
        const value = await jlptDraftStorage.read(storageKey);
        if (value && !memory.has(storageKey)) memory.set(storageKey, value);
      } catch {
        /* An unavailable store must not prevent opening an exam. */
      }
    }),
  );
}

function readRaw(
  account: string,
  exam: Pick<ExamPreview, 'id' | 'version' | 'total'>,
): ExamDraft | null {
  try {
    const value = memory.get(key(account, exam.id));
    if (!value) return null;
    const draft = JSON.parse(value) as ExamDraft;
    if (
      draft.version !== exam.version ||
      !draft.answers ||
      typeof draft.answers !== 'object' ||
      Array.isArray(draft.answers) ||
      Object.values(draft.answers).some(
        v => !Number.isInteger(v) || v < 0 || v > 3,
      ) ||
      Object.keys(draft.answers).length > exam.total ||
      !Array.isArray(draft.flagged) ||
      !draft.flagged.every(id => typeof id === 'string') ||
      !Number.isInteger(draft.index) ||
      draft.index < 0 ||
      draft.index >= exam.total ||
      !Number.isFinite(draft.startedAt) ||
      draft.startedAt <= 0 ||
      draft.startedAt > Date.now() ||
      typeof draft.submitted !== 'boolean' ||
      (draft.mode !== undefined &&
        !['practice', 'timed'].includes(draft.mode)) ||
      (draft.mode === 'timed' &&
        (!draft.timing ||
          !Number.isInteger(draft.timing.section) ||
          draft.timing.section < 0 ||
          draft.timing.section > 2 ||
          !['running', 'between', 'complete'].includes(draft.timing.phase) ||
          (draft.timing.phase === 'running'
            ? !Number.isFinite(draft.timing.deadlineAt) ||
              draft.timing.deadlineAt! <= 0
            : draft.timing.deadlineAt !== null))) ||
      (draft.elapsedMs !== undefined &&
        (!Number.isFinite(draft.elapsedMs) || draft.elapsedMs < 0)) ||
      (draft.updatedAt !== undefined &&
        (!Number.isFinite(draft.updatedAt) ||
          draft.updatedAt < draft.startedAt ||
          draft.updatedAt > Date.now()))
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}

export function readExamProgress(
  account: string,
  exam: ExamPreview,
): ExamProgress | null {
  const draft = readRaw(account, exam);
  return draft
    ? {
        answered: Object.keys(draft.answers).length,
        total: exam.total,
        index: draft.index,
        submitted: draft.submitted,
        updatedAt: draft.updatedAt ?? draft.startedAt,
        mode: draft.mode ?? 'practice',
        correct:
          draft.submitted &&
          draft.result &&
          Number.isInteger(draft.result.correct) &&
          Number.isInteger(draft.result.answered) &&
          draft.result.total === exam.total &&
          draft.result.answered === Object.keys(draft.answers).length &&
          draft.result.correct >= 0 &&
          draft.result.correct <= draft.result.answered
            ? draft.result.correct
            : undefined,
      }
    : null;
}

export function readExamDraft(account: string, exam: Exam): ExamDraft | null {
  try {
    const draft = readRaw(account, exam);
    if (!draft) return null;
    const questions = exam.sections.flatMap(s => s.questions);
    const byId = new Map(questions.map(q => [q.id, q]));
    if (
      draft.version !== exam.version ||
      !draft.answers ||
      typeof draft.answers !== 'object' ||
      Array.isArray(draft.answers) ||
      !Array.isArray(draft.flagged) ||
      !draft.flagged.every(id => byId.has(id)) ||
      !Number.isInteger(draft.index) ||
      draft.index < 0 ||
      draft.index >= questions.length ||
      !Number.isFinite(draft.startedAt) ||
      draft.startedAt <= 0 ||
      draft.startedAt > Date.now() ||
      typeof draft.submitted !== 'boolean' ||
      Object.entries(draft.answers).some(
        ([id, v]) =>
          !byId.has(id) ||
          !Number.isInteger(v) ||
          v < 0 ||
          v >= byId.get(id)!.options.length,
      )
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}

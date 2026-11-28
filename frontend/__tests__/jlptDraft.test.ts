import type { Exam } from '../src/services/jlptService';
import { jlptDraftStorage as webStorage } from '../src/services/jlptDraftStorage.web';
const mockStore = new Map<string, string>();
let mockFail = false;
jest.mock('../src/services/jlptDraftStorage', () => ({
  jlptDraftStorage: {
    read: async (key: string) => mockStore.get(key) ?? null,
    write: async (key: string, value: string) => {
      if (mockFail) throw new Error('full');
      mockStore.set(key, value);
    },
  },
}));
const exam: Exam = {
  id: 'n3-durable',
  title: 'N3',
  level: 'N3',
  year: 2017,
  month: 7,
  version: 1,
  total: 1,
  audio_url: null,
  content_note: '',
  source_filename: '',
  sections: [
    {
      id: 'vocabulary',
      label: 'Từ vựng',
      original_label: '',
      questions: [
        {
          id: 'v-1',
          number: 1,
          group: 1,
          prompt: '語',
          instruction: '',
          options: ['a', 'b'],
          passage: null,
          images: [],
        },
      ],
    },
  ],
};
const fresh = () => {
  let service!: typeof import('../src/services/jlptDraft');
  jest.isolateModules(() => {
    service = require('../src/services/jlptDraft');
  });
  return service;
};
beforeEach(() => {
  mockStore.clear();
  mockFail = false;
});
test('restores answers, current position, flags and elapsed time after a fresh application runtime', async () => {
  const first = fresh();
  expect(
    await first.saveExamDraft('learner', exam.id, {
      version: 1,
      answers: { 'v-1': 1 },
      flagged: ['v-1'],
      index: 0,
      startedAt: Date.now() - 1000,
      elapsedMs: 500,
      submitted: false,
    }),
  ).toBe(true);
  const reopened = fresh();
  expect(reopened.readExamDraft('learner', exam)).toBeNull();
  const preview = {
    ...exam,
    sections: exam.sections.map(s => ({ ...s, total: s.questions.length })),
  };
  await reopened.loadExamDrafts('learner', [preview]);
  expect(reopened.readExamDraft('learner', exam)).toMatchObject({
    answers: { 'v-1': 1 },
    flagged: ['v-1'],
    index: 0,
    elapsedMs: 500,
  });
  expect(reopened.readExamProgress('learner', preview)).toMatchObject({
    answered: 1,
    total: 1,
    submitted: false,
  });
  await reopened.loadExamDrafts('other-account', [preview]);
  expect(reopened.readExamDraft('other-account', exam)).toBeNull();
  expect(reopened.readExamDraft('learner', { ...exam, version: 2 })).toBeNull();
});
test('restores a submitted result summary without inventing a score for legacy or inconsistent drafts', async () => {
  const preview = {
    ...exam,
    sections: exam.sections.map(s => ({ ...s, total: s.questions.length })),
  };
  const submitted = {
    version: 1,
    answers: { 'v-1': 0 },
    flagged: [],
    index: 0,
    startedAt: Date.now(),
    submitted: true,
  };
  for (const result of [
    undefined,
    { correct: 1, answered: 1, total: 1 },
    { correct: 2, answered: 1, total: 1 },
  ]) {
    await fresh().saveExamDraft('learner', exam.id, { ...submitted, result });
    const reopened = fresh();
    await reopened.loadExamDrafts('learner', [preview]);
    expect(reopened.readExamProgress('learner', preview)?.correct).toBe(
      result?.correct === 1 ? 1 : undefined,
    );
    expect(reopened.readExamDraft('learner', exam)?.answers).toEqual(
      submitted.answers,
    );
  }
});
test('newer answers win when saves overlap, and failed durable saves are reported', async () => {
  const service = fresh();
  const draft = {
    version: 1,
    answers: { 'v-1': 0 },
    flagged: [],
    index: 0,
    startedAt: Date.now(),
    submitted: false,
  };
  await Promise.all([
    service.saveExamDraft('learner', exam.id, draft),
    service.saveExamDraft('learner', exam.id, {
      ...draft,
      answers: { 'v-1': 1 },
    }),
  ]);
  expect(JSON.parse([...mockStore.values()][0]).answers['v-1']).toBe(1);
  mockFail = true;
  expect(await service.saveExamDraft('learner', exam.id, draft)).toBe(false);
});

test('web migrates a session draft and keeps it after the browser session store is cleared', async () => {
  const persistent = new Map<string, string>();
  const session = new Map([['draft-key', 'legacy-draft']]);
  const oldLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldSession = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage',
  );
  const setItem = jest.fn((key: string, value: string) => {
    persistent.set(key, value);
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => persistent.get(key) ?? null, setItem },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (key: string) => session.get(key) ?? null },
  });
  try {
    expect(await webStorage.read('draft-key')).toBe('legacy-draft');
    session.clear();
    expect(await webStorage.read('draft-key')).toBe('legacy-draft');
    await webStorage.write('draft-key', 'new-answer');
    expect(await webStorage.read('draft-key')).toBe('new-answer');
    setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    await expect(webStorage.write('draft-key', 'not-saved')).rejects.toThrow(
      'quota exceeded',
    );
  } finally {
    if (oldLocal) Object.defineProperty(globalThis, 'localStorage', oldLocal);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (oldSession)
      Object.defineProperty(globalThis, 'sessionStorage', oldSession);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

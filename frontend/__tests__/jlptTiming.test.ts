import {
  canAnswer,
  nextTiming,
  settleTiming,
  startTiming,
} from '../src/services/jlptTiming';
import type { Exam } from '../src/services/jlptService';
const exam = {
  audio_url: 'local-audio',
  sections: [
    { id: 'vocabulary', duration_seconds: 1800, questions: [{ id: 'v-1' }] },
    {
      id: 'grammar-reading',
      duration_seconds: 4200,
      questions: [{ id: 'gr-1' }],
    },
    { id: 'listening', duration_seconds: 2400, questions: [{ id: 'l-1' }] },
  ],
} as Exam;
test('uses original section limits and locks a section at the exact deadline', () => {
  const timing = startTiming(exam, 1000);
  expect(timing.deadlineAt).toBe(1801000);
  expect(canAnswer(exam, timing, 'v-1', 1800999)).toBe(true);
  expect(canAnswer(exam, timing, 'v-1', 1801000)).toBe(false);
  expect(canAnswer(exam, timing, 'gr-1', 1500)).toBe(false);
  const ended = settleTiming(exam, timing, 1801000);
  expect(ended.phase).toBe('between');
  expect(canAnswer(exam, ended, 'v-1', 1801001)).toBe(false);
  const grammar = nextTiming(exam, ended, 2000000);
  expect(grammar.deadlineAt).toBe(6200000);
  expect(canAnswer(exam, grammar, 'v-1', 2000001)).toBe(false);
  const listening = nextTiming(
    exam,
    settleTiming(exam, grammar, 6200000),
    7000000,
  );
  expect(listening.deadlineAt).toBe(9400000);
  expect(settleTiming(exam, listening, 9400000).phase).toBe('complete');
});
test('an expired saved deadline stays expired on reopen, and an empty audio slot cannot start', () => {
  const saved = JSON.parse(JSON.stringify(startTiming(exam, 1000)));
  const reopened = settleTiming(exam, saved, 9900000);
  expect(reopened.phase).toBe('between');
  expect(reopened.deadlineAt).toBeNull();
  expect(() =>
    nextTiming(
      { ...exam, audio_url: null },
      { section: 1, phase: 'between', deadlineAt: null },
      9900001,
    ),
  ).toThrow('Chưa có tệp nghe');
});

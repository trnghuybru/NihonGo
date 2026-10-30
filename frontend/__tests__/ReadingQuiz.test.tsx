import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ReadingQuiz } from '../src/components/ReadingQuiz';
import {
  ReadingGrade,
  ReadingQuizData,
  readingService,
} from '../src/services/readingService';

jest.mock('../src/services/readingService', () => ({
  readingService: { submit: jest.fn() },
}));
const quiz: ReadingQuizData = {
  version: 'v1',
  last_attempt: null,
  questions: [
    { id: 'q1', text: 'どこへ？', options: ['学校', '家'] },
    { id: 'q2', text: 'いつ？', options: ['今日', '明日'] },
  ],
};
const result: ReadingGrade = {
  id: 'attempt1',
  version: 'v1',
  submitted_at: 100,
  correct: 1,
  total: 2,
  score: 50,
  results: quiz.questions.map((q, index) => ({
    ...q,
    selected_index: 0,
    correct_index: index,
    correct: index === 0,
  })),
};
let tree: Renderer.ReactTestRenderer;
function control(label: string) {
  return tree.root.findAll(
    n =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === 'function',
  )[0];
}
async function press(label: string) {
  await act(async () => control(label).props.onPress());
}
function text() {
  return tree.root
    .findAllByType(Text)
    .map(n => n.props.children)
    .flat()
    .join(' ');
}
async function render(data = quiz) {
  await act(async () => {
    tree = Renderer.create(<ReadingQuiz passageId="p1" quiz={data} />);
  });
}
async function choose() {
  await press('Câu 1, A: 学校');
  await press('Câu 2, A: 今日');
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readingService.submit).mockResolvedValue(result);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('requires all answers, sends choices to server, and only reveals grading after submit', async () => {
  await render();
  expect(control('Nộp bài').props.disabled).toBe(true);
  expect(text()).not.toContain('Đáp án đúng');
  await choose();
  expect(control('Nộp bài').props.disabled).toBe(false);
  expect(readingService.submit).not.toHaveBeenCalled();
  await press('Nộp bài');
  expect(readingService.submit).toHaveBeenCalledWith('p1', {
    request_id: expect.any(String),
    version: 'v1',
    answers: { q1: 0, q2: 0 },
  });
  expect(text()).toContain('50');
  expect(text()).toContain('1/2 câu đúng');
  expect(text()).toContain('Đáp án đúng');
  expect(control('Câu 1, A: 学校').props.disabled).toBe(true);
  await press('Làm lại');
  expect(text()).not.toContain('Đáp án đúng');
  expect(control('Nộp bài').props.disabled).toBe(true);
});
test('keeps choices on failure and retries the same submission id', async () => {
  jest
    .mocked(readingService.submit)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await render();
  await choose();
  await press('Nộp bài');
  expect(text()).toContain('Mất kết nối');
  expect(control('Câu 1, A: 学校').props.accessibilityState.checked).toBe(true);
  await press('Nộp lại bài');
  const calls = jest.mocked(readingService.submit).mock.calls;
  expect(calls[0][1]).toEqual(calls[1][1]);
  expect(text()).toContain('1/2 câu đúng');
});
test('restores saved grading and hides quiz for passages without questions', async () => {
  await render({ ...quiz, last_attempt: result });
  expect(text()).toContain('1/2 câu đúng');
  expect(control('Nộp bài')).toBeUndefined();
  await act(async () =>
    tree.update(
      <ReadingQuiz passageId="p2" quiz={{ ...quiz, questions: [] }} />,
    ),
  );
  expect(tree.toJSON()).toBeNull();
});
test('blocks duplicate submissions while waiting for backend', async () => {
  let resolve!: (value: ReadingGrade) => void;
  jest.mocked(readingService.submit).mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await render();
  await choose();
  await act(async () => {
    control('Nộp bài').props.onPress();
    control('Nộp bài').props.onPress();
  });
  expect(readingService.submit).toHaveBeenCalledTimes(1);
  expect(control('Câu 1, A: 学校').props.disabled).toBe(true);
  await act(async () => resolve(result));
  expect(text()).toContain('1/2 câu đúng');
});

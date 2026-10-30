import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { HomeFlashcardHub } from '../src/components/HomeFlashcardHub';
import {
  dailyFlashcardService,
  HomeFlashcards,
} from '../src/services/dailyFlashcardService';
import { flashcardService } from '../src/services/flashcardService';
import { flashcardSrsService } from '../src/services/flashcardSrsService';

jest.mock('../src/services/dailyFlashcardService', () => ({
  dailyFlashcardService: { home: jest.fn(), review: jest.fn() },
}));
jest.mock('../src/services/flashcardService', () => ({
  flashcardService: { session: jest.fn() },
}));
const empty: HomeFlashcards = {
  active_session: null,
  weak_count: 0,
  due_count: 0,
  learned_count: 0,
  quiz: null,
  quiz_available: 0,
};
const onOpenFlashcards = jest.fn();
const onOpenQuiz = jest.fn();
let tree: Renderer.ReactTestRenderer;
const control = (label: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
async function render(data: HomeFlashcards) {
  jest.mocked(dailyFlashcardService.home).mockResolvedValue(data);
  await act(async () => {
    tree = Renderer.create(
      <HomeFlashcardHub
        onOpenFlashcards={onOpenFlashcards}
        onOpenQuiz={onOpenQuiz}
      />,
    );
  });
}
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => tree?.unmount());
});
test('empty state opens the deck catalog and does not invent quiz questions', async () => {
  await render(empty);
  expect(control('Bắt đầu thử thách').props.disabled).toBe(true);
  await act(async () => control('Chọn bộ thẻ').props.onPress());
  expect(onOpenFlashcards).toHaveBeenCalledWith();
});
test('resumes an active session before suggesting weak words', async () => {
  const session = { id: 'active' };
  jest.mocked(flashcardService.session).mockResolvedValue(session as never);
  await render({
    ...empty,
    weak_count: 3,
    active_session: { id: 'active', title: 'Bộ 1', remaining: 8 },
    quiz_available: 5,
  });
  await act(async () => control('Tiếp tục flashcard').props.onPress());
  expect(flashcardService.session).toHaveBeenCalledWith('active');
  expect(dailyFlashcardService.review).not.toHaveBeenCalled();
  expect(onOpenFlashcards).toHaveBeenCalledWith(session);
  await act(async () => control('Bắt đầu thử thách').props.onPress());
  expect(onOpenQuiz).toHaveBeenCalledTimes(1);
});
test('weak-word action opens a real review snapshot', async () => {
  const session = { id: 'weak' };
  jest.mocked(dailyFlashcardService.review).mockResolvedValue(session as never);
  await render({ ...empty, weak_count: 3 });
  await act(async () => control('Ôn ngay').props.onPress());
  expect(dailyFlashcardService.review).toHaveBeenCalledTimes(1);
  expect(onOpenFlashcards).toHaveBeenCalledWith(session);
});

test('due-card action opens the FSRS review instead of the weak-word pool', async () => {
  const session = { id: 'due' };
  const due = jest
    .spyOn(flashcardSrsService, 'dueReview')
    .mockResolvedValue(session as never);
  await render({ ...empty, due_count: 2, weak_count: 3 });
  await act(async () => control('Ôn thẻ đến hạn').props.onPress());
  expect(due).toHaveBeenCalledTimes(1);
  expect(dailyFlashcardService.review).not.toHaveBeenCalled();
  expect(onOpenFlashcards).toHaveBeenCalledWith(session);
  due.mockRestore();
});

test('cards waiting for their next review today show the schedule without starting early', async () => {
  await render({
    ...empty,
    due_count: 0,
    today_count: 1,
    weak_count: 1,
    next_due_at: Date.parse('2026-10-20T03:10:00Z'),
  });
  await act(async () => control('Xem lịch ôn').props.onPress());
  expect(onOpenFlashcards).toHaveBeenCalledWith();
  expect(dailyFlashcardService.review).not.toHaveBeenCalled();
});

test('an existing quiz shows actual progress and completed results stay accessible', async () => {
  await render({
    ...empty,
    quiz_available: 0,
    quiz: { id: 'quiz', total: 5, answered: 3, correct: 2, finished: false },
  });
  expect(JSON.stringify(tree.toJSON())).toContain('3/5 câu');
  expect(control('Tiếp tục thử thách').props.disabled).toBe(false);
  await act(async () => tree.unmount());
  await render({
    ...empty,
    quiz_available: 0,
    quiz: { id: 'quiz', total: 5, answered: 5, correct: 4, finished: true },
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Đã hoàn thành');
  expect(control('Xem kết quả thử thách').props.disabled).toBe(false);
  await act(async () => control('Xem kết quả thử thách').props.onPress());
  expect(onOpenQuiz).toHaveBeenCalledTimes(1);
});

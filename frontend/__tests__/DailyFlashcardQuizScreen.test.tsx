import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { DailyFlashcardQuizScreen } from '../src/screens/DailyFlashcardQuizScreen';
import {
  dailyFlashcardService,
  DailyQuiz,
} from '../src/services/dailyFlashcardService';

jest.mock('../src/services/dailyFlashcardService', () => ({
  dailyFlashcardService: {
    quiz: jest.fn(),
    answer: jest.fn(),
    review: jest.fn(),
  },
}));
const initial: DailyQuiz = {
  id: 'quiz',
  date: '2026-10-19',
  total: 2,
  answered: 0,
  correct: 0,
  finished_at: null,
  questions: [
    {
      id: 'one',
      front: '学校',
      options: [
        { id: 'a', text: 'trường học' },
        { id: 'b', text: 'cuộc đời' },
      ],
    },
    {
      id: 'two',
      front: '人生',
      options: [
        { id: 'c', text: 'cuộc đời' },
        { id: 'd', text: 'lời hứa' },
      ],
    },
  ],
};
const next: DailyQuiz = {
  ...initial,
  answered: 1,
  questions: [
    {
      ...initial.questions[0],
      answer: {
        selected_id: 'b',
        correct_id: 'a',
        correct: false,
        reading: 'がっこう',
        meaning: 'trường học',
      },
    },
    initial.questions[1],
  ],
};
const finished: DailyQuiz = {
  ...next,
  answered: 2,
  correct: 1,
  finished_at: 99,
  questions: [
    next.questions[0],
    {
      ...next.questions[1],
      answer: {
        selected_id: 'c',
        correct_id: 'c',
        correct: true,
        reading: 'じんせい',
        meaning: 'cuộc đời',
      },
    },
  ],
};
let tree: Renderer.ReactTestRenderer;
const onExit = jest.fn();
const onReview = jest.fn();
const control = (label: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
async function press(label: string) {
  await act(async () => control(label).props.onPress());
}
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <DailyFlashcardQuizScreen onExit={onExit} onReview={onReview} />,
    );
  });
}
function text() {
  return tree.root
    .findAllByType(Text)
    .map(node =>
      React.Children.toArray(node.props.children)
        .filter(child => typeof child === 'string' || typeof child === 'number')
        .join(''),
    )
    .join('\n');
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(dailyFlashcardService.quiz).mockResolvedValue(initial);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('shows feedback before advancing, then the saved score and wrong-word review', async () => {
  jest
    .mocked(dailyFlashcardService.answer)
    .mockResolvedValueOnce(next)
    .mockResolvedValueOnce(finished);
  const session = { id: 'review' };
  jest.mocked(dailyFlashcardService.review).mockResolvedValue(session as never);
  await render();
  expect(text()).toContain('学校');
  await press('B. cuộc đời');
  expect(dailyFlashcardService.answer).toHaveBeenCalledWith('quiz', 'one', 'b');
  expect(text()).toContain('Chưa đúng. Hãy ghi nhớ nghĩa này nhé.');
  expect(text()).toContain('がっこう');
  expect(text()).not.toContain('人生');
  expect(control('A. trường học. Đáp án đúng').props.disabled).toBe(true);
  await press('Câu tiếp theo');
  expect(text()).toContain('人生');
  await press('A. cuộc đời');
  await press('Xem kết quả');
  expect(text()).toContain('1/2 câu đúng');
  await press('Ôn câu sai bằng flashcard');
  expect(dailyFlashcardService.review).toHaveBeenCalledWith('quiz', 'quiz');
  expect(onReview).toHaveBeenCalledWith(session);
});

test('resumes the first unanswered question and keeps the question on a failed save', async () => {
  jest.mocked(dailyFlashcardService.quiz).mockResolvedValue(next);
  jest
    .mocked(dailyFlashcardService.answer)
    .mockRejectedValueOnce(new Error('Mất mạng'));
  await render();
  expect(text()).toContain('人生');
  await press('A. cuộc đời');
  expect(text()).toContain('Mất mạng');
  expect(control('A. cuộc đời').props.disabled).toBe(false);
  expect(control('Câu tiếp theo')).toBeUndefined();
});

test('a completed daily challenge opens its saved result without a new attempt', async () => {
  jest.mocked(dailyFlashcardService.quiz).mockResolvedValue(finished);
  await render();
  expect(text()).toContain('Kết quả thử thách');
  expect(text()).toContain('1/2 câu đúng');
  expect(dailyFlashcardService.answer).not.toHaveBeenCalled();
  await press('Về trang chủ');
  expect(onExit).toHaveBeenCalledTimes(1);
});

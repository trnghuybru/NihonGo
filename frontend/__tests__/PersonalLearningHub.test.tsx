import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { PersonalLearningHub } from '../src/components/PersonalLearningHub';
import {
  journeyService,
  LearningJourney,
} from '../src/services/journeyService';
import { writingService } from '../src/services/writingService';

jest.mock('../src/services/journeyService', () => ({
  journeyService: { load: jest.fn(), complete: jest.fn(), topic: jest.fn() },
}));
jest.mock('../src/services/writingService', () => ({
  writingService: {
    saveCustomDraft: jest.fn(),
    updateDraft: jest.fn(),
    submitWriting: jest.fn(),
  },
}));
const review = {
  id: 'review',
  kind: 'review' as const,
  title: 'Ôn từ',
  reason: '1 thẻ đến hạn',
  instruction: 'Ôn một thẻ',
  minutes: 5,
};
const writing = {
  id: 'writing',
  kind: 'writing' as const,
  title: 'Luyện viết',
  reason: 'Dùng từ đã ôn',
  instruction: 'Viết 3 câu',
  minutes: 5,
};
const plan: LearningJourney = {
  date: '2026-11-27',
  level: 'N5',
  goal: 'travel',
  knowledge: {
    reviewed_cards: 1,
    due_cards: 1,
    reading_passages: 0,
    writing_submissions: 0,
    recent_words: [
      { word: '学校', reading: 'がっこう', meaning: 'trường học' },
    ],
  },
  steps: [review, writing],
  completed: [],
  missing: [],
  writing_topic: null,
};
let tree: Renderer.ReactTestRenderer;
function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
function copy() {
  return tree.root
    .findAllByType(Text)
    .map(node => React.Children.toArray(node.props.children).join(''))
    .join('\n');
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(journeyService.load).mockResolvedValue(plan);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
async function render() {
  await act(async () => {
    tree = Renderer.create(<PersonalLearningHub accountId="alice" />);
  });
}

test('explains learning evidence and allows choosing writing immediately', async () => {
  await render();
  expect(copy()).toContain('学校');
  expect(copy()).toContain('Từ bạn vừa ôn');
  expect(button('Bắt đầu ôn tập')).toBeUndefined();
  await act(async () => button('Xây dựng lộ trình ôn').props.onPress());
  expect(button('Bắt đầu ôn tập')).toBeDefined();
  expect(button('Tạo đề viết bằng AI')).toBeDefined();
  expect(button('Tôi đã luyện xong, sang bước tiếp')).toBeUndefined();
  expect(journeyService.complete).not.toHaveBeenCalled();
});

test('load failure does not appear as zero learned knowledge and can retry', async () => {
  jest
    .mocked(journeyService.load)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await render();
  expect(copy()).toContain('Mất kết nối');
  expect(copy()).not.toContain('thẻ đã ôn');
  await act(async () =>
    button('Cập nhật kiến thức và lộ trình').props.onPress(),
  );
  expect(copy()).toContain('学校');
});

test('generates a topic, opens it and submits at the correct level', async () => {
  const writingPlan = { ...plan, completed: ['review'] };
  const topic = {
    title: 'Trường học của tôi',
    instruction: 'Viết về 学校.',
    hint: 'Trường ở đâu?',
    level: 'N5',
  };
  jest.mocked(journeyService.load).mockResolvedValue(writingPlan);
  jest
    .mocked(journeyService.topic)
    .mockResolvedValue({ ...writingPlan, writing_topic: topic });
  jest.mocked(journeyService.complete).mockResolvedValue({
    ...writingPlan,
    writing_topic: topic,
    completed: ['review', 'writing'],
  });
  jest.mocked(writingService.submitWriting).mockResolvedValue({
    submission: { id: 's', feedback: 'Tốt', score: 80 },
  } as any);
  await render();
  await act(async () => button('Xây dựng lộ trình ôn').props.onPress());
  await act(async () => button('Tạo đề viết bằng AI').props.onPress());
  expect(journeyService.topic).toHaveBeenCalledWith(plan.date);
  const input = tree.root.findAll(
    node => node.props.accessibilityLabel === 'Bài viết theo đề AI',
  )[0];
  await act(async () => input.props.onChangeText('学校へ行きます。'));
  await act(async () => button('Nộp bài và nhận góp ý AI').props.onPress());
  expect(writingService.submitWriting).toHaveBeenCalledWith({
    prompt_title: topic.title,
    level: 'N5',
    text: '学校へ行きます。',
  });
  expect(copy()).toContain('Tốt');
  expect(journeyService.complete).toHaveBeenCalledWith(plan.date, 'writing');
});

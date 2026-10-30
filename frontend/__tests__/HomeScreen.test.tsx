import React from 'react';
import { TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import { options, profile } from '../test-support/learning';
import {
  dictionaryService,
  DictionaryHistoryItem,
} from '../src/services/dictionaryService';

jest.mock('../src/services/dailyFlashcardService', () => ({
  dailyFlashcardService: {
    home: jest.fn().mockResolvedValue({
      active_session: null,
      weak_count: 0,
      learned_count: 0,
      quiz: null,
      quiz_available: 0,
    }),
  },
}));

jest.mock('../src/services/dictionaryService', () => ({
  dictionaryService: {
    history: jest.fn().mockResolvedValue({ items: [] }),
    subscribeHistory: jest.fn(() => () => {}),
  },
}));

const user = {
  id: 'u1',
  name: 'Minh',
  email: 'minh@example.com',
  phone: '+84912345678',
  email_verified: true,
  phone_verified: false,
};
const onContinueLearning = jest.fn();
const onOpenSkill = jest.fn();
const onSearchVocabulary = jest.fn();
const onOpenVocabulary = jest.fn();
const onOpenPromotion = jest.fn();
let tree: Renderer.ReactTestRenderer;

beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => tree?.unmount());
});

async function render() {
  await act(async () => {
    tree = Renderer.create(
      <HomeScreen
        user={user}
        profile={profile}
        options={options}
        onContinueLearning={onContinueLearning}
        onOpenSkill={onOpenSkill}
        onSearchVocabulary={onSearchVocabulary}
        onOpenVocabulary={onOpenVocabulary}
        onOpenPromotion={onOpenPromotion}
      />,
    );
  });
}

function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}

test('home search shows shared recent history on focus and opens the selected exact entry', async () => {
  const item: DictionaryHistoryItem = {
    kind: 'kanji',
    target: '学',
    word: '学',
    reading: 'HỌC',
    glosses: [],
    viewed_at: 1,
  };
  jest
    .mocked(dictionaryService.history)
    .mockResolvedValueOnce({ items: [item] });
  await render();
  expect(dictionaryService.history).not.toHaveBeenCalled();
  expect(button('Tra lại 学')).toBeUndefined();
  await act(async () => tree.root.findByType(TextInput).props.onFocus());
  expect(dictionaryService.history).toHaveBeenCalledTimes(1);
  await act(async () => button('Tra lại 学').props.onPress());
  expect(onSearchVocabulary).toHaveBeenCalledWith('学', item);
  expect(button('Tra lại 学')).toBeUndefined();
});

test('renders personalized learning data without invented progress', async () => {
  await render();
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('Chào Minh');
  expect(output).toContain('Ôn tập hôm nay');
  expect(output).toContain('Chọn bộ thẻ đầu tiên');
  expect(output).toContain('Momo, linh vật tanuki của NihonGO đang vẫy tay');
  expect(output).not.toContain('72%');
  expect(output).not.toContain('ありがとう');
  expect(output).not.toContain('arigatou');
  expect(output).not.toContain('Một lộ trình dành riêng cho bạn');
  expect(output).not.toContain('xxx');
  expect(output).toContain('Một lộ trình vừa sức dành cho bạn');
  await act(async () => button('Khám phá lộ trình').props.onPress());
  expect(onOpenPromotion).toHaveBeenCalledTimes(1);
  await act(async () => button('Chọn bộ thẻ').props.onPress());
  expect(onOpenVocabulary).toHaveBeenCalledTimes(1);
  expect(button('Bắt đầu thử thách').props.disabled).toBe(true);
});

test('routes all four skill cards through one typed callback', async () => {
  await render();
  const skillLabels = [
    ['Nghe. Hội thoại và phát âm. Luyện nghe', 'listening'],
    ['Nói. Luyện nói theo tình huống. Xem tình huống', 'speaking'],
    ['Đọc. Đoạn văn theo cấp độ. Luyện đọc', 'reading'],
    ['Viết. Kana, Kanji và viết câu. Luyện viết', 'writing'],
  ] as const;
  for (const [label] of skillLabels) {
    await act(async () => button(label).props.onPress());
  }
  expect(onOpenSkill.mock.calls.map(call => call[0])).toEqual(
    skillLabels.map(([, skill]) => skill),
  );
});

test('normalizes vocabulary input and disables an empty search', async () => {
  await render();
  const input = tree.root.findByType(TextInput);
  const search = () => button('Tìm từ');
  expect(search().props.accessibilityState.disabled).toBe(true);
  await act(async () => input.props.onChangeText('  日本語  '));
  expect(search().props.accessibilityState.disabled).toBe(false);
  await act(async () => input.props.onSubmitEditing());
  expect(onSearchVocabulary).toHaveBeenCalledWith('日本語');
});

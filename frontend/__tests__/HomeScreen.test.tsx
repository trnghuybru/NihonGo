import React from 'react';
import { TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import { options, profile } from '../test-support/learning';

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

test('renders personalized learning data without invented progress', async () => {
  await render();
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('N5 · Sơ cấp');
  expect(output).toContain('Giao tiếp hằng ngày');
  expect(output).toContain('Momo, linh vật tanuki của NihonGO đang vẫy tay');
  expect(
    tree.root.findAll(node => {
      const children = node.props.children;
      return Array.isArray(children) && children.join('') === '15 phút/ngày';
    }).length,
  ).toBeGreaterThan(0);
  expect(output).not.toContain('72%');
  expect(
    button('Tiếp tục học. N5 · Sơ cấp. Giao tiếp hằng ngày. 15 phút mỗi ngày.'),
  ).toBeTruthy();
});

test('routes all four skill cards through one typed callback', async () => {
  await render();
  const skillLabels = [
    ['Nghe. Hội thoại và phát âm. Luyện nghe', 'listening'],
    ['Nói. Phản xạ cùng Aoi. Bắt đầu nói', 'speaking'],
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

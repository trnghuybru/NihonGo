import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { HomeFlashcardPreview } from '../src/components/HomeFlashcardPreview';
import { flashcardService } from '../src/services/flashcardService';
jest.mock('../src/services/flashcardService', () => ({
  flashcardService: { session: jest.fn(), rate: jest.fn(), start: jest.fn() },
}));
let tree: Renderer.ReactTestRenderer;
const control = (label: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => tree?.unmount());
});
test('previews ungraded cards, flips and moves without changing study progress', async () => {
  jest.mocked(flashcardService.session).mockResolvedValue({
    cards: [
      { id: 'done', front: '済', reading: '', back: 'Đã học' },
      { id: 'one', front: '猫', reading: 'ねこ', back: 'Con mèo' },
      { id: 'two', front: '犬', reading: 'いぬ', back: 'Con chó' },
    ],
    ratings: { done: 0 },
  } as never);
  await act(async () => {
    tree = Renderer.create(
      <HomeFlashcardPreview sessionId="session" remaining={2} />,
    );
  });
  expect(
    tree.root.findByProps({ testID: 'home-preview-word' }).props.children,
  ).toBe('猫');
  expect(control('Thẻ trước').props.disabled).toBe(true);
  const visibleText = tree.root
    .findAllByType(Text)
    .map(node => String(node.props.children))
    .join(' ');
  expect(visibleText).not.toMatch(
    /Xem trước|Mặt trước|Mặt sau|Thẻ trước|Thẻ tiếp/,
  );
  await act(async () => control('Lật thẻ xem nghĩa').props.onPress());
  expect(
    tree.root.findByProps({ testID: 'home-preview-meaning' }).props.children,
  ).toBe('Con mèo');
  await act(async () => control('Thẻ tiếp').props.onPress());
  expect(
    tree.root.findByProps({ testID: 'home-preview-word' }).props.children,
  ).toBe('犬');
  expect(control('Thẻ tiếp').props.disabled).toBe(true);
  expect(flashcardService.rate).not.toHaveBeenCalled();
  expect(flashcardService.start).not.toHaveBeenCalled();
});
test('failed preview can retry without blocking the study action', async () => {
  jest
    .mocked(flashcardService.session)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      cards: [{ id: 'a', front: '山', reading: 'やま', back: 'Núi' }],
      ratings: {},
    } as never);
  await act(async () => {
    tree = Renderer.create(
      <HomeFlashcardPreview sessionId="session" remaining={1} />,
    );
  });
  await act(async () => control('Tải lại thẻ xem trước').props.onPress());
  expect(
    tree.root.findByProps({ testID: 'home-preview-word' }).props.children,
  ).toBe('山');
});

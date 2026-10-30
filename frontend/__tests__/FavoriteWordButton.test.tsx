import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FavoriteWordButton } from '../src/components/FavoriteWordButton';
import { flashcardService } from '../src/services/flashcardService';
jest.mock('../src/services/flashcardService', () => ({
  flashcardService: { favorite: jest.fn(), setFavorite: jest.fn() },
}));
let tree: Renderer.ReactTestRenderer;
function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <FavoriteWordButton source="dictionary" id="jmdict:1" word="学校" />,
    );
  });
}
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => tree?.unmount());
});
test('can save and remove a word without a stale read undoing the change', async () => {
  let resolve!: (result: { saved: boolean }) => void;
  jest.mocked(flashcardService.favorite).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  jest
    .mocked(flashcardService.setFavorite)
    .mockResolvedValueOnce({ saved: true })
    .mockResolvedValueOnce({ saved: false });
  await render();
  await act(async () => button('Yêu thích 学校').props.onPress());
  expect(flashcardService.setFavorite).toHaveBeenLastCalledWith(
    'dictionary',
    'jmdict:1',
    true,
  );
  await act(async () => resolve({ saved: false }));
  expect(button('Bỏ yêu thích 学校')).toBeDefined();
  await act(async () => button('Bỏ yêu thích 学校').props.onPress());
  expect(flashcardService.setFavorite).toHaveBeenLastCalledWith(
    'dictionary',
    'jmdict:1',
    false,
  );
  expect(button('Yêu thích 学校')).toBeDefined();
});
test('failed favorite writes preserve the previous state and permit retry', async () => {
  jest.mocked(flashcardService.favorite).mockResolvedValueOnce({ saved: true });
  jest
    .mocked(flashcardService.setFavorite)
    .mockRejectedValueOnce(new Error('offline'));
  await render();
  await act(async () => button('Bỏ yêu thích 学校').props.onPress());
  expect(button('Bỏ yêu thích 学校').props.disabled).toBe(false);
  expect(JSON.stringify(tree.toJSON())).toContain('Chưa lưu được. Thử lại.');
});

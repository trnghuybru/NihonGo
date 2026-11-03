import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AuthButton } from '../src/components/AuthForm';
import { DictionaryWordActions } from '../src/components/DictionaryWordActions';
import { flashcardService } from '../src/services/flashcardService';

jest.mock('../src/services/flashcardService', () => ({
  flashcardService: {
    decks: jest.fn(),
    addDictionaryCard: jest.fn(),
    favorite: jest.fn(),
    setFavorite: jest.fn(),
  },
}));
let tree: Renderer.ReactTestRenderer;
const deck = {
  id: 'my-deck',
  kind: 'custom' as const,
  title: 'Từ nghe',
  subtitle: 'Bộ tự tạo',
  card_count: 2,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(flashcardService.favorite).mockResolvedValue({ saved: false });
  jest.mocked(flashcardService.setFavorite).mockResolvedValue({ saved: true });
  jest
    .mocked(flashcardService.decks)
    .mockResolvedValue({
      items: [deck],
      pagination: { page: 1, total_pages: 1 },
      active_session: null,
    });
  jest
    .mocked(flashcardService.addDictionaryCard)
    .mockResolvedValue({
      added: true,
      deck_id: deck.id,
      title: deck.title,
      card: {
        id: 'new',
        front: '日本語',
        reading: 'にほんご',
        back: 'tiếng Nhật',
      },
    });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <DictionaryWordActions id="jmdict:123" word="日本語" />,
    );
  });
}
async function press(label: string) {
  await act(async () => {
    const action = tree.root.findAll(
      node =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === 'function',
    )[0];
    if (action) await action.props.onPress();
    else
      await tree.root
        .findAllByType(AuthButton)
        .find(node => node.props.label === label)!
        .props.onPress();
  });
}
test('saves to the selected existing deck and toggles the same dictionary favorite', async () => {
  await render();
  expect(flashcardService.decks).not.toHaveBeenCalled();
  await press('Yêu thích 日本語');
  expect(flashcardService.setFavorite).toHaveBeenCalledWith(
    'dictionary',
    'jmdict:123',
    true,
  );
  await press('Lưu vào flashcard');
  expect(flashcardService.decks).toHaveBeenCalledWith('custom', 'N5', 1);
  await press('Lưu vào bộ Từ nghe');
  expect(flashcardService.addDictionaryCard).toHaveBeenCalledWith(
    'my-deck',
    'jmdict:123',
  );
  expect(JSON.stringify(tree.toJSON())).toContain('Đã lưu vào “Từ nghe”.');
});
test('supports paginated decks, retries a failed save and reports an existing card', async () => {
  jest
    .mocked(flashcardService.decks)
    .mockResolvedValueOnce({
      items: [deck],
      pagination: { page: 1, total_pages: 2 },
      active_session: null,
    })
    .mockResolvedValueOnce({
      items: [{ ...deck, id: 'second', title: 'Bộ khác' }],
      pagination: { page: 2, total_pages: 2 },
      active_session: null,
    });
  jest
    .mocked(flashcardService.addDictionaryCard)
    .mockRejectedValueOnce(new Error('Bộ thẻ đã đủ 100 thẻ.'))
    .mockResolvedValueOnce({
      added: false,
      deck_id: 'second',
      title: 'Bộ khác',
      card: {
        id: 'old',
        front: '日本語',
        reading: 'にほんご',
        back: 'tiếng Nhật',
      },
    });
  await render();
  await press('Lưu vào flashcard');
  await press('Xem thêm bộ thẻ');
  await press('Lưu vào bộ Từ nghe');
  expect(JSON.stringify(tree.toJSON())).toContain('Bộ thẻ đã đủ 100 thẻ.');
  await press('Lưu vào bộ Bộ khác');
  expect(flashcardService.addDictionaryCard).toHaveBeenLastCalledWith(
    'second',
    'jmdict:123',
  );
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Từ này đã có trong “Bộ khác”.',
  );
});
test('retries a failed deck list without losing access to favorites', async () => {
  jest
    .mocked(flashcardService.decks)
    .mockRejectedValueOnce(new Error('Chưa tải được bộ thẻ.'));
  await render();
  await press('Lưu vào flashcard');
  await press('Thử lại danh sách bộ thẻ');
  expect(flashcardService.decks).toHaveBeenCalledTimes(2);
  await press('Yêu thích 日本語');
  expect(flashcardService.setFavorite).toHaveBeenCalledTimes(1);
});

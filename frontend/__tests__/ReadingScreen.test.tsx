import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Switch, Text, TextInput } from 'react-native';
import { ReadingScreen } from '../src/screens/ReadingScreen';
import {
  readingService,
  ReadingPassage,
  ReadingCatalog,
} from '../src/services/readingService';
import { readingPreferences } from '../src/services/readingPreferences';

jest.mock('../src/services/readingService', () => ({
  readingService: { list: jest.fn(), passage: jest.fn() },
}));
jest.mock('../src/services/readingPreferences', () => ({
  readingPreferences: { load: jest.fn(), save: jest.fn() },
}));
jest.mock('../src/services/dictionaryService', () => ({
  dictionaryService: { words: jest.fn().mockResolvedValue({ items: [] }) },
}));
const passage: ReadingPassage = {
  id: 'p1',
  title: 'Bài đọc 1',
  level: 'N5',
  kind: 'short',
  kind_label: 'Đoạn ngắn',
  exercise: 1,
  paragraph: 1,
  excerpt: '学校 です。',
  character_count: 6,
  source_url: 'https://example.com/reading',
  text: '学校 です。\n\n',
  paragraphs: [
    {
      id: '0',
      text: '学校 です。',
      tokens: [{ text: '学校', key: '1' }, { text: ' ' }, { text: 'です。' }],
    },
    { id: '1', text: '', tokens: [] },
    { id: '2', text: '', tokens: [] },
  ],
  quiz: { version: 'v1', questions: [], last_attempt: null },
  words: {
    '1': { surface: '学校', lemma: '学校', reading: 'がっこう', pos: '名詞' },
  },
};
const catalog: ReadingCatalog = {
  items: [passage],
  types: [{ id: 'short', label: 'Đoạn ngắn' }],
  pagination: { page: 1, page_size: 12, total: 13, total_pages: 2 },
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
    .join('\n');
}
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <ReadingScreen accountId="reader" initialLevel="N5" />,
    );
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readingService.list).mockResolvedValue(catalog);
  jest.mocked(readingService.passage).mockResolvedValue(passage);
  jest.mocked(readingPreferences.load).mockResolvedValue(true);
  jest.mocked(readingPreferences.save).mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('filters by level, type and search and resets pagination', async () => {
  await render();
  await press('Trang bài đọc 2');
  expect(readingService.list).toHaveBeenLastCalledWith({
    level: '',
    type: '',
    q: '',
    page: 2,
  });
  await press('Bộ lọc bài đọc');
  await press('N4');
  expect(readingService.list).toHaveBeenLastCalledWith({
    level: 'N4',
    type: '',
    q: '',
    page: 1,
  });
  const kind = tree.root
    .findAll(
      n =>
        n.props.accessibilityRole === 'button' &&
        typeof n.props.onPress === 'function',
    )
    .find(n =>
      n.findAllByType(Text).some(t => t.props.children === 'Đoạn ngắn'),
    )!;
  await act(async () => kind.props.onPress());
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('学校'),
  );
  await act(async () =>
    tree.root.findByType(TextInput).props.onSubmitEditing(),
  );
  expect(readingService.list).toHaveBeenLastCalledWith({
    level: 'N4',
    type: 'short',
    q: '学校',
    page: 1,
  });
});
test('opens a passage, toggles furigana without losing word lookup and returns to catalog', async () => {
  await render();
  await press('Mở Bài đọc 1');
  expect(readingService.passage).toHaveBeenCalledWith('p1');
  expect(text()).toContain('がっこう');
  await act(async () =>
    tree.root.findByType(Switch).props.onValueChange(false),
  );
  expect(text()).not.toContain('がっこう');
  expect(readingPreferences.save).toHaveBeenCalledWith('reader', false);
  expect(control('Tra từ 学校')).toBeDefined();
  await act(async () =>
    control('Tra từ 学校').props.onPress({
      stopPropagation() {},
      nativeEvent: { pageY: 100 },
    }),
  );
  expect(control('Đóng popup từ vựng')).toBeDefined();
  await press('Đóng popup từ vựng');
  await press('Thư viện bài đọc');
  expect(control('Mở Bài đọc 1')).toBeDefined();
});
test('restores the account furigana preference and handles empty lists', async () => {
  jest.mocked(readingPreferences.load).mockResolvedValue(false);
  await render();
  await press('Mở Bài đọc 1');
  expect(tree.root.findByType(Switch).props.value).toBe(false);
  expect(text()).not.toContain('がっこう');
  await press('Thư viện bài đọc');
  jest.mocked(readingService.list).mockResolvedValue({
    ...catalog,
    items: [],
    pagination: { ...catalog.pagination, total: 0, total_pages: 0 },
  });
  await press('Bộ lọc bài đọc');
  await press('N1');
  expect(text()).toContain('Không có bài đọc phù hợp');
});
test('shows detail load errors and retries without leaving the selected passage', async () => {
  jest
    .mocked(readingService.passage)
    .mockRejectedValueOnce(new Error('Mất kết nối'))
    .mockResolvedValue(passage);
  await render();
  await press('Mở Bài đọc 1');
  expect(text()).toContain('Mất kết nối');
  await press('Thử lại');
  expect(control('Tra từ 学校')).toBeDefined();
});

test('opens all levels and retains selected filters when the panel is collapsed', async () => {
  await render();
  expect(readingService.list).toHaveBeenLastCalledWith({
    level: '',
    type: '',
    q: '',
    page: 1,
  });
  expect(text()).toContain('Thư viện bài đọc');
  expect(text()).toContain('Tất cả bài đọc');
  expect(control('N4')).toBeUndefined();
  await press('Bộ lọc bài đọc');
  await press('N4');
  await press('Bộ lọc bài đọc');
  expect(control('N4')).toBeUndefined();
  expect(text()).toContain('JLPT');
  const reset = tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' && n.props.label === 'Xóa bộ lọc',
  )[0];
  await act(async () => reset.props.onPress());
  expect(readingService.list).toHaveBeenLastCalledWith({
    level: '',
    type: '',
    q: '',
    page: 1,
  });
});

import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SentenceTranslation } from '../src/components/SentenceTranslation';
import {
  isSentenceQuery,
  SentenceTranslationResult,
} from '../src/services/sentenceTranslationService';
jest.mock('../src/services/dictionaryService', () => ({
  dictionaryService: { words: jest.fn().mockResolvedValue({ items: [] }) },
}));
const result: SentenceTranslationResult = {
  text: '学校へ行きます。',
  translation: 'Tôi đi học.',
  source: 'ja',
  target: 'vi',
  model: 'facebook/m2m100_418M',
  cached: false,
  elapsed_ms: 10,
  japanese: '学校へ行きます。',
  vietnamese: 'Tôi đi học.',
  paragraphs: [
    {
      id: '0',
      text: '学校へ行きます。',
      tokens: [{ text: '学校', key: '1' }, { text: 'へ行きます。' }],
    },
  ],
  words: {
    '1': { surface: '学校', lemma: '学校', reading: 'がっこう', pos: '名詞' },
  },
};
let tree: Renderer.ReactTestRenderer;
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
test('renders the Japanese sentence with furigana, Vietnamese translation and audio', async () => {
  await act(async () => {
    tree = Renderer.create(<SentenceTranslation result={result} />);
  });
  const text = tree.root
    .findAllByType(Text)
    .map(n => String(n.props.children))
    .join('\n');
  expect(text).toContain('Kết quả tra cứu');
  expect(text).toContain('がっこう');
  expect(text).toContain('Tôi đi học.');
  expect(text).toContain('Dịch tự động');
  expect(
    tree.root.findAll(
      n => n.props.accessibilityLabel === 'Nghe phát âm 学校へ行きます。',
    ).length,
  ).toBeGreaterThan(0);
  const word = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Tra từ 学校' &&
      typeof n.props.onPress === 'function',
  )[0];
  await act(async () =>
    word.props.onPress({ stopPropagation() {}, nativeEvent: { pageY: 100 } }),
  );
  expect(
    tree.root.findAll(n => n.props.accessibilityLabel === 'Đóng popup từ vựng')
      .length,
  ).toBeGreaterThan(0);
});
test.each([
  ['学校', false],
  ['食べる', false],
  ['学校へ行きます', true],
  ['私は学生', true],
  ['元気ですか？', true],
  ['Tôi học tiếng Nhật', true],
  ['apple juice', false],
])('recognizes sentence candidates: %s', (query, expected) => {
  expect(isSentenceQuery(query as string)).toBe(expected);
});

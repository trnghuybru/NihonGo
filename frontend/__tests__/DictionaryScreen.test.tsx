import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, Text, TextInput } from 'react-native';
import { DictionaryScreen } from '../src/screens/DictionaryScreen';
import { sentenceTranslationService } from '../src/services/sentenceTranslationService';
import { HandwritingLookup } from '../src/components/HandwritingLookup';
import { ShadowingWordPopup } from '../src/components/ShadowingWordLookup';
import {
  dictionaryService,
  KanjiDetail,
  WordDetail,
  DictionaryHistoryItem,
} from '../src/services/dictionaryService';

jest.mock('../src/services/sentenceTranslationService', () => ({
  ...jest.requireActual('../src/services/sentenceTranslationService'),
  sentenceTranslationService: { translate: jest.fn() },
}));

jest.mock('../src/services/dictionaryService', () => ({
  dictionaryService: {
    history: jest.fn().mockResolvedValue({ items: [] }),
    recordHistory: jest.fn().mockResolvedValue({ items: [] }),
    clearHistory: jest.fn().mockResolvedValue({ items: [] }),
    subscribeHistory: jest.fn(() => () => {}),
    words: jest.fn(),
    word: jest.fn(),
    kanji: jest.fn(),
    character: jest.fn(),
    sources: jest.fn(),
  },
}));
const word: WordDetail = {
  id: 'jmdict:school',
  word: '学校',
  reading: 'がっこう',
  common: false,
  source_id: 'jmdict',
  glosses: [{ language: 'eng', text: 'school' }],
  forms: [{ text: '学校', info: [] }],
  readings: [{ text: 'がっこう', applies_to: [], info: [], no_kanji: false }],
  senses: [
    {
      parts_of_speech: ['noun'],
      glosses: [{ language: 'eng', text: 'school' }],
      notes: [],
      tags: [],
    },
  ],
  examples: [{ japanese: '学校へ行く。', meaning_vi: 'Đi đến trường.' }],
  kanji: ['学'],
  other_entries: [],
  source: { id: 'jmdict', name: 'JMdict' },
};
const kanji: KanjiDetail = {
  literal: '学',
  strokes: 8,
  han_viet: ['Học'],
  on: ['ガク'],
  kun: ['まな.ぶ'],
  meanings: [{ language: 'en', text: 'study' }],
  radicals: [39],
  nanori: ['たか'],
  grade: '1',
  stroke_paths: ['M10,20 L30,40'],
  compounds: [word],
  source: { id: 'kanjidic2', name: 'KANJIDIC2' },
  diagram_source: { id: 'kanjivg', name: 'KanjiVG', license: 'CC BY-SA 3.0' },
};
const pagination = { page: 1, page_size: 20, total: 1, total_pages: 1 };
let tree: Renderer.ReactTestRenderer;
const renderVideos = jest.fn(() => <Text>Danh sách ví dụ video</Text>);
function control(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
async function press(label: string) {
  await act(async () => control(label).props.onPress());
}
async function type(value: string) {
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText(value),
  );
}
function contents() {
  return tree.root
    .findAllByType(Text)
    .map(node =>
      React.Children.toArray(node.props.children)
        .filter(child => typeof child === 'string' || typeof child === 'number')
        .join(''),
    )
    .join('\n');
}
async function render(query = '') {
  await act(async () => {
    tree = Renderer.create(
      <DictionaryScreen query={query} renderVideos={renderVideos} />,
    );
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(dictionaryService.words)
    .mockResolvedValue({ items: [word], pagination });
  jest.mocked(dictionaryService.word).mockResolvedValue(word);
  jest
    .mocked(dictionaryService.kanji)
    .mockResolvedValue({ items: [kanji], pagination });
  jest.mocked(dictionaryService.character).mockResolvedValue(kanji);
  jest
    .mocked(dictionaryService.sources)
    .mockResolvedValue({ items: [kanji.source, kanji.diagram_source!] });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('starts with vocabulary and searches only after submission', async () => {
  await render();
  expect(control('Từ vựng').props.accessibilityState.selected).toBe(true);
  expect(dictionaryService.words).not.toHaveBeenCalled();
  expect(control('Tìm kiếm từ điển').props.disabled).toBe(true);
  await type(' gakkou ');
  expect(dictionaryService.words).not.toHaveBeenCalled();
  await press('Tìm kiếm từ điển');
  expect(dictionaryService.words).toHaveBeenCalledWith('gakkou', 1);
  expect(contents()).toContain('school');
  expect(contents()).toContain('Nghĩa của từ');
  expect(dictionaryService.word).toHaveBeenCalledWith(word.id);
});

test('recent history reopens vocabulary and kanji and can be cleared', async () => {
  const recent: DictionaryHistoryItem[] = [
    {
      kind: 'word',
      target: word.id,
      word: '学校',
      reading: 'がっこう',
      glosses: [],
      viewed_at: 2,
    },
    {
      kind: 'kanji',
      target: '学',
      word: '学',
      reading: 'HỌC',
      glosses: [],
      viewed_at: 1,
    },
  ];
  jest
    .mocked(dictionaryService.history)
    .mockResolvedValueOnce({ items: recent });
  await render();
  expect(contents()).not.toContain('Gần đây');
  expect(dictionaryService.words).not.toHaveBeenCalled();
  await act(async () => tree.root.findByType(TextInput).props.onFocus());
  expect(contents()).toContain('Gần đây');
  await press('Tra lại 学校');
  expect(control('Tra lại 学校')).toBeUndefined();
  expect(dictionaryService.word).toHaveBeenCalledWith(word.id);
  expect(dictionaryService.recordHistory).toHaveBeenCalledWith('word', word.id);
  await type('');
  await act(async () => tree.root.findByType(TextInput).props.onFocus());
  await press('Tra lại 学');
  expect(dictionaryService.character).toHaveBeenCalledWith('学');
  expect(dictionaryService.recordHistory).toHaveBeenCalledWith('kanji', '学');
  await type('');
  await act(async () => tree.root.findByType(TextInput).props.onFocus());
  await press('Xoá lịch sử');
  expect(dictionaryService.clearHistory).toHaveBeenCalledTimes(1);
  expect(control('Tra lại 学校')).toBeUndefined();
  expect(contents()).toContain('Chưa có lịch sử tra cứu.');
});

test('a new history notification takes precedence over an older history read', async () => {
  let resolve!: (result: { items: DictionaryHistoryItem[] }) => void;
  jest.mocked(dictionaryService.history).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await render();
  const notify = jest.mocked(dictionaryService.subscribeHistory).mock
    .calls[0][0];
  await act(async () =>
    notify([
      {
        kind: 'word',
        target: word.id,
        word: '学校',
        reading: 'がっこう',
        glosses: [],
        viewed_at: 2,
      },
    ]),
  );
  await act(async () => resolve({ items: [] }));
  await act(async () => tree.root.findByType(TextInput).props.onFocus());
  expect(control('Tra lại 学校')).toBeDefined();
  await type('xyz');
  expect(control('Tra lại 学校')).toBeUndefined();
  expect(contents()).toContain('Không có lịch sử phù hợp.');
  await type('学校');
  expect(control('Tra lại 学校')).toBeDefined();
  await act(async () =>
    tree.root
      .findByType(TextInput)
      .props.onKeyPress({ nativeEvent: { key: 'Escape' } }),
  );
  expect(control('Tra lại 学校')).toBeUndefined();
  await act(async () => tree.root.findByType(TextInput).props.onFocus());
  await press('Tìm kiếm từ điển');
  expect(control('Tra lại 学校')).toBeUndefined();
});

test('empty search results do not request a definition', async () => {
  jest.mocked(dictionaryService.words).mockResolvedValue({
    items: [],
    pagination: { ...pagination, total: 0, total_pages: 0 },
  });
  await render('khongtimthay');
  expect(dictionaryService.word).not.toHaveBeenCalled();
  expect(contents()).toContain('Không tìm thấy kết quả');
  expect(control('Quay lại từ điển')).toBeDefined();
  await press('Quay lại từ điển');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(contents()).toContain('Bạn muốn tra từ nào?');
});

test('search back restores the previous query and eventually the initial search screen', async () => {
  await render();
  expect(control('Quay lại từ điển')).toBeUndefined();
  await type('学校');
  await press('Tìm kiếm từ điển');
  expect(control('Quay lại từ điển')).toBeDefined();
  await type('人生');
  await press('Tìm kiếm từ điển');
  await press('Quay lại từ điển');
  expect(tree.root.findByType(TextInput).props.value).toBe('学校');
  expect(dictionaryService.words).toHaveBeenLastCalledWith('学校', 1);
  await press('Quay lại từ điển');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(control('Quay lại từ điển')).toBeUndefined();
});

test('a kanji selected from home history opens the exact character and supports going back', async () => {
  await act(async () => {
    tree = Renderer.create(
      <DictionaryScreen
        renderVideos={renderVideos}
        initialEntry={{
          kind: 'kanji',
          target: '学',
          word: '学',
          reading: 'HỌC',
          glosses: [],
          viewed_at: 1,
        }}
      />,
    );
  });
  expect(dictionaryService.character).toHaveBeenCalledWith('学');
  expect(dictionaryService.words).not.toHaveBeenCalled();
  expect(dictionaryService.kanji).not.toHaveBeenCalled();
  expect(tree.root.findByType(TextInput).props.value).toBe('学');
  await press('Quay lại từ điển');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(control('Hán tự').props.accessibilityState.selected).toBe(true);
});

test('search opens one primary definition and places JMdict candidates in related words', async () => {
  const related = {
    ...word,
    id: 'jmdict:school-life',
    word: '学校生活',
    reading: 'がっこうせいかつ',
    source_id: 'jmdict',
    match_type: 'prefix' as const,
    glosses: [{ language: 'eng', text: 'school life' }],
  };
  jest.mocked(dictionaryService.words).mockResolvedValue({
    items: [{ ...word, match_type: 'exact' }, related],
    pagination: { ...pagination, total: 2 },
  });
  jest.mocked(dictionaryService.word).mockImplementation(async id =>
    id === related.id
      ? {
          ...related,
          forms: [{ text: related.word, info: [] }],
          senses: [
            {
              parts_of_speech: ['noun'],
              glosses: related.glosses,
              notes: [],
              tags: [],
            },
          ],
        }
      : { ...word, related_entries: [related], kanji_details: [kanji] },
  );
  await render('学校');
  expect(tree.root.findByType(FlatList).props.data).toEqual([]);
  const primary = tree.root.findAllByProps({
    testID: 'dictionary-primary-word',
  })[0];
  expect(
    primary.findAllByType(Text).some(node => node.props.children === '学校'),
  ).toBe(true);
  expect(
    primary
      .findAllByType(Text)
      .some(node => node.props.children === '学校生活'),
  ).toBe(false);
  const sidebar = tree.root.findAllByProps({
    testID: 'dictionary-related-words',
  })[0];
  expect(
    sidebar
      .findAllByType(Text)
      .some(node => node.props.children === '学校生活'),
  ).toBe(true);
  await press('Tra từ 学校生活');
  expect(dictionaryService.word).toHaveBeenLastCalledWith(related.id);
  expect(tree.root.findByType(FlatList).props.data).toEqual([]);
  await press('Quay lại từ điển');
  expect(dictionaryService.word).toHaveBeenLastCalledWith(word.id);
});

test('word to kanji to compound and back keeps the original search', async () => {
  await render('学校');
  await press('Tra từ 学校');
  expect(dictionaryService.word).toHaveBeenCalledWith(word.id);
  expect(contents()).toContain('Nghĩa của từ');
  await press('Mở Hán tự 学');
  await press('Tra Hán tự 学');
  expect(dictionaryService.character).toHaveBeenCalledWith('学');
  expect(contents()).toContain('Thứ tự nét viết');
  await press('Tra từ 学校');
  expect(contents()).toContain('Nghĩa của từ');
  await press('Quay lại từ điển');
  expect(contents()).toContain('Thứ tự nét viết');
  await press('Quay lại từ điển');
  expect(contents()).toContain('Nghĩa của từ');
  expect(tree.root.findByType(TextInput).props.value).toBe('学校');
  expect(control('Tra từ 学校')).toBeDefined();
});

test('word kanji expand independently, show stroke diagrams, and reuse loaded data', async () => {
  const second = {
    ...kanji,
    literal: '校',
    on: ['コウ'],
    kun: [],
    han_viet: ['Hiệu'],
  };
  jest
    .mocked(dictionaryService.word)
    .mockResolvedValue({ ...word, kanji_details: [kanji, second] });
  jest
    .mocked(dictionaryService.character)
    .mockImplementation(async literal => (literal === '校' ? second : kanji));
  await render('学校');
  expect(dictionaryService.character).not.toHaveBeenCalled();
  expect(control('Mở Hán tự 学').props.accessibilityState.expanded).toBe(false);
  await press('Mở Hán tự 学');
  expect(dictionaryService.character).toHaveBeenCalledWith('学');
  expect(control('Thu gọn Hán tự 学').props.accessibilityState.expanded).toBe(
    true,
  );
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Thứ tự 1 nét viết' })
      .length,
  ).toBeGreaterThan(0);
  expect(contents()).toContain('HỌC');
  await press('Mở Hán tự 校');
  await press('Thu gọn Hán tự 学');
  expect(control('Thu gọn Hán tự 校').props.accessibilityState.expanded).toBe(
    true,
  );
  expect(
    tree.root.findAllByProps({ testID: 'dictionary-kanji-expanded-学' }),
  ).toHaveLength(0);
  await press('Mở Hán tự 学');
  expect(dictionaryService.character).toHaveBeenCalledTimes(2);
  expect(dictionaryService.word).toHaveBeenCalledTimes(1);
});

test('inline kanji strokes can retry errors and show a genuine missing-diagram state', async () => {
  jest
    .mocked(dictionaryService.character)
    .mockRejectedValueOnce(new Error('Không tải được nét viết'))
    .mockResolvedValueOnce({ ...kanji, stroke_paths: [] });
  await render('学校');
  await press('Mở Hán tự 学');
  expect(contents()).toContain('Không tải được nét viết');
  await press('Thử lại nét viết 学');
  expect(contents()).toContain('Chưa có sơ đồ nét viết cho chữ này.');
  await press('Thu gọn Hán tự 学');
  expect(contents()).not.toContain('Chưa có sơ đồ nét viết cho chữ này.');
});

test('kanji search uses its own API and can start a compound word search', async () => {
  await render();
  await press('Hán tự');
  expect(dictionaryService.kanji).not.toHaveBeenCalled();
  await type('học');
  await press('Tìm kiếm từ điển');
  expect(dictionaryService.kanji).toHaveBeenCalledWith('học', 1);
  expect(dictionaryService.character).toHaveBeenCalledWith('学');
  expect(contents()).toContain('Onyomi');
  expect(contents()).toContain('Kunyomi');
  expect(contents()).toContain('HỌC');
  expect(contents()).not.toContain('study');
  expect(contents()).not.toContain('school');
  expect(contents()).not.toContain('たか');
  expect(contents()).not.toContain('Số đánh dấu');
  await press('Tra Hán tự 学');
  expect(dictionaryService.character).toHaveBeenCalledTimes(1);
  await press('Tra các từ chứa chữ này');
  expect(dictionaryService.words).toHaveBeenCalledWith('学', 1);
  expect(control('Từ vựng').props.accessibilityState.selected).toBe(true);
});

test('kanji side results switch the primary character and preserve the search on back', async () => {
  const second = {
    ...kanji,
    literal: '校',
    han_viet: ['Hiệu'],
    stroke_paths: [],
  };
  jest.mocked(dictionaryService.kanji).mockResolvedValue({
    items: [kanji, second],
    pagination: { ...pagination, total: 2 },
  });
  jest
    .mocked(dictionaryService.character)
    .mockImplementation(async literal => (literal === '校' ? second : kanji));
  await render();
  await press('Hán tự');
  await type('学校');
  await press('Tìm kiếm từ điển');
  expect(control('Tra Hán tự 学').props.accessibilityState.selected).toBe(true);
  await press('Tra Hán tự 校');
  expect(control('Tra Hán tự 校').props.accessibilityState.selected).toBe(true);
  expect(contents()).toContain('HIỆU');
  expect(contents()).toContain('Chưa có sơ đồ nét viết cho chữ này.');
  expect(control('Hán tự').props.accessibilityState.selected).toBe(true);
  await press('Quay lại từ điển');
  expect(control('Tra Hán tự 学').props.accessibilityState.selected).toBe(true);
  expect(tree.root.findByType(TextInput).props.value).toBe('学校');
});

test('empty kanji results do not request a character detail', async () => {
  jest.mocked(dictionaryService.kanji).mockResolvedValue({
    items: [],
    pagination: { ...pagination, total: 0, total_pages: 0 },
  });
  await render();
  await press('Hán tự');
  await type('không tìm thấy');
  await press('Tìm kiếm từ điển');
  expect(dictionaryService.character).not.toHaveBeenCalled();
  expect(contents()).toContain('Không tìm thấy');
});

test('errors have retry and missing Vietnamese meanings are explicit', async () => {
  jest
    .mocked(dictionaryService.words)
    .mockRejectedValueOnce(new Error('Mất kết nối từ điển'));
  await render('school');
  expect(contents()).toContain('Mất kết nối từ điển');
  jest.mocked(dictionaryService.word).mockResolvedValue({
    ...word,
    senses: [
      {
        parts_of_speech: ['noun'],
        glosses: [{ language: 'eng', text: 'school' }],
        notes: [],
        tags: [],
      },
    ],
  });
  await press('Thử lại');
  expect(contents()).toContain('chưa có nghĩa tiếng Việt');
  expect(contents()).toContain('school');
});

test('Vietnamese lookup opens a Vietnamese definition without the English fallback notice', async () => {
  const vietnamese: WordDetail = {
    ...word,
    id: 'viwiktionary:school',
    source_id: 'viwiktionary',
    glosses: [{ language: 'vi', text: 'Trường học.' }],
    senses: [
      {
        ...word.senses[0],
        parts_of_speech: ['Danh từ'],
        glosses: [{ language: 'vi', text: 'Trường học.' }],
      },
    ],
  };
  jest
    .mocked(dictionaryService.words)
    .mockResolvedValue({ items: [vietnamese], pagination });
  jest.mocked(dictionaryService.word).mockResolvedValue(vietnamese);
  await render();
  await type('truong hoc');
  await press('Tìm kiếm từ điển');
  expect(dictionaryService.words).toHaveBeenCalledWith('truong hoc', 1);
  expect(dictionaryService.word).toHaveBeenCalledWith(vietnamese.id);
  expect(contents()).toContain('Trường học.');
  expect(contents()).not.toContain('chưa có nghĩa tiếng Việt');
  expect(contents()).not.toContain(' · Anh');
  expect(control('Chọn ngôn ngữ tra cứu')).toBeUndefined();
  await press('Mở Hán tự 学');
  await press('Tra Hán tự 学');
  await press('Tra các từ chứa chữ này');
  expect(dictionaryService.words).toHaveBeenLastCalledWith('学', 1);
});

test('Vietnamese definitions localize POS labels and omit English-original controls', async () => {
  const translated: WordDetail = {
    ...word,
    glosses: [{ language: 'vi', text: 'trường học', machine: true }],
    senses: [
      {
        ...word.senses[0],
        parts_of_speech: [
          'noun (common) (futsuumeishi)',
          'noun or participle which takes the aux. verb suru',
          'transitive verb',
        ],
        glosses: [
          { language: 'eng', text: 'school' },
          { language: 'vi', text: 'trường học', machine: true },
        ],
      },
    ],
  };
  jest
    .mocked(dictionaryService.words)
    .mockResolvedValue({ items: [translated], pagination });
  jest.mocked(dictionaryService.word).mockResolvedValue(translated);
  await render('学校');
  expect(contents()).toContain('trường học');
  expect(contents()).not.toContain('school');
  expect(control('Xem nghĩa Anh gốc')).toBeUndefined();
  expect(control('Ẩn nghĩa Anh gốc')).toBeUndefined();
  expect(contents()).toContain('1. Danh từ · Động từ với する · Ngoại động từ');
  expect(contents()).not.toContain('futsuumeishi');
  expect(contents()).not.toContain('transitive verb');
});

test('pagination remains available without the source section', async () => {
  jest.mocked(dictionaryService.words).mockResolvedValue({
    items: [word],
    pagination: { ...pagination, total: 21, total_pages: 2 },
  });
  await render('学');
  await press('Trang sau');
  expect(dictionaryService.words).toHaveBeenLastCalledWith('学', 2);
  expect(control('Nguồn dữ liệu')).toBeUndefined();
  expect(dictionaryService.sources).not.toHaveBeenCalled();
  await press('Quay lại từ điển');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
});

test('video tab delegates to the existing video flow', async () => {
  await render('学校');
  const calls = jest.mocked(dictionaryService.words).mock.calls.length;
  await press('Video');
  expect(renderVideos).toHaveBeenCalledWith('学校');
  expect(contents()).toContain('Danh sách ví dụ video');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  expect(tree.root.findByType(TextInput).props.value).toBe('学校');
  expect(control('Viết tay')).toBeDefined();
  await type('先生');
  expect(renderVideos).toHaveBeenLastCalledWith('学校');
  await press('Tìm kiếm từ điển');
  expect(renderVideos).toHaveBeenLastCalledWith('先生');
  expect(dictionaryService.words).toHaveBeenCalledTimes(calls);
});

test('definitions omit source blocks and lesson provenance', async () => {
  jest.mocked(dictionaryService.word).mockResolvedValue({
    ...word,
    source: {
      id: 'local',
      name: 'Kho từ vựng NihonGO',
      notes: 'Nội dung nguồn chưa hiệu đính',
    },
    references: [
      {
        word_id: 'lesson-word',
        title: 'Mimi kara oboeru N1',
        url: '',
        level: 'N1',
        quality: 'Chưa hiệu đính',
      },
    ],
    senses: [{ ...word.senses[0], reference_id: 'lesson-word' }],
  });
  await render('学校');
  expect(contents()).not.toContain('Kho từ vựng NihonGO');
  expect(contents()).not.toContain('hiệu đính');
  expect(contents()).not.toContain('Mimi kara');
  expect(contents()).not.toContain('Nguồn:');
});

test('tapping a shadowing word shows dictionary meanings in a compact popup', async () => {
  const onClose = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <ShadowingWordPopup
        onClose={onClose}
        word={{
          surface: '学校',
          lemma: '学校',
          reading: 'がっこう',
          pos: '名詞',
        }}
      />,
    );
  });
  expect(dictionaryService.words).toHaveBeenCalledWith('学校', 1);
  expect(dictionaryService.word).toHaveBeenCalledWith(word.id);
  expect(control('Mở từ điển')).toBeUndefined();
  await press('Đóng popup từ vựng');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('shadowing searches the lemma and falls back to the clicked surface', async () => {
  const onClose = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <ShadowingWordPopup onClose={onClose} word={null} />,
    );
  });
  expect(dictionaryService.words).not.toHaveBeenCalled();
  await act(async () =>
    tree.update(
      <ShadowingWordPopup
        onClose={onClose}
        word={{
          surface: '学んだ',
          lemma: '学ぶ',
          reading: 'まなんだ',
          pos: '動詞',
        }}
      />,
    ),
  );
  expect(dictionaryService.words).toHaveBeenLastCalledWith('学ぶ', 1);
  expect(contents()).toContain('学んだ → 学ぶ');
  await act(async () =>
    tree.update(
      <ShadowingWordPopup
        onClose={onClose}
        word={{
          surface: '学校',
          lemma: '',
          reading: 'がっこう',
          pos: '名詞',
        }}
      />,
    ),
  );
  expect(dictionaryService.words).toHaveBeenLastCalledWith('学校', 1);
});

test('shadowing popup prefers Vietnamese meanings without the dictionary workspace', async () => {
  jest.mocked(dictionaryService.word).mockResolvedValue({
    ...word,
    han_viet: ['Học hiệu'],
    senses: [
      {
        ...word.senses[0],
        glosses: [
          { language: 'eng', text: 'school' },
          { language: 'vi', text: 'trường học' },
        ],
      },
    ],
  });
  await act(async () => {
    tree = Renderer.create(
      <ShadowingWordPopup
        onClose={jest.fn()}
        word={{
          surface: '学校',
          lemma: '学校',
          reading: 'がっこう',
          pos: '名詞',
        }}
      />,
    );
  });
  expect(contents()).toContain('trường học');
  expect(contents()).toContain('HỌC HIỆU');
  expect(contents()).toContain('Danh từ');
  expect(contents()).not.toContain('school');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(tree.root.findAllByType(DictionaryScreen)).toHaveLength(0);
});

test('shadowing popup rejects fuzzy matches and can retry dictionary failures', async () => {
  jest
    .mocked(dictionaryService.words)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await act(async () => {
    tree = Renderer.create(
      <ShadowingWordPopup
        onClose={jest.fn()}
        word={{
          surface: '学',
          lemma: '学',
          reading: 'がく',
          pos: '名詞',
        }}
      />,
    );
  });
  expect(contents()).toContain('Mất kết nối');
  await act(async () =>
    tree.root
      .findAll(node => node.props.label === 'Thử lại')[0]
      .props.onPress(),
  );
  expect(dictionaryService.words).toHaveBeenCalledTimes(2);
  expect(dictionaryService.word).not.toHaveBeenCalled();
  expect(contents()).toContain('Không tìm thấy kết quả');
});

test('appends handwriting candidates to the current search draft across selections', async () => {
  await render('古');
  await type('学');
  await press('Viết tay');
  await act(async () =>
    tree.root.findByType(HandwritingLookup).props.onSelect('校'),
  );
  expect(tree.root.findByType(TextInput).props.value).toBe('学校');
  expect(dictionaryService.words).toHaveBeenLastCalledWith('学校', 1);
  await press('Viết tay');
  await act(async () =>
    tree.root.findByType(HandwritingLookup).props.onSelect('生'),
  );
  expect(tree.root.findByType(TextInput).props.value).toBe('学校生');
  expect(dictionaryService.words).toHaveBeenLastCalledWith('学校生', 1);
});

test('shows sentence translation in the vocabulary tab after submitting the shared input', async () => {
  jest
    .mocked(dictionaryService.words)
    .mockResolvedValue({ items: [], pagination: { ...pagination, total: 0 } });
  jest.mocked(sentenceTranslationService.translate).mockResolvedValue({
    text: '私は学生です。',
    translation: 'Tôi là học sinh.',
    source: 'ja',
    target: 'vi',
    model: 'test',
    cached: false,
    elapsed_ms: 10,
    japanese: '私は学生です。',
    vietnamese: 'Tôi là học sinh.',
    paragraphs: [
      { id: '0', text: '私は学生です。', tokens: [{ text: '私は学生です。' }] },
    ],
    words: {},
  });
  await render();
  await type('私は学生です。');
  expect(sentenceTranslationService.translate).not.toHaveBeenCalled();
  await press('Tìm kiếm từ điển');
  expect(sentenceTranslationService.translate).toHaveBeenCalledWith(
    '私は学生です。',
    'ja',
    'vi',
  );
  expect(contents()).toContain('Kết quả tra cứu');
  expect(contents()).toContain('Tôi là học sinh.');
  expect(contents()).not.toContain('Không tìm thấy kết quả');
  expect(control('Dịch')).toBeUndefined();
});
test('exact dictionary matches take priority over sentence heuristics', async () => {
  jest.mocked(dictionaryService.words).mockResolvedValue({
    items: [{ ...word, word: '学校へ行きます。', match_type: 'exact' }],
    pagination,
  });
  await render('学校へ行きます。');
  expect(sentenceTranslationService.translate).not.toHaveBeenCalled();
  expect(contents()).toContain('学校');
});

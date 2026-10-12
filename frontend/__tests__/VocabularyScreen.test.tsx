import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { BackHandler, Keyboard, Modal, Text, TextInput } from 'react-native';
import { AuthButton } from '../src/components/AuthForm';
import { VocabularyScreen } from '../src/screens/VocabularyScreen';
import { vocabularyService } from '../src/services/vocabularyService';
import { videoExamplesService } from '../src/services/videoExamplesService';
import { AudioReplay } from '../src/services/audioReplay';
import {
  VideoExamplePlayer,
  videoPlayerHtml,
} from '../src/components/VideoExamplePlayer';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('../src/services/audioReplay');
jest.mock('../src/services/videoExamplesService', () => ({
  videoExamplesService: { search: jest.fn() },
}));

jest.mock('../src/services/vocabularyService', () => ({
  JLPT_LEVELS: ['N5', 'N4', 'N3', 'N2', 'N1'],
  vocabularyService: {
    textbooks: jest.fn(),
    textbook: jest.fn(),
    lesson: jest.fn(),
    search: jest.fn(),
    audioPlayback: jest.fn(),
  },
}));
const book = {
  id: 'mimikara-n2',
  title: 'Mimi kara oboeru N2 Goi',
  level: 'N2' as const,
  source_url: 'https://example.com',
  word_count: 1160,
  lesson_count: 89,
};
const lesson = {
  id: 'lesson-1',
  number: 1,
  title: 'Unit 01 – Test – Bài 1',
  word_count: 1,
};
const unit = { number: 1, title: '名詞A', word_count: 1, lessons: [lesson] };
const word = {
  id: 'word-1',
  number: 1,
  word: '人生',
  reading: 'じんせい',
  meaning_vi: 'cuộc đời',
  han_viet: 'nhân sinh',
  examples: [
    {
      japanese: '人生を楽しむ。',
      reading: 'じんせいをたのしむ。',
      meaning_vi: 'Tận hưởng cuộc sống.',
    },
  ],
  related: [],
};
let tree: Renderer.ReactTestRenderer;
const videoExample = {
  id: 'cjtmDEG-B7U-ja-0001',
  text: '人生を楽しむ。',
  search_text: '人生を楽しむ。',
  start_seconds: 727.27,
  end_seconds: 731.5,
  video: {
    youtube_id: 'cjtmDEG-B7U',
    title: 'TEDxHimi',
    channel: 'TEDx Talks',
  },
  watch_url: 'https://www.youtube.com/watch?v=cjtmDEG-B7U&t=727s',
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AudioReplay.prototype.play).mockResolvedValue(true);
  jest.mocked(AudioReplay.prototype.close).mockResolvedValue(undefined);
  jest.mocked(vocabularyService.audioPlayback).mockResolvedValue({
    url: 'https://s3.test/signed.mp3',
    expires_in: 300,
  });
  jest.mocked(videoExamplesService.search).mockResolvedValue({
    query: '人生',
    items: [videoExample],
    next_cursor: null,
    has_more: false,
  });
  jest.mocked(vocabularyService.textbooks).mockImplementation(async level => ({
    level,
    items: level === 'N2' ? [book] : [],
  }));
  jest
    .mocked(vocabularyService.textbook)
    .mockResolvedValue({ textbook: book, units: [unit] });
  jest.mocked(vocabularyService.lesson).mockResolvedValue({
    lesson: {
      ...lesson,
      textbook_id: book.id,
      unit_number: 1,
      unit_title: unit.title,
      source_url: 'https://example.com',
      audio_urls: [],
    },
    words: [word],
  });
  jest.mocked(vocabularyService.search).mockResolvedValue({
    items: [word],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
async function render(query = '', onExit?: () => void) {
  await act(async () => {
    tree = Renderer.create(<VocabularyScreen query={query} onExit={onExit} />);
  });
}
function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
async function press(label: string) {
  await act(async () => button(label).props.onPress());
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
async function openLesson() {
  await press('Mở Bài 1');
}

test('audio icon only appears for ready audio and stops on returning to lessons', async () => {
  const detail = await vocabularyService.lesson('lesson-1');
  jest.mocked(vocabularyService.lesson).mockResolvedValue({
    ...detail,
    words: [{ ...word, has_audio: true }],
  });
  await render();
  await openLesson();
  await press('Nghe phát âm 人生');
  expect(vocabularyService.audioPlayback).toHaveBeenCalledWith('word-1');
  expect(AudioReplay.prototype.play).toHaveBeenCalledWith(
    'https://s3.test/signed.mp3',
    expect.any(Function),
  );
  expect(button('Dừng phát âm 人生')).toBeDefined();
  await press('Dừng phát âm 人生');
  expect(button('Nghe phát âm 人生')).toBeDefined();
  await press('Nghe phát âm 人生');
  const closeCalls = jest.mocked(AudioReplay.prototype.close).mock.calls.length;
  await press('Quay lại');
  expect(
    jest.mocked(AudioReplay.prototype.close).mock.calls.length,
  ).toBeGreaterThan(closeCalls);
});

test('words without audio show no speaker and playback errors allow retry', async () => {
  await render();
  await openLesson();
  expect(button('Nghe phát âm 人生')).toBeUndefined();
  await press('Quay lại');
  const detail = await vocabularyService.lesson('lesson-1');
  jest.mocked(vocabularyService.lesson).mockResolvedValue({
    ...detail,
    words: [{ ...word, has_audio: true }],
  });
  await openLesson();
  jest
    .mocked(vocabularyService.audioPlayback)
    .mockRejectedValueOnce(new Error('offline'));
  await press('Nghe phát âm 人生');
  expect(contents()).toContain('Không phát được âm thanh');
  await press('Nghe phát âm 人生');
  expect(button('Dừng phát âm 人生')).toBeDefined();
});

test('N5 topic names appear on lesson cards without showing textbook names', async () => {
  jest.mocked(vocabularyService.textbooks).mockImplementation(async level => ({
    level,
    items: level === 'N5' ? [{ ...book, id: 'jtest-n5', level: 'N5' }] : [],
  }));
  jest.mocked(vocabularyService.textbook).mockResolvedValue({
    textbook: { ...book, id: 'jtest-n5', level: 'N5' },
    units: [{ ...unit, title: 'Tự giới thiệu' }],
  });
  await render();
  await press('JLPT N5');
  expect(contents()).toContain('Tự giới thiệu');
  expect(button('Mở Bài 1')).toBeDefined();
});

test('shows N2 lessons directly without displaying a textbook or source name', async () => {
  await render();
  expect(button('Bài học').props.accessibilityState.selected).toBe(true);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(button('Tìm ví dụ trong video')).toBeUndefined();
  for (const level of ['N5', 'N4', 'N3', 'N2', 'N1'])
    expect(button(`JLPT ${level}`)).toBeDefined();
  expect(button('JLPT N2').props.accessibilityState.checked).toBe(true);
  expect(button('Mở Bài 1')).toBeDefined();
  expect(contents()).not.toMatch(/Mimi|VNJPCLUB|giáo trình|Unit/);
  await openLesson();
  expect(button('JLPT N2')).toBeUndefined();
  expect(vocabularyService.lesson).toHaveBeenCalledWith('lesson-1');
  expect(contents()).toContain('じんせい');
  expect(contents()).toContain('cuộc đời');
  expect(contents()).not.toMatch(/Mimi|VNJPCLUB|giáo trình/);
  await press('Ví dụ và từ liên quan của 人生');
  expect(contents()).toContain('Tận hưởng cuộc sống.');
  await press('Quay lại');
  expect(button('Mở Bài 1')).toBeDefined();
  expect(button('JLPT N2').props.accessibilityState.checked).toBe(true);
});

test('unavailable levels show an honest empty state and can return to N2', async () => {
  await render();
  await press('JLPT N5');
  expect(contents()).toContain('N5 chưa có dữ liệu');
  expect(contents()).not.toContain('Mimi kara oboeru N2 Goi');
  await act(async () =>
    tree.root
      .findAllByType(AuthButton)
      .find(node => node.props.label === 'Khám phá N2')!
      .props.onPress(),
  );
  expect(button('Mở Bài 1')).toBeDefined();
});

test('hides translations for recall and reveals one word on demand', async () => {
  await render();
  await openLesson();
  await press('Ẩn nghĩa để tự ôn');
  expect(contents()).not.toContain('cuộc đời');
  await press('Ví dụ và từ liên quan của 人生');
  expect(contents()).not.toContain('Tận hưởng cuộc sống.');
  await press('Hiện nghĩa của 人生');
  expect(contents()).toContain('cuộc đời');
  expect(contents()).toContain('Tận hưởng cuộc sống.');
});

test('home search opens lookup and switches between video and ordinary search', async () => {
  await render('人生');
  expect(videoExamplesService.search).toHaveBeenCalledWith('人生', undefined);
  expect(contents()).toContain('TEDxHimi');
  expect(button('JLPT N2')).toBeUndefined();
  expect(button('Tra cứu').props.accessibilityState.selected).toBe(true);
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(1);
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  await press('Tra cứu thông thường');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
  expect(vocabularyService.search).toHaveBeenCalledWith('N2', '人生', 1);
  expect(contents()).toContain('cuộc đời');
  expect(button('JLPT N2')).toBeUndefined();
  expect(button('Ẩn nghĩa để tự ôn')).toBeUndefined();
  await press('Quay lại');
  expect(contents()).toContain('Nhập từ bạn muốn tra cứu');
  expect(button('Mở Bài 1')).toBeUndefined();
  await press('Bài học');
  expect(button('Mở Bài 1')).toBeDefined();
});

test('lookup has its own empty state and does not fetch lessons or search before submitting', async () => {
  await render();
  jest.clearAllMocks();
  await press('Tra cứu');
  expect(button('Tra cứu').props.accessibilityState.selected).toBe(true);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  expect(button('JLPT N2')).toBeUndefined();
  expect(button('Mở Bài 1')).toBeUndefined();
  expect(contents()).toContain('Nhập từ bạn muốn tra cứu');
  expect(vocabularyService.textbooks).not.toHaveBeenCalled();
  expect(vocabularyService.search).not.toHaveBeenCalled();
  expect(videoExamplesService.search).not.toHaveBeenCalled();
  expect(button('Tìm kiếm').props.accessibilityState.disabled).toBe(true);
});

test('keeps the lesson level separate from lookup and preserves the query between sections', async () => {
  await render('人生');
  await press('Bài học');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  await press('JLPT N5');
  expect(contents()).toContain('N5 chưa có dữ liệu');
  await press('Tra cứu');
  expect(tree.root.findByType(TextInput).props.value).toBe('人生');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(1);
  await press('Tra cứu thông thường');
  expect(vocabularyService.search).toHaveBeenLastCalledWith('N2', '人生', 1);
  expect(contents()).toContain('cuộc đời');
  await press('Bài học');
  expect(button('JLPT N5').props.accessibilityState.checked).toBe(true);
  await press('Tra cứu');
  expect(button('Tra cứu thông thường').props.accessibilityState.checked).toBe(
    true,
  );
  expect(tree.root.findByType(TextInput).props.value).toBe('人生');
});

test('Android back returns lookup results to lookup, then exits without entering lessons', async () => {
  let handleBack!: () => boolean | null | undefined;
  const listener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      handleBack = () => handler({} as Parameters<typeof handler>[0]);
      return { remove: jest.fn() };
    });
  const onExit = jest.fn();
  await render('人生', onExit);
  await act(async () => {
    expect(handleBack()).toBe(true);
  });
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
  expect(contents()).toContain('Nhập từ bạn muốn tra cứu');
  expect(button('Mở Bài 1')).toBeUndefined();
  await act(async () => {
    expect(handleBack()).toBe(true);
  });
  expect(onExit).toHaveBeenCalledTimes(1);
  listener.mockRestore();
});

test('shows the first clip immediately, replays and switches clips in one inline player', async () => {
  jest.mocked(videoExamplesService.search).mockResolvedValue({
    query: '人生',
    items: [
      videoExample,
      { ...videoExample, id: 'second', start_seconds: 800, end_seconds: 805 },
    ],
    next_cursor: null,
    has_more: false,
  });
  await render('人生');
  expect(
    tree.root.findByType(VideoExamplePlayer).props.example.start_seconds,
  ).toBe(727.27);
  expect(button('Xem ví dụ tại 12:07').props.accessibilityState.selected).toBe(
    true,
  );
  expect(contents()).toContain('Đoạn 1/2');
  let player = tree.root.findByProps({ testID: 'youtube-example-player' });
  expect(player.props.source.html).toContain('"startSeconds":727.27');
  expect(player.props.source.baseUrl).toMatch(/^https:\/\//);
  await act(async () =>
    player.props.onMessage({ nativeEvent: { data: '{"type":"ready"}' } }),
  );
  expect(contents()).not.toContain('Đang tải video…');
  await act(async () =>
    tree.root
      .findAllByType(AuthButton)
      .find(n => n.props.label === 'Nghe lại')!
      .props.onPress(),
  );
  expect(contents()).toContain('Đang tải video…');
  await act(async () =>
    tree.root
      .findAllByType(AuthButton)
      .find(n => n.props.label === 'Ví dụ tiếp')!
      .props.onPress(),
  );
  expect(
    tree.root.findByType(VideoExamplePlayer).props.example.start_seconds,
  ).toBe(800);
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(1);
  expect(contents()).toContain('Đoạn 2/2');
  expect(button('Xem ví dụ tại 13:20').props.accessibilityState.selected).toBe(
    true,
  );
  await press('Xem ví dụ tại 12:07');
  expect(tree.root.findByType(VideoExamplePlayer).props.example.id).toBe(
    videoExample.id,
  );
  expect(
    tree.root.findAllByProps({ testID: 'youtube-example-player' }),
  ).toHaveLength(1);
  await press('Quay lại');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
});

test('editing a query keeps playback, submitting stops the old clip and opens the new first result', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  let resolve!: (
    value: Awaited<ReturnType<typeof videoExamplesService.search>>,
  ) => void;
  jest
    .mocked(videoExamplesService.search)
    .mockResolvedValueOnce({
      query: '人生',
      items: [videoExample],
      next_cursor: null,
      has_more: false,
    })
    .mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
  await render('人生');
  const player = tree.root.findByProps({ testID: 'youtube-example-player' });
  await act(async () =>
    player.props.onMessage({ nativeEvent: { data: '{"type":"ready"}' } }),
  );
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('社会'),
  );
  expect(tree.root.findByProps({ testID: 'youtube-example-player' })).toBe(
    player,
  );
  expect(contents()).not.toContain('Đang tải video…');
  await act(async () =>
    tree.root.findByType(TextInput).props.onSubmitEditing(),
  );
  expect(dismiss).toHaveBeenCalled();
  expect(videoExamplesService.search).toHaveBeenLastCalledWith(
    '社会',
    undefined,
  );
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
  await act(async () =>
    resolve({
      query: '社会',
      items: [
        {
          ...videoExample,
          id: 'society',
          text: '社会',
          search_text: '社会',
          start_seconds: 60,
          end_seconds: 64,
        },
      ],
      next_cursor: null,
      has_more: false,
    }),
  );
  expect(tree.root.findByType(VideoExamplePlayer).props.example.id).toBe(
    'society',
  );
  expect(
    tree.root.findByProps({ testID: 'youtube-example-player' }).props.source
      .html,
  ).toContain('"startSeconds":60');
  dismiss.mockRestore();
});

test('video pagination requests a cursor and retry keeps the video query', async () => {
  jest
    .mocked(videoExamplesService.search)
    .mockResolvedValueOnce({
      query: '人生',
      items: [videoExample],
      next_cursor: 'next',
      has_more: true,
    })
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await render('人生');
  await act(async () =>
    tree.root
      .findAllByType(AuthButton)
      .find(n => n.props.label === 'Ví dụ khác')!
      .props.onPress(),
  );
  expect(videoExamplesService.search).toHaveBeenCalledWith('人生', 'next');
  expect(contents()).toContain('Mất kết nối');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
  await act(async () =>
    tree.root
      .findAllByType(AuthButton)
      .find(n => n.props.label === 'Thử lại')!
      .props.onPress(),
  );
  expect(contents()).toContain('TEDxHimi');
});

test('shows a real empty state when no video contains the query', async () => {
  jest.mocked(videoExamplesService.search).mockResolvedValue({
    query: 'ない',
    items: [],
    next_cursor: null,
    has_more: false,
  });
  await render('ない');
  expect(contents()).toContain('Chưa tìm thấy ví dụ trong video');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
});

test('player rejects invalid video identifiers before embedding HTML', () => {
  expect(() =>
    videoPlayerHtml({
      ...videoExample,
      video: { ...videoExample.video, youtube_id: '</script>' },
    }),
  ).toThrow();
});

test('offers retry after a network error instead of showing missing data', async () => {
  jest
    .mocked(vocabularyService.textbooks)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await render();
  expect(contents()).toContain('Mất kết nối');
  expect(contents()).not.toContain('N2 chưa có dữ liệu');
  await act(async () =>
    tree.root
      .findAllByType(AuthButton)
      .find(node => node.props.label === 'Thử lại')!
      .props.onPress(),
  );
  expect(button('Mở Bài 1')).toBeDefined();
});

test('numbers lessons continuously across source units so names are unique', async () => {
  jest.mocked(vocabularyService.textbook).mockResolvedValue({
    textbook: book,
    units: [
      unit,
      {
        ...unit,
        number: 2,
        title: '動詞A',
        lessons: [{ ...lesson, id: 'lesson-2' }],
      },
    ],
  });
  await render();
  expect(button('Mở Bài 1')).toBeDefined();
  expect(button('Mở Bài 2')).toBeDefined();
  await press('Mở Bài 2');
  expect(vocabularyService.lesson).toHaveBeenCalledWith('lesson-2');
  expect(contents()).toContain('Bài 2');
  expect(contents()).toContain('Động từ');
});

test('ignores a late N2 response after the learner switches level', async () => {
  let resolve!: (value: { level: 'N2'; items: (typeof book)[] }) => void;
  jest.mocked(vocabularyService.textbooks).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await render();
  await press('JLPT N1');
  await act(async () => resolve({ level: 'N2', items: [book] }));
  expect(contents()).toContain('N1 chưa có dữ liệu');
  expect(contents()).not.toContain('Mimi kara oboeru N2 Goi');
});

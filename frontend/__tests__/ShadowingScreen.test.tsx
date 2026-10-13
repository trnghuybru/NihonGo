import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, FlatList, Text, TextInput } from 'react-native';
import { AuthButton } from '../src/components/AuthForm';
import { ShadowingScreen } from '../src/screens/ShadowingScreen';
import { VideoExamplePlayer } from '../src/components/VideoExamplePlayer';
import {
  shadowingService,
  ShadowingJob,
} from '../src/services/shadowingService';

jest.mock('../src/services/shadowingService', () => ({
  shadowingService: {
    list: jest.fn(),
    submit: jest.fn(),
    lesson: jest.fn(),
    retry: jest.fn(),
    translation: jest.fn(),
    requestTranslation: jest.fn(),
    questions: jest.fn(),
  },
}));
const job: ShadowingJob = {
  id: 'job-1',
  video_id: 'cjtmDEG-B7U',
  title: 'Bài nghe',
  status: 'ready',
  error_code: null,
  error_message: null,
  can_retry: false,
};
const example = {
  id: 'one',
  text: '日本語です。',
  search_text: '日本語です。',
  start_seconds: 1,
  end_seconds: 3,
  video: { youtube_id: job.video_id, title: job.title, channel: 'Test' },
  watch_url: 'https://youtu.be/cjtmDEG-B7U',
};
let tree: Renderer.ReactTestRenderer;
const injectJavaScript = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(shadowingService.list).mockResolvedValue({ items: [job] });
  jest.mocked(shadowingService.lesson).mockResolvedValue({
    job,
    video: example.video,
    caption_kind: 'manual',
    segments: [
      example,
      {
        ...example,
        id: 'two',
        text: '次の文。',
        search_text: '次の文。',
        start_seconds: 4,
        end_seconds: 6,
      },
    ],
  });
  jest.mocked(shadowingService.submit).mockResolvedValue({ job });
  jest.mocked(shadowingService.questions).mockResolvedValue({
    questions: [
      {
        id: 'q1',
        question: '話している人は何語を使っていますか。',
        choices: ['日本語', 'ベトナム語', '英語', 'フランス語'],
        correct_index: 0,
        explanation: 'Người nói giới thiệu đây là tiếng Nhật.',
        trigger_seconds: 3,
        evidence_segment_ids: ['one'],
      },
      {
        id: 'q2',
        question: 'その後、話している人は何をしますか。',
        choices: [
          '終わります',
          '次の文を言います',
          '歌います',
          '数字を読みます',
        ],
        correct_index: 1,
        explanation: 'Người nói chuyển sang câu tiếp theo.',
        trigger_seconds: 6,
        evidence_segment_ids: ['two'],
      },
    ],
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});
async function render() {
  await act(async () => {
    tree = Renderer.create(<ShadowingScreen />, {
      createNodeMock: element =>
        element.type === 'WebView' ? { injectJavaScript } : null,
    });
  });
}
async function press(label: string) {
  await act(async () => {
    const button = tree.root.findAll(
      node =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === 'function',
    )[0];
    if (button) await button.props.onPress();
    else
      await tree.root
        .findAllByType(AuthButton)
        .find(node => node.props.label === label)!
        .props.onPress();
  });
}

function visibleText() {
  return tree.root
    .findAllByType(Text)
    .map(node =>
      React.Children.toArray(node.props.children)
        .filter(child => typeof child === 'string' || typeof child === 'number')
        .join(''),
    )
    .join('\n');
}

test('opens a ready lesson, controls caption visibility speed and looping, and returns to list', async () => {
  await render();
  await press('Luyện shadowing');
  expect(tree.root.findByType(VideoExamplePlayer).props.example.id).toBe('one');
  await press('Ẩn phụ đề');
  expect(tree.root.findByType(VideoExamplePlayer).props.hideCaption).toBe(true);
  expect(
    tree.root.findAllByProps({ testID: 'shadowing-current-caption' }),
  ).toHaveLength(0);
  expect(visibleText()).toContain('日本語です。');
  await press('Hiện phụ đề');
  expect(
    tree.root.findByProps({ testID: 'shadowing-current-caption' }),
  ).toBeDefined();
  expect(tree.root.findByType(VideoExamplePlayer).props.hideCaption).toBe(
    false,
  );
  await press('Tuỳ chọn shadowing');
  await press('Tốc độ 1x');
  await press('Lặp đoạn');
  expect(tree.root.findByType(VideoExamplePlayer).props.playbackRate).toBe(
    0.75,
  );
  expect(tree.root.findByType(VideoExamplePlayer).props.loop).toBe(true);
  await press('Ví dụ tiếp');
  expect(tree.root.findByType(VideoExamplePlayer).props.example.id).toBe('two');
  await press('Đóng tuỳ chọn luyện nghe');
  await press('Danh sách video');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
});

test.each(['ready', 'failed', 'empty'] as const)(
  'does not poll an idle catalog (%s)',
  async status => {
    jest.useFakeTimers();
    jest.mocked(shadowingService.list).mockResolvedValue({
      items: status === 'empty' ? [] : [{ ...job, status }],
    });
    await render();
    await act(async () => jest.advanceTimersByTime(20000));
    expect(shadowingService.list).toHaveBeenCalledTimes(1);
  },
);

test('refreshes on foreground and pauses pending polling in the background', async () => {
  jest.useFakeTimers();
  const listener = jest.spyOn(AppState, 'addEventListener');
  jest.mocked(shadowingService.list).mockResolvedValue({
    items: [{ ...job, status: 'queued' }],
  });
  await render();
  const change = listener.mock.calls.find(([event]) => event === 'change')![1];
  await act(async () => change('background'));
  await act(async () => jest.advanceTimersByTime(20000));
  expect(shadowingService.list).toHaveBeenCalledTimes(1);
  jest.mocked(shadowingService.list).mockResolvedValue({ items: [job] });
  await act(async () => change('active'));
  expect(shadowingService.list).toHaveBeenCalledTimes(2);
  await act(async () => jest.advanceTimersByTime(20000));
  expect(shadowingService.list).toHaveBeenCalledTimes(2);
});

test('submits link, polls queued job until ready, then stops', async () => {
  jest.useFakeTimers();
  jest.mocked(shadowingService.list).mockResolvedValue({ items: [] });
  jest
    .mocked(shadowingService.submit)
    .mockResolvedValue({ job: { ...job, status: 'queued', title: '' } });
  await render();
  await act(async () => {
    tree.root
      .findByType(TextInput)
      .props.onChangeText('https://youtu.be/cjtmDEG-B7U');
  });
  await press('Chuẩn bị video');
  expect(shadowingService.submit).toHaveBeenCalledWith(
    'https://youtu.be/cjtmDEG-B7U',
  );
  expect(visibleText()).toContain('Đang chờ xử lý');
  expect(tree.root.findAllByType(VideoExamplePlayer)).toHaveLength(0);
  jest.mocked(shadowingService.list).mockResolvedValue({ items: [job] });
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(visibleText()).toContain('Sẵn sàng luyện');
  expect(shadowingService.list).toHaveBeenCalledTimes(2);
  await act(async () => jest.advanceTimersByTime(20000));
  expect(shadowingService.list).toHaveBeenCalledTimes(2);
});

test('failed source displays actionable error and retry requeues the same job', async () => {
  jest.mocked(shadowingService.list).mockResolvedValue({
    items: [
      {
        ...job,
        status: 'failed',
        can_retry: true,
        error_message: 'Không lấy được nguồn.',
      },
    ],
  });
  jest
    .mocked(shadowingService.retry)
    .mockResolvedValue({ job: { ...job, status: 'queued' } });
  await render();
  expect(visibleText()).toContain('Không lấy được nguồn.');
  await press('Thử lại');
  expect(shadowingService.retry).toHaveBeenCalledWith(job.id);
  expect(visibleText()).toContain('Đang chờ xử lý');
});

test('highlights live captions while keeping the video mounted, and seeks only on user selection', async () => {
  await render();
  await press('Luyện shadowing');
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  const source = webview.props.source;
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
    }),
  );
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: 1, clipId: 'one' },
        }),
      },
    }),
  );
  expect(tree.root.findByType(VideoExamplePlayer).props.position).toBe(2);
  expect(tree.root.findByType(VideoExamplePlayer).props.example.id).toBe('one');
  expect(tree.root.findByProps({ testID: 'youtube-example-player' })).toBe(
    webview,
  );
  expect(webview.props.source).toBe(source);
  await press('Tuỳ chọn shadowing');
  await press('Tốc độ 1x');
  expect(webview.props.source).toBe(source);
  expect(injectJavaScript.mock.calls.at(-1)?.[0]).toContain('"rate":0.75');
  await press('Đóng tuỳ chọn luyện nghe');
  await press('Luyện đoạn 2');
  expect(tree.root.findByType(VideoExamplePlayer).props.example.id).toBe('two');
  expect(webview.props.source).toBe(source);
  expect(injectJavaScript.mock.calls.at(-1)?.[0]).toContain('"replay":true');
  const request = tree.root.findByType(VideoExamplePlayer).props.seekRequest;
  await press('Luyện đoạn 2');
  expect(tree.root.findByType(VideoExamplePlayer).props.seekRequest).toBe(
    request + 1,
  );
  // A late bridge message from the previous selection must not move the highlight.
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: 0, clipId: 'one' },
        }),
      },
    }),
  );
  expect(tree.root.findByType(VideoExamplePlayer).props.position).toBe(2);
});

test('manual scrolling suspends following while subtitle highlighting continues', async () => {
  await render();
  await press('Luyện shadowing');
  const scroll = jest
    .spyOn(FlatList.prototype, 'scrollToIndex')
    .mockImplementation(() => {});
  const player = tree.root.findByType(VideoExamplePlayer);
  await act(async () => player.props.onCaptionChange(0));
  expect(scroll).toHaveBeenCalledWith({
    index: 0,
    animated: true,
    viewPosition: 0.25,
  });
  scroll.mockClear();
  await act(async () =>
    tree.root.findByType(FlatList).props.onScrollBeginDrag(),
  );
  await act(async () => player.props.onCaptionChange(1));
  expect(scroll).not.toHaveBeenCalled();
  expect(player.props.position).toBe(2);
  await press('Theo dõi phụ đề');
  expect(scroll).toHaveBeenCalledWith({
    index: 1,
    animated: true,
    viewPosition: 0.25,
  });
  scroll.mockRestore();
});

test('replay uses the live phrase rather than the initial phrase in continuous mode', async () => {
  await render();
  await press('Luyện shadowing');
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
    }),
  );
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: 1, clipId: 'one' },
        }),
      },
    }),
  );
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: -1, clipId: 'one' },
        }),
      },
    }),
  );
  await press('Nghe lại');
  expect(tree.root.findByType(VideoExamplePlayer).props.example.id).toBe('two');
  expect(injectJavaScript.mock.calls.at(-1)?.[0]).toContain('"start":4');
  expect(injectJavaScript.mock.calls.at(-1)?.[0]).toContain('"replay":true');
});

test('reference layout shows a synced current sentence, collapses the subtitle panel and preserves playback', async () => {
  await render();
  await press('Luyện shadowing');
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  const source = webview.props.source;
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: 1, clipId: 'one' },
        }),
      },
    }),
  );
  const currentCaption = tree.root.findByProps({
    testID: 'shadowing-current-caption',
  });
  expect(currentCaption.findByType(Text).props.children).toBe('次の文。');
  expect(tree.root.findByType(VideoExamplePlayer).props.videoOnly).toBe(true);
  await press('Phụ đề');
  expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
  expect(webview.props.source).toBe(source);
  await press('Phụ đề');
  expect(tree.root.findAllByType(FlatList)).toHaveLength(1);
  expect(webview.props.source).toBe(source);
  const translation = tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'Bản dịch' &&
      typeof node.props.onPress === 'function',
  )[0];
  expect(translation.props.accessibilityState.selected).toBe(false);
  expect(shadowingService.translation).not.toHaveBeenCalled();
});

test('short display cues advance independently while replay keeps the full practice phrase', async () => {
  const original = await shadowingService.lesson('job-1');
  jest.mocked(shadowingService.lesson).mockResolvedValue({
    ...original,
    captions: [
      {
        ...example,
        id: 'cue-one',
        segment_id: 'one',
        text: '日本語',
        end_seconds: 2,
      },
      {
        ...example,
        id: 'cue-two',
        segment_id: 'one',
        text: 'です。',
        start_seconds: 2,
      },
      { ...original.segments[1], id: 'cue-three', segment_id: 'two' },
    ],
  });
  await render();
  await press('Luyện shadowing');
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  const source = webview.props.source;
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
    }),
  );
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: 1, clipId: 'one' },
        }),
      },
    }),
  );
  const currentCaption = tree.root
    .findByProps({ testID: 'shadowing-current-caption' })
    .findByType(Text);
  expect(currentCaption.props.children).toBe('です。');
  expect(currentCaption.props.numberOfLines).toBeUndefined();
  expect(tree.root.findByType(VideoExamplePlayer).props.position).toBe(1);
  await press('Nghe lại');
  expect(injectJavaScript.mock.calls.at(-1)?.[0]).toContain('"start":1');
  expect(injectJavaScript.mock.calls.at(-1)?.[0]).toContain('"end":3');
  expect(webview.props.source).toBe(source);
});

test('switches between community and personal catalogs and opens a community lesson directly', async () => {
  const community = {
    ...job,
    id: 'community-job',
    title: 'Community video',
    is_mine: false,
  };
  jest.mocked(shadowingService.list).mockImplementation(async scope => ({
    items: scope === 'mine' ? [] : [community],
  }));
  await render();
  expect(shadowingService.list).toHaveBeenLastCalledWith('all');
  expect(visibleText()).toContain('Community video');
  await press('Video của tôi');
  expect(shadowingService.list).toHaveBeenLastCalledWith('mine');
  expect(visibleText()).not.toContain('Community video');
  expect(visibleText()).toContain('Bạn chưa thêm video nào');
  await press('Tất cả video');
  await press('Luyện shadowing');
  expect(shadowingService.lesson).toHaveBeenCalledWith('community-job');
  expect(shadowingService.submit).not.toHaveBeenCalled();
});

test('loads the next catalog page without duplicate cards', async () => {
  const next = { ...job, id: 'second-job', title: 'Second video' };
  jest
    .mocked(shadowingService.list)
    .mockImplementation(async (_scope, cursor) =>
      cursor
        ? { items: [job, next], next_cursor: null }
        : { items: [job], next_cursor: 'next-page' },
    );
  await render();
  await act(async () => tree.root.findByType(FlatList).props.onEndReached());
  expect(shadowingService.list).toHaveBeenCalledWith('all', 'next-page');
  expect(
    tree.root
      .findByType(FlatList)
      .props.data.map((item: ShadowingJob) => item.id),
  ).toEqual(['job-1', 'second-job']);
});

test('an old community response cannot replace the personal catalog after switching scope', async () => {
  let finishCommunity!: (value: { items: ShadowingJob[] }) => void;
  const own = { ...job, id: 'own-job', title: 'My own video', is_mine: true };
  jest.mocked(shadowingService.list).mockImplementation(scope =>
    scope === 'mine'
      ? Promise.resolve({ items: [own] })
      : new Promise(resolve => {
          finishCommunity = resolve;
        }),
  );
  await render();
  await press('Video của tôi');
  await act(async () =>
    finishCommunity({ items: [{ ...job, title: 'Old community response' }] }),
  );
  expect(visibleText()).toContain('My own video');
  expect(visibleText()).not.toContain('Old community response');
});

test('foreground polling does not discard a pending next-page request', async () => {
  jest.useFakeTimers();
  let finishPage!: (value: {
    items: ShadowingJob[];
    next_cursor: null;
  }) => void;
  jest.mocked(shadowingService.list).mockImplementation((_scope, cursor) =>
    cursor
      ? new Promise(resolve => {
          finishPage = resolve;
        })
      : Promise.resolve({
          items: [{ ...job, status: 'queued' }],
          next_cursor: 'page-2',
        }),
  );
  await render();
  await act(async () => {
    tree.root.findByType(FlatList).props.onEndReached();
  });
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  await act(async () =>
    finishPage({ items: [{ ...job, id: 'page-2-job' }], next_cursor: null }),
  );
  expect(
    tree.root
      .findByType(FlatList)
      .props.data.map((item: ShadowingJob) => item.id),
  ).toEqual(['job-1', 'page-2-job']);
  expect(visibleText()).not.toContain('Đang tải thêm video…');
});

test('tapping a subtitle word opens local lookup, pauses without seeking, and closing leaves playback paused', async () => {
  const original = await shadowingService.lesson('job-1');
  jest.mocked(shadowingService.lesson).mockResolvedValue({
    ...original,
    tokens: {
      segments: {
        one: [{ text: '日本語', key: 'japanese' }, { text: 'です。' }],
      },
      captions: {
        one: [{ text: '日本語', key: 'japanese' }, { text: 'です。' }],
      },
    },
    words: {
      japanese: {
        surface: '日本語',
        lemma: '日本語',
        reading: 'にほんご',
        pos: '名詞',
        entries: [
          {
            id: 'word-1',
            word: '日本語',
            reading: 'にほんご',
            meaning_vi: 'tiếng Nhật',
            level: 'N5',
          },
        ],
      },
    },
  });
  await render();
  await press('Luyện shadowing');
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  const source = webview.props.source;
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
    }),
  );
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: 0, clipId: 'one' },
        }),
      },
    }),
  );
  injectJavaScript.mockClear();
  const request = tree.root.findByType(VideoExamplePlayer).props.seekRequest;
  await act(async () =>
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === 'Tra từ 日本語' &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress({
        stopPropagation: jest.fn(),
        nativeEvent: { pageY: 220 },
      }),
  );
  expect(visibleText()).toContain('tiếng Nhật');
  expect(visibleText()).toContain('【にほんご】');
  expect(injectJavaScript).toHaveBeenCalledWith(
    'window.player && window.player.pauseVideo();true;',
  );
  expect(tree.root.findByType(VideoExamplePlayer).props.seekRequest).toBe(
    request,
  );
  expect(webview.props.source).toBe(source);
  const calls = injectJavaScript.mock.calls.length;
  await press('Đóng popup từ vựng');
  expect(tree.root.findByType(VideoExamplePlayer).props.pausedForLookup).toBe(
    false,
  );
  expect(injectJavaScript.mock.calls.length).toBe(calls);
  expect(visibleText()).not.toContain('tiếng Nhật');
  expect(shadowingService.lesson).toHaveBeenCalledTimes(2); // fixture read + opening; no lookup request on tap.
});

test('unknown words show a clear missing-meaning state without replaying the sentence', async () => {
  const original = await shadowingService.lesson('job-1');
  jest.mocked(shadowingService.lesson).mockResolvedValue({
    ...original,
    tokens: {
      segments: {
        one: [{ text: '日本語', key: 'unknown' }, { text: 'です。' }],
      },
      captions: {},
    },
    words: {
      unknown: {
        surface: '日本語',
        lemma: '日本語',
        reading: 'にほんご',
        pos: '名詞',
        entries: [],
      },
    },
  });
  await render();
  await press('Luyện shadowing');
  const wordActions = () =>
    tree.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Tra từ 日本語' &&
        typeof node.props.onPress === 'function',
    );
  expect(wordActions()).toHaveLength(0); // Lower subtitle rows are read-only.
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'caption',
          code: { index: 0, clipId: 'one' },
        }),
      },
    }),
  );
  expect(wordActions()).toHaveLength(1); // Only the large current caption is interactive.
  const request = tree.root.findByType(VideoExamplePlayer).props.seekRequest;
  await act(async () =>
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === 'Tra từ 日本語' &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress({
        stopPropagation: jest.fn(),
        nativeEvent: { pageY: 300 },
      }),
  );
  expect(visibleText()).toContain('Chưa có nghĩa tiếng Việt');
  expect(tree.root.findByType(VideoExamplePlayer).props.seekRequest).toBe(
    request,
  );
  await press('Đóng popup từ vựng');
  await press('Luyện đoạn 1');
  expect(tree.root.findByType(VideoExamplePlayer).props.seekRequest).toBe(
    request + 1,
  );
});

test('translation is loaded on demand, maps practice sentences and keeps the player mounted', async () => {
  jest.mocked(shadowingService.translation).mockResolvedValue({
    status: 'ready',
    language: 'vi',
    items: { one: 'Đây là tiếng Nhật.', two: 'Câu tiếp theo.' },
    completed: 2,
    total: 2,
    error_message: null,
  });
  await render();
  await press('Luyện shadowing');
  const player = tree.root.findByType(VideoExamplePlayer);
  const source = tree.root.findByProps({ testID: 'youtube-example-player' })
    .props.source;
  expect(shadowingService.translation).not.toHaveBeenCalled();
  await press('Bản dịch');
  expect(visibleText()).toContain('Đây là tiếng Nhật.');
  expect(shadowingService.requestTranslation).not.toHaveBeenCalled();
  await press('Luyện đoạn 1');
  const translated = tree.root
    .findAllByType(Text)
    .filter(node => node.props.children === 'Đây là tiếng Nhật.');
  expect(translated).toHaveLength(2); // Main caption and practice list.
  expect(tree.root.findByType(VideoExamplePlayer)).toBe(player);
  expect(
    tree.root.findByProps({ testID: 'youtube-example-player' }).props.source,
  ).toBe(source);
  await press('Bản dịch');
  expect(visibleText()).not.toContain('Đây là tiếng Nhật.');
});

test('missing translation creates one job then polls for partial results', async () => {
  jest.useFakeTimers();
  jest
    .mocked(shadowingService.translation)
    .mockResolvedValueOnce({
      status: 'not_requested',
      language: 'vi',
      items: {},
      completed: 0,
      total: 2,
      error_message: null,
    })
    .mockResolvedValue({
      status: 'ready',
      language: 'vi',
      items: { one: 'Đây là tiếng Nhật.' },
      completed: 2,
      total: 2,
      error_message: null,
    });
  jest.mocked(shadowingService.requestTranslation).mockResolvedValue({
    status: 'queued',
    language: 'vi',
    items: {},
    completed: 0,
    total: 2,
    error_message: null,
  });
  await render();
  await press('Luyện shadowing');
  await press('Bản dịch');
  expect(shadowingService.requestTranslation).toHaveBeenCalledTimes(1);
  expect(visibleText()).toContain('Đang chuẩn bị bản dịch');
  await act(async () => jest.advanceTimersByTime(3000));
  expect(visibleText()).toContain('Đây là tiếng Nhật.');
  await press('Bản dịch');
  const calls = jest.mocked(shadowingService.translation).mock.calls.length;
  await act(async () => jest.advanceTimersByTime(6000));
  expect(shadowingService.translation).toHaveBeenCalledTimes(calls);
});

test('failed translation offers retry without resetting video playback', async () => {
  jest.useFakeTimers();
  jest.mocked(shadowingService.translation).mockResolvedValue({
    status: 'failed',
    language: 'vi',
    items: {},
    completed: 0,
    total: 2,
    error_message: 'Gemini đang giới hạn lượt dịch.',
  });
  jest.mocked(shadowingService.requestTranslation).mockResolvedValue({
    status: 'queued',
    language: 'vi',
    items: {},
    completed: 0,
    total: 2,
    error_message: null,
  });
  await render();
  await press('Luyện shadowing');
  const request = tree.root.findByType(VideoExamplePlayer).props.seekRequest;
  await press('Bản dịch');
  expect(visibleText()).toContain('Gemini đang giới hạn lượt dịch.');
  expect(shadowingService.requestTranslation).not.toHaveBeenCalled();
  await press('Thử lại bản dịch');
  expect(shadowingService.requestTranslation).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType(VideoExamplePlayer).props.seekRequest).toBe(
    request,
  );
});

test('quiz is opt-in, hides future questions, grades once, and continues without replacing the player', async () => {
  await render();
  await press('Luyện shadowing');
  expect(shadowingService.questions).not.toHaveBeenCalled();
  const source = tree.root.findByProps({ testID: 'youtube-example-player' })
    .props.source;
  await press('Câu hỏi AI');
  expect(shadowingService.questions).not.toHaveBeenCalled();
  expect(tree.root.findByType(VideoExamplePlayer).props.pausedForQuiz).toBe(
    true,
  );
  await press('2 câu hỏi');
  await press('Tạo câu hỏi');
  expect(shadowingService.questions).toHaveBeenCalledWith('job-1', 2, 'N3');
  expect(visibleText()).not.toContain('話している人は何語を使っていますか。');
  expect(visibleText()).not.toContain('その後、話している人は何をしますか。');
  expect(tree.root.findByType(VideoExamplePlayer).props.continuous).toBe(true);
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'quiz-question', code: { id: 'q1' } }),
      },
    }),
  );
  expect(visibleText()).toContain('話している人は何語を使っていますか。');
  expect(visibleText()).not.toContain(
    'Người nói giới thiệu đây là tiếng Nhật.',
  );
  const next = tree.root
    .findAllByType(AuthButton)
    .find(node => node.props.label === 'Xem tiếp')!;
  expect(next.props.disabled).toBe(true);
  await press('Đáp án A: 日本語');
  expect(visibleText()).toContain('Chính xác!');
  expect(visibleText()).toContain('Người nói giới thiệu đây là tiếng Nhật.');
  await press('Đáp án B: ベトナム語');
  expect(visibleText()).toContain('Đã đúng 1/1 câu');
  await press('Xem tiếp');
  expect(
    tree.root.findByType(VideoExamplePlayer).props.quizCheckpoints,
  ).toEqual([{ id: 'q2', seconds: 6 }]);
  expect(tree.root.findByType(VideoExamplePlayer).props.pausedForQuiz).toBe(
    false,
  );
  expect(
    tree.root.findByProps({ testID: 'youtube-example-player' }).props.source,
  ).toBe(source);
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'quiz-question', code: { id: 'q2' } }),
      },
    }),
  );
  await press('Đáp án A: 終わります');
  expect(visibleText()).toContain('Chưa đúng.');
  expect(visibleText()).toContain('Đáp án đúng: B. 次の文を言います');
  await press('Xem tiếp');
  expect(
    tree.root.findByType(VideoExamplePlayer).props.quizCheckpoints,
  ).toEqual([]);
  await press('Danh sách video');
  await press('Luyện shadowing');
  expect(
    tree.root.findByType(VideoExamplePlayer).props.quizCheckpoints,
  ).toEqual([]);
  expect(shadowingService.questions).toHaveBeenCalledTimes(1);
});

test('quiz generation can be retried after failure and turned off during a question', async () => {
  jest
    .mocked(shadowingService.questions)
    .mockRejectedValueOnce(new Error('AI tạm thời gián đoạn.'));
  await render();
  await press('Luyện shadowing');
  await press('Câu hỏi AI');
  await press('Tạo câu hỏi');
  expect(visibleText()).toContain('AI tạm thời gián đoạn.');
  await press('Tạo câu hỏi');
  await act(async () =>
    tree.root.findByType(VideoExamplePlayer).props.onQuizQuestion('q1'),
  );
  await press('Đóng câu hỏi');
  expect(
    tree.root.findByType(VideoExamplePlayer).props.quizCheckpoints,
  ).toEqual([]);
  expect(tree.root.findByType(VideoExamplePlayer).props.pausedForQuiz).toBe(
    false,
  );
});

test.each(['cancel', 'leave'] as const)(
  'ignores a late quiz response after %s',
  async action => {
    let finish!: (
      value: Awaited<ReturnType<typeof shadowingService.questions>>,
    ) => void;
    const result = await shadowingService.questions('job-1', 2);
    jest.mocked(shadowingService.questions).mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await render();
    await press('Luyện shadowing');
    await press('Câu hỏi AI');
    await act(async () => {
      tree.root
        .findAllByType(AuthButton)
        .find(node => node.props.label === 'Tạo câu hỏi')!
        .props.onPress();
    });
    if (action === 'cancel') await press('Đóng câu hỏi AI');
    else {
      await press('Danh sách video');
      await press('Luyện shadowing');
    }
    await act(async () => finish(result));
    expect(
      tree.root.findByType(VideoExamplePlayer).props.quizCheckpoints,
    ).toEqual([]);
    expect(tree.root.findByType(VideoExamplePlayer).props.pausedForQuiz).toBe(
      false,
    );
  },
);

test('quiz lists stop times and jumps to the selected question without generating again or revealing it before seeking', async () => {
  await render();
  await press('Luyện shadowing');
  await press('Câu hỏi AI');
  await press('2 câu hỏi');
  await press('Tạo câu hỏi');
  const webview = tree.root.findByProps({ testID: 'youtube-example-player' });
  const source = webview.props.source;
  await act(async () =>
    webview.props.onMessage({ nativeEvent: { data: '{"type":"ready"}' } }),
  );
  await press('Câu hỏi AI');
  expect(visibleText()).toContain('Câu 1 · 0:03');
  expect(visibleText()).toContain('Câu 2 · 0:06');
  expect(visibleText()).not.toContain('その後、話している人は何をしますか。');
  await press('Tới câu hỏi 2');
  expect(
    injectJavaScript.mock.calls.some(([script]) =>
      script.includes('window.jumpToQuiz("q2")'),
    ),
  ).toBe(true);
  expect(visibleText()).not.toContain('その後、話している人は何をしますか。');
  await act(async () =>
    webview.props.onMessage({
      nativeEvent: { data: '{"type":"quiz-question","code":{"id":"q2"}}' },
    }),
  );
  expect(visibleText()).toContain('Câu 2/2');
  expect(visibleText()).toContain('その後、話している人は何をしますか。');
  expect(tree.root.findByType(VideoExamplePlayer).props.pausedForQuiz).toBe(
    true,
  );
  expect(
    tree.root.findByProps({ testID: 'youtube-example-player' }).props.source,
  ).toBe(source);
  await press('Đáp án B: 次の文を言います');
  await press('Xem tiếp');
  await press('Câu hỏi AI');
  const completed = tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'Xem lại câu hỏi 2' &&
      typeof node.props.onPress === 'function',
  )[0];
  expect(completed.props.accessibilityState.disabled).toBe(false);
  await press('Tới câu hỏi 1');
  expect(
    injectJavaScript.mock.calls.some(([script]) =>
      script.includes('window.jumpToQuiz("q1")'),
    ),
  ).toBe(true);
  expect(shadowingService.questions).toHaveBeenCalledTimes(1);
});

test('uses the selected JLPT level and retains answers for review until leaving the lesson', async () => {
  await render();
  await press('Luyện shadowing');
  await press('Câu hỏi AI');
  await press('Trình độ N5');
  await press('1 câu hỏi');
  await press('Tạo câu hỏi');
  expect(shadowingService.questions).toHaveBeenCalledWith('job-1', 1, 'N5');
  await act(async () =>
    tree.root.findByType(VideoExamplePlayer).props.onQuizQuestion('q1'),
  );
  await press('Đáp án A: 日本語');
  await press('Xem tiếp');
  expect(visibleText()).not.toContain('話している人は何語を使っていますか。');
  await press('Câu hỏi AI');
  await press('Xem lại câu hỏi 1');
  expect(visibleText()).toContain('話している人は何語を使っていますか。');
  expect(visibleText()).toContain('Bạn chọn: A. 日本語');
  await press('Xem lại câu 1');
  expect(visibleText()).toContain('Chính xác!');
  await press('Đáp án B: ベトナム語');
  expect(visibleText()).toContain('Đã đúng 1/1 câu');
  await press('Xem tiếp');
  await press('Câu hỏi AI');
  await press('Đóng câu hỏi AI');
  expect(visibleText()).not.toContain('話している人は何語を使っていますか。');
  expect(
    tree.root.findByType(VideoExamplePlayer).props.quizCheckpoints,
  ).toEqual([{ id: 'q2', seconds: 6 }]);
  await press('Danh sách video');
  await press('Luyện shadowing');
  expect(visibleText()).not.toContain('話している人は何語を使っていますか。');
  expect(visibleText()).not.toContain('Câu hỏi đã trả lời');
  expect(shadowingService.questions).toHaveBeenCalledTimes(1);
});

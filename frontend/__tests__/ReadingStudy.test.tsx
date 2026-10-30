import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { ReadingAnswerExplanation } from '../src/components/ReadingAnswerExplanation';
import {
  ReadingWorkspace,
  sliceReadingTokens,
} from '../src/components/ReadingWorkspace';
import { readingTips } from '../src/components/ReadingTips';
import {
  ReadingAnalysis,
  ReadingExplanation,
  ReadingPassage,
  readingService,
} from '../src/services/readingService';

jest.mock('../src/services/readingService', () => ({
  readingService: {
    analyze: jest.fn(),
    analyzeSentence: jest.fn(),
    explain: jest.fn(),
    submit: jest.fn(),
  },
}));
jest.mock('../src/services/dictionaryService', () => ({
  dictionaryService: { words: jest.fn().mockResolvedValue({ items: [] }) },
}));
const location = {
  sentence_id: 's1',
  paragraph_id: '0',
  quote: '学校',
  start: 0,
  end: 2,
};
const detail = {
  sentence_id: 's1',
  original: '学校です。',
  main_idea: 'Đó là trường học.',
  core_text: '学校です。',
  core_translation_vi: 'Đó là trường học.',
  segments: [
    {
      id: 's1-p1',
      text: '学校',
      role: 'object' as const,
      is_core: true,
      explanation: 'Danh từ chính.',
      location,
    },
    {
      id: 's1-p2',
      text: 'です。',
      role: 'predicate' as const,
      is_core: true,
      explanation: 'Vị ngữ.',
      location: { ...location, quote: 'です。', start: 2, end: 5 },
    },
  ],
  translation_vi: 'Đó là trường học.',
  core: { subject: 'それ (ẩn)', predicate: 'です', object: '学校' },
  layers: [{ text: '学校です。', meaning: 'Đó là trường học.' }],
  parts: [{ role: 'Vị ngữ', explanation: 'Kết thúc câu.', location }],
  caution: '',
};
const analysis: ReadingAnalysis = {
  summary: 'Bài viết nói về trường học.',
  caution: '',
  structure: [],
  vocabulary: [
    { word: '学校', reading: 'がっこう', meaning: 'Trường học', location },
  ],
  grammar: [
    {
      pattern: 'です',
      explanation: 'Cách nói lịch sự.',
      location: { ...location, quote: 'です', start: 2, end: 4 },
    },
  ],
  sentences: [detail],
};
const explanation: ReadingExplanation = {
  question_id: 'q1',
  correct_index: 0,
  explanation: 'Câu đầu nhắc đến trường học.',
  answer_supported: true,
  caution: '',
  evidence: [location],
};
const passage: ReadingPassage = {
  id: 'p1',
  title: 'Trường học',
  level: 'N5',
  kind: 'short',
  kind_label: 'Đoạn ngắn',
  exercise: 1,
  paragraph: 1,
  excerpt: '学校です。',
  character_count: 5,
  source_url: 'https://example.com/reading',
  text: '学校です。',
  paragraphs: [
    {
      id: '0',
      text: '学校です。',
      tokens: [{ text: '学校', key: 'w1' }, { text: 'です。' }],
    },
  ],
  sentences: [
    { id: 's1', paragraph_id: '0', text: '学校です。', start: 0, end: 5 },
  ],
  words: {
    w1: { surface: '学校', lemma: '学校', reading: 'がっこう', pos: '名詞' },
  },
  quiz: { version: 'v1', questions: [], last_attempt: null },
};
let tree: Renderer.ReactTestRenderer;
const focus = jest.fn(),
  scroll = jest.fn();
function control(label: string, role = 'button') {
  return tree.root.findAll(
    n =>
      n.props.accessibilityLabel === label &&
      n.props.accessibilityRole === role &&
      typeof n.props.onPress === 'function',
  )[0];
}
async function press(label: string, role = 'button') {
  await act(async () =>
    control(label, role).props.onPress({
      stopPropagation: jest.fn(),
      nativeEvent: { pageY: 0 },
    }),
  );
}
function text() {
  return tree.root
    .findAllByType(Text)
    .map(n => n.props.children)
    .flat()
    .join(' ');
}
async function workspace(data = passage) {
  await act(async () => {
    tree = Renderer.create(
      <ReadingWorkspace
        passage={data}
        accountId="u1"
        showFurigana
        split={false}
        onWordPress={focus}
        onScrollTo={scroll}
      />,
    );
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(readingService.analyze).mockResolvedValue(analysis);
  jest.mocked(readingService.analyzeSentence).mockResolvedValue(detail);
  jest.mocked(readingService.explain).mockResolvedValue(explanation);
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

test('tips are fixed, contextual and limited to three points; token slices preserve exact text', () => {
  const tips = readingTips('しかし、（ ア ）というのは何ですか。');
  expect(tips).toHaveLength(3);
  expect(tips[0]).toContain('ô trống');
  expect(readingService.analyze).not.toHaveBeenCalled();
  expect(
    sliceReadingTokens(
      [{ text: '😀 ' }, { text: '学校です', key: 'w1' }],
      3,
      5,
    ),
  ).toEqual([{ text: '学校', key: 'w1' }]);
});
test('sentence hover highlights without calling AI; analysis sections expand and focus exact source', async () => {
  await workspace();
  expect(readingService.analyze).not.toHaveBeenCalled();
  expect(control('Chế độ nguyên bản', 'tab')).toBeUndefined();
  expect(control('Chế độ phân tích', 'tab')).toBeUndefined();
  const sentence = () => control('Xem cấu trúc câu 1');
  const backgrounds = () =>
    tree.root
      .findAll(
        n =>
          n.props.style && StyleSheet.flatten(n.props.style)?.backgroundColor,
      )
      .map(n => StyleSheet.flatten(n.props.style).backgroundColor);
  const initial = backgrounds();
  await act(async () => sentence().props.onHoverIn());
  expect(backgrounds()).not.toEqual(initial);
  expect(readingService.analyzeSentence).not.toHaveBeenCalled();
  await act(async () => sentence().props.onHoverOut());
  expect(backgrounds()).toEqual(initial);
  await press('Tips đọc hiểu', 'tab');
  expect(text()).toContain(
    'Nắm ý chính cả đoạn trước khi tra từng từ; đối chiếu câu hỏi với câu có bằng chứng.',
  );
  expect(readingService.analyze).not.toHaveBeenCalled();
  await press('Phân tích bài đọc', 'tab');
  await press('Phân tích bài đọc');
  expect(readingService.analyze).toHaveBeenCalledTimes(1);
  expect(text()).toContain(analysis.summary);
  await press('Từ vựng quan trọng (1)');
  await press('Phân tích 学校');
  expect(
    tree.root.findAllByProps({ testID: 'reading-sentence-s1' }).length,
  ).toBeGreaterThan(0);
  expect(text()).toContain('Trường học');
  await press('Ngữ pháp quan trọng (1)');
  await press('Phân tích です');
  expect(text()).toContain('Cách nói lịch sự.');
  expect(control('Tra từ 学校')).toBeDefined();
});
test('sentence click requests details once and cached full analysis supplies sentence details without AI', async () => {
  await workspace();
  await press('Xem cấu trúc câu 1');
  expect(readingService.analyzeSentence).toHaveBeenCalledWith('p1', 's1');
  expect(text()).toContain(detail.main_idea);
  await press('Xem cấu trúc câu 1');
  expect(readingService.analyzeSentence).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
  await workspace({ ...passage, study_analysis: analysis });
  await press('Xem cấu trúc câu 1');
  expect(readingService.analyzeSentence).toHaveBeenCalledTimes(1);
});
test('analysis request failures are visible and retryable', async () => {
  jest
    .mocked(readingService.analyze)
    .mockRejectedValueOnce(new Error('Gemini tạm lỗi'));
  await workspace();
  await press('Phân tích bài đọc');
  expect(text()).toContain('Gemini tạm lỗi');
  await press('Thử lại phân tích');
  expect(text()).toContain(analysis.summary);
});
test('explanation loads on demand, focuses evidence and folds without another request', async () => {
  await act(async () => {
    tree = Renderer.create(
      <ReadingAnswerExplanation
        passageId="p1"
        questionId="q1"
        attemptId="a1"
        onFocus={focus}
      />,
    );
  });
  expect(readingService.explain).not.toHaveBeenCalled();
  await press('Giải thích đáp án');
  expect(readingService.explain).toHaveBeenCalledWith('p1', 'q1', 'a1');
  expect(text()).toContain(explanation.explanation);
  await press('Xem trong bài: 学校');
  expect(focus).toHaveBeenCalledWith(location);
  await press('Thu gọn giải thích');
  await press('Giải thích đáp án');
  expect(readingService.explain).toHaveBeenCalledTimes(1);
});
test('explanation handles errors without claiming success', async () => {
  jest
    .mocked(readingService.explain)
    .mockRejectedValueOnce(new Error('Không khớp bằng chứng'));
  await act(async () => {
    tree = Renderer.create(
      <ReadingAnswerExplanation
        passageId="p1"
        questionId="q1"
        attemptId="a1"
        onFocus={focus}
      />,
    );
  });
  await press('Giải thích đáp án');
  expect(text()).toContain('Không khớp bằng chứng');
  expect(text()).not.toContain(explanation.explanation);
  await press('Thử lại giải thích');
  expect(text()).toContain(explanation.explanation);
});

test('multiple sentences stay in their original paragraph with unchanged source text', async () => {
  const original = '学校です。 今日は休みです。';
  await workspace({
    ...passage,
    text: original,
    paragraphs: [
      {
        ...passage.paragraphs[0],
        text: original,
        tokens: [
          ...passage.paragraphs[0].tokens,
          { text: ' ' },
          { text: '今日は休みです。' },
        ],
      },
    ],
    sentences: [
      ...passage.sentences!,
      {
        id: 's2',
        paragraph_id: '0',
        text: '今日は休みです。',
        start: 6,
        end: original.length,
      },
    ],
  });
  const paragraphs = tree.root.findAll(
    n => n.props.text === original && Boolean(n.props.tokens),
  );
  expect(paragraphs).toHaveLength(1);
  expect(paragraphs[0].props.text).toBe(original);
  expect(
    paragraphs[0].props.tokens
      .map((token: { text: string }) => token.text)
      .join(''),
  ).toBe(original);
  await press('Xem cấu trúc câu 2');
  expect(readingService.analyzeSentence).toHaveBeenCalledWith('p1', 's2');
});

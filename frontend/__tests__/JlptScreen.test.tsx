import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { JlptScreen } from '../src/screens/JlptScreen';
import { jlptService, Exam } from '../src/services/jlptService';
import { WebLayoutContext } from '../src/hooks/useWebLayout';
import * as Keychain from 'react-native-keychain';
import { dictionaryService } from '../src/services/dictionaryService';
jest.mock('../src/services/jlptService', () => ({
  jlptService: {
    list: jest.fn(),
    exam: jest.fn(),
    grade: jest.fn(),
    review: jest.fn(),
    explain: jest.fn(),
  },
}));
jest.mock('../src/services/dictionaryService', () => ({
  dictionaryService: {
    words: jest.fn().mockResolvedValue({
      items: [],
      pagination: { page: 1, total: 0, total_pages: 0 },
    }),
  },
}));
const exam: Exam = {
  id: 'n3-test',
  title: 'JLPT N3 · Tháng 7/2017',
  level: 'N3',
  year: 2017,
  month: 7,
  version: 1,
  total: 2,
  audio_url: null,
  content_note: 'Source text',
  source_filename: 'source.pdf',
  sections: [
    {
      id: 'vocabulary',
      label: 'Từ vựng',
      original_label: '文字・語彙',
      questions: [
        {
          id: 'v-1',
          number: 1,
          group: 1,
          prompt: '汚い',
          target: '汚い',
          instruction: '選んでください',
          options: ['せまい', 'きたない'],
          passage: null,
          images: [],
        },
      ],
    },
    {
      id: 'listening',
      label: 'Nghe hiểu',
      original_label: '聴解',
      questions: [
        {
          id: 'l-1',
          number: 1,
          group: 1,
          prompt: '1ばん',
          instruction: '聞いてください',
          options: ['1', '2', '3'],
          passage: null,
          images: [],
        },
      ],
    },
  ],
};
let tree: Renderer.ReactTestRenderer;
let account = 0;
const button = (label: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
beforeEach(() => {
  jest.clearAllMocks();
  account++;
  jest.mocked(jlptService.list).mockResolvedValue({
    items: [
      {
        ...exam,
        sections: exam.sections.map(s => ({
          ...s,
          total: s.questions.length,
        })),
      },
    ],
  });
  jest.mocked(jlptService.exam).mockResolvedValue(exam);
  jest.mocked(jlptService.grade).mockResolvedValue({
    total: 2,
    correct: 1,
    answered: 1,
    note: 'Không quy đổi điểm JLPT',
    sections: [
      { id: 'vocabulary', label: 'Từ vựng', total: 1, correct: 1, answered: 1 },
      {
        id: 'listening',
        label: 'Nghe hiểu',
        total: 1,
        correct: 0,
        answered: 0,
      },
    ],
    results: {
      'v-1': { selected_index: 1, correct_index: 1, status: 'correct' },
      'l-1': { selected_index: null, correct_index: 2, status: 'unanswered' },
    },
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
async function open(learner = `learner-${account}`, contentWidth = 1200) {
  await act(async () => {
    tree = Renderer.create(
      <WebLayoutContext.Provider
        value={{ desktop: contentWidth >= 980, contentWidth }}
      >
        <JlptScreen accountId={learner} />
      </WebLayoutContext.Provider>,
    );
  });
  await act(async () =>
    (
      button('Tiếp tục') ??
      button('Xem kết quả') ??
      button('Mở đề thi')
    ).props.onPress(),
  );
}

test('small screens open the question map on demand and return to the chosen question', async () => {
  await open(`mobile-${account}`, 390);
  expect(button('Nghe hiểu, 問題1, 1番, chưa trả lời')).toBeUndefined();
  await act(async () => button('Bảng câu hỏi · 0/2').props.onPress());
  await act(async () =>
    button('Nghe hiểu, 問題1, 1番, chưa trả lời').props.onPress(),
  );
  expect(button('Đáp án 3')).toBeDefined();
  expect(button('Nghe hiểu, 問題1, 1番, chưa trả lời')).toBeUndefined();
});

test('lists two original sessions and keeps their drafts separate when switching exams', async () => {
  const second = {
    ...exam,
    id: 'n3-other-session',
    title: 'JLPT N3 · Tháng 12/2016',
    year: 2016,
    month: 12,
  };
  jest.mocked(jlptService.list).mockResolvedValue({
    items: [exam, second].map(e => ({
      ...e,
      sections: e.sections.map(s => ({ ...s, total: s.questions.length })),
    })),
  });
  jest
    .mocked(jlptService.exam)
    .mockImplementation(async id => (id === second.id ? second : exam));
  await open(`two-sessions-${account}`);
  await act(async () => button('Đáp án 2: きたない').props.onPress());
  await act(async () => button('Danh sách đề').props.onPress());
  const cards = tree.root.findAll(
    node =>
      ['Mở đề thi', 'Tiếp tục', 'Xem kết quả'].includes(
        node.props.accessibilityLabel,
      ) && typeof node.props.onPress === 'function',
  );
  expect(cards.filter(card => !card.props.disabled)).toHaveLength(2);
  expect(cards.filter(card => card.props.disabled)).toHaveLength(10);
  expect(JSON.stringify(tree.toJSON())).toContain('Đang làm dở');
  expect(JSON.stringify(tree.toJSON())).toContain('Lần làm gần nhất');
  await act(async () => cards[1].props.onPress());
  expect(jlptService.exam).toHaveBeenLastCalledWith(second.id);
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    false,
  );
  await act(async () => button('Danh sách đề').props.onPress());
  await act(async () => button('Tiếp tục').props.onPress());
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    true,
  );
});

test('question map jumps to the correct section even when question numbers repeat', async () => {
  await open();
  expect(JSON.stringify(tree.toJSON())).not.toContain('✓ Đúng');
  await act(async () => button('Đáp án 2: きたない').props.onPress());
  await act(async () =>
    button('Nghe hiểu, 問題1, 1番, chưa trả lời').props.onPress(),
  );
  expect(button('Đáp án 3')).toBeDefined();
  await act(async () =>
    button('Từ vựng, 問題1, 1番, đã trả lời').props.onPress(),
  );
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    true,
  );
  expect(jlptService.grade).not.toHaveBeenCalled();
});

test('submits unanswered items explicitly and supports review and starting again', async () => {
  await open();
  await act(async () => button('Đáp án 2: きたない').props.onPress());
  await act(async () => button('Đánh dấu xem lại').props.onPress());
  await act(async () => button('Nghe hiểu').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Chưa có tệp nghe');
  await act(async () => button('Từ vựng').props.onPress());
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    true,
  );
  expect(button('Bỏ đánh dấu câu này')).toBeDefined();
  await act(async () => button('Nộp bài').props.onPress());
  expect(jlptService.grade).not.toHaveBeenCalled();
  await act(async () => button('Xác nhận nộp bài').props.onPress());
  expect(jlptService.grade).toHaveBeenCalledWith(exam.id, 1, { 'v-1': 1 });
  expect(button('Đáp án 2: きたない').props.accessibilityRole).toBe('button');
  await act(async () => button('Danh sách đề').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Đã nộp');
  expect(JSON.stringify(tree.toJSON())).toContain('1/2 câu đúng');
  expect(button('Tiếp tục')).toBeUndefined();
  await act(async () => button('Xem kết quả').props.onPress());
  expect(button('Đáp án 2: きたない').props.accessibilityRole).toBe('button');
  await act(async () => button('Xem câu sai & bỏ trống').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Bạn chưa trả lời câu này. Đáp án đúng: 3.',
  );
  await act(async () => button('Làm lại đề').props.onPress());
  await act(async () => button('Bắt đầu lại').props.onPress());
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    false,
  );
});

test('retakes a submitted exam from its catalog card only after confirmation', async () => {
  await open(`retake-${account}`);
  await act(async () => button('Đáp án 2: きたない').props.onPress());
  await act(async () => button('Đánh dấu xem lại').props.onPress());
  await act(async () => button('Nộp bài').props.onPress());
  await act(async () => button('Xác nhận nộp bài').props.onPress());
  await act(async () => button('Danh sách đề').props.onPress());
  await act(async () => button('Làm lại đề').props.onPress());
  await act(async () => button('Giữ bài hiện tại').props.onPress());
  expect(button('Xem kết quả')).toBeDefined();
  expect(jlptService.exam).toHaveBeenCalledTimes(1);
  await act(async () => button('Làm lại đề').props.onPress());
  await act(async () => button('Bắt đầu lại').props.onPress());
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    false,
  );
  expect(button('Đáp án 2: きたない').props.disabled).toBe(false);
  expect(button('Đánh dấu xem lại')).toBeDefined();
  expect(button('Bỏ đánh dấu câu này')).toBeUndefined();
  expect(jlptService.grade).toHaveBeenCalledTimes(1);
  await act(async () => button('Danh sách đề').props.onPress());
  expect(button('Tiếp tục')).toBeDefined();
  expect(button('Xem kết quả')).toBeUndefined();
  await act(async () => button('Tiếp tục').props.onPress());
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    false,
  );
});

test('keeps answers after grading failure and restores only the same account draft', async () => {
  const learner = `saved-${account}`;
  await open(learner);
  await act(async () => button('Đáp án 2: きたない').props.onPress());
  jest
    .mocked(jlptService.grade)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await act(async () => button('Nộp bài').props.onPress());
  await act(async () => button('Xác nhận nộp bài').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Mất kết nối');
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    true,
  );
  await act(async () => button('Đánh dấu xem lại').props.onPress());
  await act(async () => button('Nghe hiểu').props.onPress());
  await act(async () => tree.unmount());
  await open(learner);
  expect(button('Đáp án 3')).toBeDefined();
  await act(async () => button('Từ vựng').props.onPress());
  expect(button('Bỏ đánh dấu câu này')).toBeDefined();
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    true,
  );
  await act(async () => tree.unmount());
  await open('another-' + learner);
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    false,
  );
});

test('reports a failed device save and lets the learner retry it', async () => {
  jest
    .mocked(Keychain.setGenericPassword)
    .mockRejectedValueOnce(new Error('Device store unavailable'));
  await open(`save-error-${account}`);
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Chưa lưu được trên thiết bị.',
  );
  await act(async () => button('Lưu lại bài làm').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('Đã lưu trên thiết bị này');
});

test('review enables word lookup and Momo explanations without changing the submitted answer', async () => {
  jest.mocked(jlptService.grade).mockResolvedValue({
    total: 2,
    answered: 1,
    correct: 1,
    note: '',
    sections: [],
    review_token: 'review-proof',
    results: {
      'v-1': { selected_index: 1, correct_index: 1, status: 'correct' },
      'l-1': { selected_index: null, correct_index: 2, status: 'unanswered' },
    },
  });
  jest.mocked(jlptService.review).mockResolvedValue({
    prompt_tokens: [{ text: '汚い', key: '1' }],
    paragraphs: [],
    words: {
      '1': {
        surface: '汚い',
        lemma: '汚い',
        reading: 'きたない',
        pos: '形容詞',
      },
    },
  });
  jest.mocked(jlptService.explain).mockResolvedValue({
    option_index: 0,
    correct_index: 1,
    explanation: 'せまい nghĩa là chật.',
    caution: '',
    grammar: [],
  });
  await open(`review-${account}`);
  expect(jlptService.review).not.toHaveBeenCalled();
  expect(jlptService.explain).not.toHaveBeenCalled();
  await act(async () => button('Đáp án 2: きたない').props.onPress());
  await act(async () => button('Nộp bài').props.onPress());
  await act(async () => button('Xác nhận nộp bài').props.onPress());
  expect(jlptService.review).toHaveBeenCalledWith(
    exam.id,
    'v-1',
    'review-proof',
  );
  expect(button('Tra từ 汚い')).toBeDefined();
  await act(async () =>
    button('Tra từ 汚い').props.onPress({
      stopPropagation: jest.fn(),
      nativeEvent: { pageY: 100 },
    }),
  );
  expect(dictionaryService.words).toHaveBeenCalledWith('汚い', 1);
  await act(async () => button('Đóng popup từ vựng').props.onPress());
  await act(async () => button('Đáp án 1: せまい').props.onPress());
  expect(jlptService.explain).toHaveBeenCalledWith(
    exam.id,
    'v-1',
    'review-proof',
    0,
  );
  expect(JSON.stringify(tree.toJSON())).toContain('せまい nghĩa là chật.');
  expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
    true,
  );
  await act(async () => button('Đóng giải thích Momo').props.onPress());
  await act(async () => button('Đáp án 1: せまい').props.onPress());
  expect(jlptService.explain).toHaveBeenCalledTimes(1);
});

test('timed mode locks finished sections and preserves its deadline when leaving and resuming', async () => {
  jest.useFakeTimers();
  try {
    const timedExam: Exam = {
      ...exam,
      total: 3,
      sections: [
        { ...exam.sections[0], duration_seconds: 1800 },
        {
          id: 'grammar-reading',
          label: 'Ngữ pháp & Đọc hiểu',
          original_label: '文法',
          duration_seconds: 4200,
          questions: [{ ...exam.sections[0].questions[0], id: 'gr-1' }],
        },
        { ...exam.sections[1], duration_seconds: 2400 },
      ],
    };
    jest.mocked(jlptService.exam).mockResolvedValue(timedExam);
    jest.mocked(jlptService.grade).mockResolvedValue({
      total: 3,
      answered: 2,
      correct: 1,
      sections: [],
      note: '',
      results: {
        'v-1': { selected_index: 1, correct_index: 1, status: 'correct' },
        'gr-1': { selected_index: 0, correct_index: 1, status: 'incorrect' },
        'l-1': { selected_index: null, correct_index: 2, status: 'unanswered' },
      },
    });
    await act(async () => {
      tree = Renderer.create(
        <WebLayoutContext.Provider
          value={{ desktop: true, contentWidth: 1200 }}
        >
          <JlptScreen accountId={`timed-${account}`} />
        </WebLayoutContext.Provider>,
      );
    });
    expect(button('Thi thử tính giờ')).toBeUndefined();
    await act(async () => button('Mở đề thi').props.onPress());
    await act(async () => button('Đáp án 2: きたない').props.onPress());
    await act(async () => button('Thi thử tính giờ').props.onPress());
    expect(jlptService.grade).not.toHaveBeenCalled();
    await act(async () => button('Tiếp tục luyện tự do').props.onPress());
    expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
      true,
    );
    expect(button('Nghe hiểu').props.disabled).toBe(false);
    await act(async () => button('Thi thử tính giờ').props.onPress());
    await act(async () => button('Bắt đầu tính giờ').props.onPress());
    expect(button('Đáp án 2: きたない').props.accessibilityState.checked).toBe(
      false,
    );
    expect(button('Nghe hiểu').props.disabled).toBe(true);
    await act(async () => button('Đáp án 2: きたない').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(1800 * 1000);
    });
    expect(button('Đáp án 1: せまい').props.disabled).toBe(true);
    await act(async () =>
      button('Bắt đầu Ngữ pháp & Đọc hiểu').props.onPress(),
    );
    expect(button('Từ vựng').props.disabled).toBe(true);
    await act(async () => button('Đáp án 1: せまい').props.onPress());
    await act(async () => button('Danh sách đề').props.onPress());
    jest.advanceTimersByTime(4200 * 1000);
    await act(async () => button('Tiếp tục').props.onPress());
    expect(button('Bắt đầu Nghe hiểu').props.disabled).toBe(true);
    await act(async () => button('Nộp bài phần đã làm').props.onPress());
    expect(jlptService.grade).toHaveBeenCalledWith(
      timedExam.id,
      timedExam.version,
      { 'v-1': 1, 'gr-1': 0 },
    );
  } finally {
    await act(async () => tree?.unmount());
    jest.useRealTimers();
  }
});

test('automatically submits when the final timed section expires', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(jlptService.exam).mockResolvedValue({
      ...exam,
      total: 1,
      sections: [{ ...exam.sections[0], duration_seconds: 1 }],
    });
    await act(async () => {
      tree = Renderer.create(
        <JlptScreen accountId={`auto-submit-${account}`} />,
      );
    });
    expect(button('Thi thử tính giờ')).toBeUndefined();
    await act(async () => button('Mở đề thi').props.onPress());
    await act(async () => button('Thi thử tính giờ').props.onPress());
    expect(jlptService.grade).not.toHaveBeenCalled();
    await act(async () => button('Bắt đầu tính giờ').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(jlptService.grade).toHaveBeenCalledTimes(1);
    expect(jlptService.grade).toHaveBeenCalledWith(exam.id, exam.version, {});
  } finally {
    await act(async () => tree?.unmount());
    jest.useRealTimers();
  }
});

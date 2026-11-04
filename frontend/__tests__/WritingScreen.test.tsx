import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { WebLayoutContext } from '../src/hooks/useWebLayout';
import { WritingScreen } from '../src/screens/WritingScreen';
import { writingService } from '../src/services/writingService';

jest.mock('../src/services/writingService', () => ({
  writingService: {
    prompts: jest.fn(),
    drafts: jest.fn(),
    submissions: jest.fn(),
    evaluateSubmission: jest.fn(),
    submitWriting: jest.fn(),
  },
}));

const submissions = [
  {
    id: 'submission-older',
    user_id: 'user-1',
    prompt_id: 'prompt-1',
    prompt_title: 'Bài viết tự do',
    text: 'Bài viết lần một.',
    corrected_text: 'Bài viết lần một đã sửa.',
    score: 72,
    feedback: 'Có thể cải thiện.',
    submitted_at: 1_728_000_000,
    submittedAt: 1_728_000_000,
  },
  {
    id: 'submission-newer',
    user_id: 'user-1',
    prompt_id: 'prompt-1',
    prompt_title: 'Bài viết tự do',
    text: 'Bài viết lần hai.',
    corrected_text: 'Bài viết lần hai đã sửa.',
    score: 86,
    feedback: 'Tiến bộ tốt.',
    submitted_at: 1_728_086_400,
    submittedAt: 1_728_086_400,
  },
];

let tree: Renderer.ReactTestRenderer;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(writingService.prompts).mockResolvedValue({ items: [] });
  jest.mocked(writingService.drafts).mockResolvedValue({ items: [] });
  jest
    .mocked(writingService.submissions)
    .mockResolvedValue({ items: submissions });
  jest
    .mocked(writingService.evaluateSubmission)
    .mockImplementation(async id => ({
      submission: {
        ...submissions.find(item => item.id === id)!,
        score: 84,
        corrected_text: 'Bản sửa do Gemini tạo.',
        feedback: 'Điểm làm tốt: Ý rõ ràng.\nCần cải thiện: Thêm ví dụ cụ thể.',
      },
    }));
});

afterEach(async () => {
  await act(async () => tree?.unmount());
});

async function render(desktop = false) {
  await act(async () => {
    tree = Renderer.create(
      <WebLayoutContext.Provider
        value={{ desktop, contentWidth: desktop ? 1200 : 390 }}
      >
        <WritingScreen />
      </WebLayoutContext.Provider>,
    );
  });
}

function button(label: string) {
  return tree.root.find(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
}

function visibleText() {
  return tree.root
    .findAllByType(Text)
    .map(node => String(node.props.children ?? ''))
    .join('\n');
}

test('selects two submissions from the list and opens their comparison', async () => {
  await render();
  await act(async () => button('Bài đã nộp').props.onPress());
  await act(async () => button('Chọn bài để so sánh').props.onPress());

  const checkboxes = () =>
    tree.root.findAll(
      node =>
        node.props.accessibilityRole === 'checkbox' &&
        typeof node.props.onPress === 'function',
    );
  await act(async () => checkboxes()[1].props.onPress());
  expect(button('So sánh 2 bài đã chọn').props.disabled).toBe(true);
  await act(async () => checkboxes()[0].props.onPress());
  expect(button('So sánh 2 bài đã chọn').props.disabled).toBe(false);

  await act(async () => button('So sánh 2 bài đã chọn').props.onPress());
  expect(visibleText()).toContain('Kết quả so sánh');
  expect(visibleText()).toContain('72');
  expect(visibleText()).toContain('86');
  expect(visibleText()).toContain('Chi tiết bài viết');
  expect(visibleText()).toContain('Bài viết lần hai');
  expect(visibleText()).toContain('Nhận xét AI từng lần');
  expect(visibleText()).toContain('Nộp ngày');
  expect(visibleText().indexOf('submission-older')).toBe(-1);
  const olderDate = new Date(
    submissions[0].submitted_at * 1000,
  ).toLocaleDateString('vi-VN');
  const newerDate = new Date(
    submissions[1].submitted_at * 1000,
  ).toLocaleDateString('vi-VN');
  expect(visibleText().indexOf(olderDate)).toBeLessThan(
    visibleText().indexOf(newerDate),
  );
});

test('reevaluates an existing submission and replaces its saved feedback', async () => {
  await render();
  await act(async () => button('Bài đã nộp').props.onPress());
  const olderDate = new Date(
    submissions[0].submitted_at * 1000,
  ).toLocaleDateString('vi-VN');
  await act(async () =>
    button(`Mở bài nộp Bài viết tự do ngày ${olderDate}`).props.onPress(),
  );
  await act(async () => button('Phân tích lại bằng AI').props.onPress());

  expect(writingService.evaluateSubmission).toHaveBeenCalledWith(
    'submission-older',
  );
  expect(visibleText()).toContain('Điểm làm tốt: Ý rõ ràng.');
  expect(visibleText()).not.toContain('Có thể cải thiện.');
});

test('keeps edits to an existing draft when typing in the desktop editor', async () => {
  const prompt = {
    id: 'prompt-1',
    title: '毎日の生活',
    level: 'N5',
    instruction: '日常について書いてください。',
    model_hint: '時間を使ってみましょう。',
    prompt_type: 'essay',
    sort_order: 1,
  };
  jest.mocked(writingService.prompts).mockResolvedValue({ items: [prompt] });
  jest
    .mocked(writingService.drafts)
    .mockResolvedValue({
      items: [
        {
          id: 'draft-1',
          user_id: 'user-1',
          prompt_id: prompt.id,
          prompt,
          text: '毎朝起きます。',
          word_count: 1,
          status: 'draft',
          created_at: 1,
          updated_at: 1,
        },
      ],
    });
  await render(true);
  await act(async () => button('Chọn bài tập viết').props.onPress());
  const promptButton = tree.root.find(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      node
        .findAllByType(Text)
        .some(text => text.props.children === prompt.title),
  );
  await act(async () => promptButton.props.onPress());
  expect(tree.root.findByType(TextInput).props.value).toBe('毎朝起きます。');
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('毎朝六時に起きます。'),
  );
  expect(tree.root.findByType(TextInput).props.value).toBe(
    '毎朝六時に起きます。',
  );
  expect(writingService.submitWriting).not.toHaveBeenCalled();
});

test('blocks duplicate submissions while grading and retains text after a failure', async () => {
  let fail: (reason: Error) => void = () => {};
  jest.mocked(writingService.submitWriting).mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  await render(true);
  await act(async () => button('Viết tự do').props.onPress());
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('日本語を勉強します。'),
  );
  const submit = button('Nộp bài').props.onPress;
  let request: Promise<void>;
  await act(async () => {
    request = submit();
    submit();
  });
  expect(writingService.submitWriting).toHaveBeenCalledTimes(1);
  expect(button('Đang chấm bài...').props.disabled).toBe(true);
  expect(tree.root.findByType(TextInput).props.editable).toBe(false);
  await act(async () => {
    fail(new Error('Thử lại sau.'));
    await request;
  });
  expect(tree.root.findByType(TextInput).props.value).toBe(
    '日本語を勉強します。',
  );
  expect(visibleText()).toContain('Thử lại sau.');
  expect(button('Nộp bài').props.disabled).toBe(false);
});

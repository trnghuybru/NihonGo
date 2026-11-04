import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import { WritingWorkspaceScreen } from '../src/screens/WritingWorkspaceScreen';
import { WebLayoutContext } from '../src/hooks/useWebLayout';
import {
  writingService,
  WritingDraft,
  WritingPrompt,
  WritingSubmissionApi,
} from '../src/services/writingService';

jest.mock('../src/services/writingService', () => ({
  writingService: {
    prompts: jest.fn(),
    drafts: jest.fn(),
    submissions: jest.fn(),
    saveDraft: jest.fn(),
    saveCustomDraft: jest.fn(),
    updateDraft: jest.fn(),
    deleteDraft: jest.fn(),
    submitWriting: jest.fn(),
    evaluateSubmission: jest.fn(),
  },
}));
const prompts: WritingPrompt[] = ['学校', 'かぞく'].map((title, index) => ({
  id: `p${index}`,
  title,
  level: 'N5',
  prompt_type: 'sentence',
  instruction: '３〜５文で書いてください。',
  model_hint: '短い文を書きましょう。',
  sort_order: index,
}));
const draft = (
  text: string,
  prompt: WritingPrompt | undefined = prompts[0],
): WritingDraft => ({
  id: 'd1',
  user_id: 'writer',
  prompt_id: prompt?.id ?? 'custom-1',
  prompt: prompt ?? null,
  text,
  word_count: 1,
  status: 'draft',
  created_at: 1,
  updated_at: 1,
});
const submission: WritingSubmissionApi = {
  id: 's1',
  user_id: 'writer',
  prompt_id: 'p0',
  prompt_title: '学校',
  text: '学校に行きます。',
  corrected_text: '学校に行きます。',
  score: 80,
  feedback: '保存したコメント',
  submitted_at: 1793690000,
};
const initialAppState = AppState.currentState;
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(writingService.prompts).mockResolvedValue({ items: prompts });
  jest.mocked(writingService.drafts).mockResolvedValue({ items: [] });
  jest.mocked(writingService.submissions).mockResolvedValue({ items: [] });
  jest
    .mocked(writingService.saveDraft)
    .mockImplementation(async (id, text) => ({
      draft: draft(
        text,
        prompts.find(p => p.id === id),
      ),
    }));
  jest
    .mocked(writingService.saveCustomDraft)
    .mockImplementation(async text => ({ draft: draft(text, undefined) }));
  jest
    .mocked(writingService.updateDraft)
    .mockImplementation(async (_id, text) => ({ draft: draft(text) }));
  jest
    .mocked(writingService.deleteDraft)
    .mockResolvedValue({ deleted: true, draft_id: 'd1' });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  AppState.currentState = initialAppState;
});
async function render(selectPrompt = true) {
  await act(async () => {
    tree = Renderer.create(
      <WebLayoutContext.Provider value={{ desktop: true, contentWidth: 1200 }}>
        <WritingWorkspaceScreen />
      </WebLayoutContext.Provider>,
    );
  });
  if (selectPrompt)
    await act(async () => control('Chọn đề 学校').props.onPress());
}
function control(label: string) {
  return tree.root.find(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
}
async function press(label: string) {
  if (label.startsWith('Chọn đề ') || label === 'Viết tự do') {
    await act(async () => control('Đổi đề').props.onPress());
  }
  if (label === 'Bài đã nộp' || label === 'Bản nháp') {
    await act(async () => control('Đổi đề').props.onPress());
  }
  await act(async () => {
    await control(label).props.onPress();
  });
}
async function type(text: string) {
  await act(async () =>
    tree.root
      .findByProps({ accessibilityLabel: 'Nội dung bài viết' })
      .props.onChangeText(text),
  );
}
function visible() {
  return tree.root
    .findAllByType(Text)
    .map(node => String(node.props.children ?? ''))
    .join('\n');
}

test('saves a paused edit after explicitly selecting a prompt without generating AI feedback', async () => {
  await render();
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('');
  await type('学校に行きます。');
  await act(async () => jest.advanceTimersByTimeAsync(1499));
  expect(writingService.saveDraft).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(writingService.saveDraft).toHaveBeenCalledWith(
    'p0',
    '学校に行きます。',
  );
  expect(visible()).toContain('Đã lưu nháp');
  expect(writingService.submitWriting).not.toHaveBeenCalled();
});

test('keeps edits on both topics when an earlier save completes after switching', async () => {
  let finish: (value: { draft: WritingDraft }) => void = () => {};
  jest.mocked(writingService.saveDraft).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await render();
  await type('学校で勉強します。');
  await act(async () => jest.advanceTimersByTimeAsync(1500));
  await press('Chọn đề かぞく');
  await type('かぞくは三人です。');
  await act(async () => finish({ draft: draft('学校で勉強します。') }));
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('かぞくは三人です。');
  await press('Chọn đề 学校');
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('学校で勉強します。');
});

test('updates a new custom draft instead of creating duplicates', async () => {
  await render();
  await press('Viết tự do');
  await type('日本語が好きです。');
  await act(async () => jest.advanceTimersByTimeAsync(1500));
  await type('日本語がとても好きです。');
  await act(async () => jest.advanceTimersByTimeAsync(1500));
  expect(writingService.saveCustomDraft).toHaveBeenCalledTimes(1);
  expect(writingService.updateDraft).toHaveBeenCalledWith(
    'd1',
    '日本語がとても好きです。',
  );
});

test('keeps the workspace during grading, shows its result in place and resumes the original text', async () => {
  let finish: (value: { submission: WritingSubmissionApi }) => void = () => {};
  jest.mocked(writingService.submitWriting).mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await render();
  await type(submission.text);
  const workspace = tree.root.findByProps({ testID: 'writing-workspace' });
  let pending: Promise<void>;
  await act(async () => {
    pending = control('Nộp bài').props.onPress();
  });
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe(submission.text);
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .editable,
  ).toBe(false);
  await act(async () => {
    finish({ submission });
    await pending;
  });
  expect(tree.root.findByProps({ testID: 'writing-workspace' })).toBe(
    workspace,
  );
  expect(visible()).toContain('保存したコメント');
  await press('Chỉnh sửa bài');
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe(submission.text);
  await press('Xem nhận xét đã có');
  expect(writingService.submitWriting).toHaveBeenCalledTimes(1);
});

test('retains the writing and saved draft when grading fails', async () => {
  jest
    .mocked(writingService.submitWriting)
    .mockRejectedValue(new Error('AI đang bận.'));
  await render();
  await type('学校で友だちに会います。');
  await press('Nộp bài');
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('学校で友だちに会います。');
  expect(visible()).toContain('AI đang bận.');
  expect(writingService.saveDraft).toHaveBeenCalledTimes(1);
  expect(writingService.submitWriting).toHaveBeenCalledTimes(1);
});

test('deletes the active saved draft and leaves a blank editor without recreating it', async () => {
  jest
    .mocked(writingService.drafts)
    .mockResolvedValue({ items: [draft('学校に行きます。')] });
  await render();
  await press('Bản nháp');
  await press('Xóa bản nháp 学校');
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('');
  await act(async () => jest.advanceTimersByTimeAsync(3000));
  expect(writingService.deleteDraft).toHaveBeenCalledWith('d1');
  expect(writingService.saveDraft).not.toHaveBeenCalled();
});

test('saves newer typing after the first response without resetting the editor', async () => {
  let finish: (value: { draft: WritingDraft }) => void = () => {};
  jest.mocked(writingService.saveDraft).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await render();
  await type('学校に行きます。');
  await act(async () => jest.advanceTimersByTimeAsync(1500));
  await type('毎日学校に行きます。');
  await act(async () => finish({ draft: draft('学校に行きます。') }));
  expect(writingService.saveDraft).toHaveBeenCalledTimes(1);
  expect(writingService.updateDraft).toHaveBeenCalledWith(
    'd1',
    '毎日学校に行きます。',
  );
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('毎日学校に行きます。');
  expect(visible()).toContain('Đã lưu nháp');
});

test('keeps failed saves editable and waits for an explicit retry instead of looping', async () => {
  jest
    .mocked(writingService.saveDraft)
    .mockRejectedValueOnce(new Error('Chưa kết nối được.'));
  await render();
  await type('学校に行きます。');
  await act(async () => jest.advanceTimersByTimeAsync(1500));
  expect(visible()).toContain('Chưa kết nối được.');
  await act(async () => jest.advanceTimersByTimeAsync(10000));
  expect(writingService.saveDraft).toHaveBeenCalledTimes(1);
  await press('Lưu nháp');
  expect(writingService.saveDraft).toHaveBeenCalledTimes(2);
  expect(visible()).toContain('Đã lưu nháp');
});

test('opens history and compares two saved versions in the same workspace without calling AI', async () => {
  const newer = {
    ...submission,
    id: 's2',
    text: '毎日学校に行きます。',
    score: 85,
    submitted_at: submission.submitted_at + 86400,
  };
  jest
    .mocked(writingService.submissions)
    .mockResolvedValue({ items: [newer, submission] });
  await render();
  await press('Bài đã nộp');
  await press('Chọn bài để so sánh');
  await press(
    `Chọn phiên bản 学校 ngày ${new Date(
      submission.submitted_at * 1000,
    ).toLocaleDateString('vi-VN')}`,
  );
  await press(
    `Chọn phiên bản 学校 ngày ${new Date(
      newer.submitted_at * 1000,
    ).toLocaleDateString('vi-VN')}`,
  );
  await press('So sánh 2 bài đã chọn');
  expect(visible()).toContain('Kết quả so sánh');
  expect(visible()).toContain(newer.text);
  expect(visible()).toContain(submission.text);
  expect(writingService.submitWriting).not.toHaveBeenCalled();
  expect(writingService.evaluateSubmission).not.toHaveBeenCalled();
});

test('prompt library searches, filters and requests one page without losing the current draft', async () => {
  await render();
  await type('学校について書いています。');
  await press('Đổi đề');
  expect(writingService.prompts).toHaveBeenLastCalledWith({
    page: 1,
    level: 'N5',
    category: '',
    q: '',
  });
  await act(async () => {
    tree.root
      .findByProps({ accessibilityLabel: 'Tìm đề bài' })
      .props.onChangeText(' 学習 ');
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(writingService.prompts).toHaveBeenLastCalledWith({
    page: 1,
    level: 'N5',
    category: '',
    q: '学習',
  });
  await press('Nhóm Học tập');
  expect(writingService.prompts).toHaveBeenLastCalledWith({
    page: 1,
    level: 'N5',
    category: 'study',
    q: '学習',
  });
  jest.mocked(writingService.prompts).mockResolvedValue({
    items: prompts,
    pagination: { page: 1, per_page: 12, total: 13, has_more: true },
  });
  await press('Chủ đề N3');
  await press('Trang đề sau');
  expect(writingService.prompts).toHaveBeenLastCalledWith({
    page: 2,
    level: 'N3',
    category: 'study',
    q: '学習',
  });
  await press('Nhóm Tất cả');
  expect(writingService.prompts).toHaveBeenLastCalledWith({
    page: 1,
    level: 'N3',
    category: '',
    q: '学習',
  });
  await press('Đóng danh sách bài viết');
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('学校について書いています。');
  expect(writingService.submitWriting).not.toHaveBeenCalled();
});

test('first entry shows the library without selecting a prompt or creating an empty draft', async () => {
  await render(false);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Nội dung bài viết' }),
  ).toHaveLength(0);
  expect(visible()).toContain('Thư viện đề bài');
  expect(control('Chọn đề 学校')).toBeTruthy();
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  expect(writingService.saveDraft).not.toHaveBeenCalled();
  expect(writingService.saveCustomDraft).not.toHaveBeenCalled();
  expect(writingService.submitWriting).not.toHaveBeenCalled();
  await act(async () => control('Chọn đề 学校').props.onPress());
  expect(
    tree.root.findByProps({ accessibilityLabel: 'Nội dung bài viết' }).props
      .value,
  ).toBe('');
});

test('timer counts writing time separately per prompt and submit lives in the criteria column', async () => {
  AppState.currentState = 'active';
  await render();
  await act(async () => jest.advanceTimersByTimeAsync(5000));
  expect(
    tree.root.findByProps({ testID: 'writing-elapsed-time' }).props.children,
  ).toBe('00:05');
  expect(
    tree.root
      .findByProps({ testID: 'writing-criteria-panel' })
      .findAll(node => node.props.accessibilityLabel === 'Nộp bài'),
  ).not.toHaveLength(0);
  expect(
    tree.root
      .findByProps({ testID: 'writing-criteria-panel' })
      .findAll(node => node.props.accessibilityLabel === 'Lưu nháp'),
  ).not.toHaveLength(0);
  await press('Chọn đề かぞく');
  expect(
    tree.root.findByProps({ testID: 'writing-elapsed-time' }).props.children,
  ).toBe('00:00');
  await act(async () => jest.advanceTimersByTimeAsync(3000));
  await press('Chọn đề 学校');
  expect(
    tree.root.findByProps({ testID: 'writing-elapsed-time' }).props.children,
  ).toBe('00:05');
});

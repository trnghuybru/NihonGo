import React from 'react';
import { Modal, SectionList, Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ConversationScreen } from '../src/screens/ConversationScreen';
import { SpeakingScenariosScreen } from '../src/screens/SpeakingScenariosScreen';
import { AuthButton } from '../src/components/AuthForm';
import {
  ScenarioDetail,
  ScenarioList,
  StartedSession,
  speakingService,
} from '../src/services/speakingService';

jest.mock('../src/services/speakingService', () => ({
  speakingService: {
    categories: jest.fn(),
    list: jest.fn(),
    detail: jest.fn(),
    start: jest.fn(),
    messages: jest.fn(),
    send: jest.fn(),
  },
}));
jest.mock('../src/services/voiceService', () => ({
  voiceService: {
    init: jest.fn(),
    cancel: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../src/services/ttsService', () => ({
  ttsService: {
    init: jest.fn().mockResolvedValue(undefined),
    setLanguage: jest.fn(),
    stop: jest.fn(),
  },
}));
const daily = {
  id: 'category-daily',
  name: 'Đời sống',
  description: 'Hội thoại hằng ngày',
};
const work = {
  id: 'category-work',
  name: 'Công việc',
  description: 'Hội thoại công việc',
};
const role = {
  id: 'role-1',
  name: 'Bạn cùng lớp',
  description: 'Bạn mới',
  opening_message: 'こんにちは',
};
const first: ScenarioDetail = {
  id: 'scenario-1',
  title: 'Làm quen bạn mới',
  description: 'Giới thiệu bản thân',
  language_code: 'ja-JP',
  difficulty_level: 'N5',
  estimated_duration_minutes: 5,
  category: daily,
  context: 'Trong lớp học',
  learning_objectives: 'Chào hỏi',
  roles: [role],
};
const second: ScenarioDetail = {
  ...first,
  id: 'scenario-2',
  title: 'Phỏng vấn',
  difficulty_level: 'N3',
  category: work,
};
const started: StartedSession = {
  session: {
    id: 'saved-session',
    scenario_id: first.id,
    scenario_role_id: role.id,
    status: 'active',
    current_input_mode: 'voice',
    audio_storage_enabled: true,
    started_at: '2026-10-01T13:00:00Z',
    accumulated_active_ms: 0,
  },
  scenario: { ...first, role },
  opening_message: {
    id: 'saved-opening',
    sequence_number: 1,
    speaker: 'assistant',
    input_mode: 'generated',
    content: 'Lời mở đầu từ backend',
    status: 'completed',
    occurred_at: '2026-10-01T13:00:00Z',
  },
};
function response(
  items: ScenarioDetail[],
  page = 1,
  total = items.length,
  totalPages = 1,
): ScenarioList {
  return {
    items,
    pagination: { page, page_size: 20, total, total_pages: totalPages },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  Object.values(speakingService).forEach(method =>
    jest.mocked(method).mockReset(),
  );
  jest.mocked(speakingService.categories).mockResolvedValue([daily, work]);
  jest
    .mocked(speakingService.list)
    .mockImplementation(async filters =>
      response(
        [first, second].filter(
          item =>
            (!filters.category_id ||
              item.category.id === filters.category_id) &&
            (!filters.level || item.difficulty_level === filters.level) &&
            (!filters.q || item.title.includes(filters.q)),
        ),
      ),
    );
  jest
    .mocked(speakingService.detail)
    .mockImplementation(async id => (id === first.id ? first : second));
  jest.mocked(speakingService.start).mockResolvedValue(started);
  jest.mocked(speakingService.messages).mockResolvedValue({
    items: [started.opening_message!],
    session: {
      id: 'saved-session',
      status: 'active',
      current_input_mode: 'voice',
    },
    has_more: false,
    next_sequence: 1,
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
async function render() {
  await act(async () => {
    tree = Renderer.create(<SpeakingScenariosScreen />);
  });
}
function callback(label: string) {
  const node = tree.root.findAll(
    item =>
      item.props.accessibilityLabel === label &&
      typeof item.props.onPress === 'function',
  )[0];
  if (node) return node.props.onPress;
  return tree.root
    .findAllByType(AuthButton)
    .find(item => item.props.label === label)!.props.onPress;
}
async function press(label: string) {
  await act(async () => {
    callback(label)();
  });
}
function screenText() {
  return JSON.stringify(
    tree.root.findAllByType(Text).map(node => node.props.children),
  );
}
function scenarios() {
  return tree.root
    .findByType(SectionList)
    .props.sections.flatMap(
      (section: { data: ScenarioDetail[] }) => section.data,
    );
}
async function openFirst() {
  await press('Đời sống');
  await press('Làm quen bạn mới, Đời sống, trình độ N5, 5 phút. Xem chi tiết');
}

test('uses API category IDs and combines server filters, search, and clearing', async () => {
  await render();
  await press('Công việc');
  expect(scenarios().map((item: ScenarioDetail) => item.id)).toEqual([
    second.id,
  ]);
  expect(speakingService.list).toHaveBeenLastCalledWith({
    category_id: work.id,
    level: undefined,
    language_code: undefined,
    q: '',
  });
  await press('Đời sống');
  await press('N5');
  expect(speakingService.list).toHaveBeenLastCalledWith({
    category_id: daily.id,
    level: 'N5',
    language_code: undefined,
    q: '',
  });
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('Làm quen'),
  );
  await press('Tìm kiếm');
  expect(speakingService.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ q: 'Làm quen' }),
  );
  await press('Xóa tất cả bộ lọc');
  expect(scenarios()).toHaveLength(2);
});

test('previews API details in a popup and continues with simple defaults', async () => {
  await render();
  await openFirst();
  expect(speakingService.detail).toHaveBeenCalledWith(first.id);
  expect(screenText()).toContain('Trong lớp học');
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  expect(scenarios()).toHaveLength(1);
  expect(screenText()).not.toContain('Chế độ nhập');
  expect(screenText()).not.toContain('Lưu audio');
  await press('Tiếp tục');
  expect(speakingService.start).toHaveBeenCalledWith(first.id, {
    role_id: role.id,
    input_mode: 'text',
    audio_storage_enabled: false,
  });
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(1);
  expect(screenText()).toContain('Lời mở đầu từ backend');
  expect(screenText()).not.toContain('Bản xem trước');
  await press('Danh sách tình huống');
  await openFirst();
  await press('Tiếp tục');
  expect(speakingService.start).toHaveBeenCalledTimes(1);
});

test('shows detail failure and retries instead of starting from a list summary', async () => {
  jest
    .mocked(speakingService.detail)
    .mockRejectedValueOnce(new Error('Không tải được chi tiết'));
  await render();
  await openFirst();
  expect(screenText()).toContain('Không tải được chi tiết');
  expect(
    tree.root
      .findAllByType(AuthButton)
      .some(item => item.props.label === 'Tiếp tục'),
  ).toBe(false);
  await press('Thử lại');
  expect(screenText()).toContain('Trong lớp học');
});

test('prevents duplicate starts and displays start errors without leaving details', async () => {
  const pending = deferred<StartedSession>();
  jest.mocked(speakingService.start).mockReturnValueOnce(pending.promise);
  await render();
  await openFirst();
  const start = callback('Tiếp tục');
  await act(async () => {
    start();
    start();
  });
  expect(speakingService.start).toHaveBeenCalledTimes(1);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  await act(async () => pending.resolve(started));
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(1);
  await press('Danh sách tình huống');
  await press('Tất cả chủ đề');
  await press('Phỏng vấn, Công việc, trình độ N3, 5 phút. Xem chi tiết');
  jest
    .mocked(speakingService.start)
    .mockRejectedValueOnce(new Error('Không tạo được buổi'));
  await press('Tiếp tục');
  expect(screenText()).toContain('Không tạo được buổi');
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(0);
});

test('closing a loading preview ignores its late response and never starts a session', async () => {
  const pending = deferred<ScenarioDetail>();
  jest.mocked(speakingService.detail).mockReturnValueOnce(pending.promise);
  await render();
  await openFirst();
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  await act(async () => pending.resolve(first));
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(speakingService.start).not.toHaveBeenCalled();
  jest.mocked(speakingService.detail).mockResolvedValueOnce({
    ...second,
    context: 'Trong văn phòng',
  });
  await press('Tất cả chủ đề');
  await press('Phỏng vấn, Công việc, trình độ N3, 5 phút. Xem chi tiết');
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  expect(screenText()).toContain('Trong văn phòng');
  expect(screenText()).not.toContain('Trong lớp học');
});

test('keeps loading, network error, and empty results distinct', async () => {
  const pending = deferred<ScenarioList>();
  jest.mocked(speakingService.list).mockReturnValueOnce(pending.promise);
  await render();
  expect(screenText()).toContain('Đang tải');
  expect(screenText()).not.toContain('Chưa có tình huống phù hợp');
  await act(async () => pending.resolve(response([])));
  expect(screenText()).toContain('Chưa có tình huống phù hợp');
  jest
    .mocked(speakingService.list)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await press('N1');
  expect(screenText()).toContain('Mất kết nối');
  expect(screenText()).not.toContain('Chưa có tình huống phù hợp');
  await press('Thử lại');
  expect(screenText()).toContain('Chưa có tình huống phù hợp');
});

test('loads more pages and ignores stale results after changing filters', async () => {
  jest
    .mocked(speakingService.list)
    .mockResolvedValueOnce(response([first], 1, 2, 2));
  await render();
  jest
    .mocked(speakingService.list)
    .mockRejectedValueOnce(new Error('Không tải được trang tiếp'));
  await press('Tải thêm tình huống');
  expect(scenarios()).toHaveLength(1);
  expect(screenText()).toContain('Không tải được trang tiếp');
  const pending = deferred<ScenarioList>();
  jest.mocked(speakingService.list).mockReturnValueOnce(pending.promise);
  await press('Tải thêm tình huống');
  expect(speakingService.list).toHaveBeenLastCalledWith(expect.any(Object), 2);
  await press('N3');
  expect(scenarios().map((item: ScenarioDetail) => item.id)).toEqual([
    second.id,
  ]);
  await act(async () => pending.resolve(response([first], 2, 2, 2)));
  expect(scenarios().map((item: ScenarioDetail) => item.id)).toEqual([
    second.id,
  ]);
});

test('appends pages without duplicate scenario cards', async () => {
  jest
    .mocked(speakingService.list)
    .mockResolvedValueOnce(response([first], 1, 2, 2));
  await render();
  jest
    .mocked(speakingService.list)
    .mockResolvedValueOnce(response([first, second], 2, 2, 2));
  await press('Tải thêm tình huống');
  expect(scenarios()).toHaveLength(2);
});

test('loads API roles and sends the selected role instead of a hardcoded one', async () => {
  const another = {
    ...role,
    id: 'role-2',
    name: 'Giáo viên',
    opening_message: null,
  };
  jest
    .mocked(speakingService.detail)
    .mockResolvedValueOnce({ ...first, roles: [role, another] });
  jest
    .mocked(speakingService.start)
    .mockResolvedValueOnce({ ...started, opening_message: null });
  jest.mocked(speakingService.messages).mockResolvedValueOnce({
    items: [],
    session: {
      id: 'saved-session',
      status: 'active',
      current_input_mode: 'text',
    },
    has_more: false,
    next_sequence: 0,
  });
  await render();
  await openFirst();
  await press('Giáo viên');
  await press('Tiếp tục');
  expect(speakingService.start).toHaveBeenCalledWith(first.id, {
    role_id: another.id,
    input_mode: 'text',
    audio_storage_enabled: false,
  });
  expect(screenText()).toContain('xxx');
});

test('retries category loading and never falls back to mock categories', async () => {
  jest
    .mocked(speakingService.categories)
    .mockRejectedValueOnce(new Error('Không tải được chủ đề'));
  await render();
  expect(screenText()).toContain('Không tải được chủ đề');
  expect(
    tree.root.findAll(
      node =>
        node.props.accessibilityRole === 'radio' &&
        node.props.accessibilityLabel === 'Đời sống',
    ),
  ).toHaveLength(0);
  expect(scenarios()).toHaveLength(2);
  await press('Tải lại chủ đề');
  expect(screenText()).toContain('Đời sống');
});

test('shows inline topic and level filters with the list and preserves them after details', async () => {
  await render();
  expect(scenarios()).toHaveLength(2);
  expect(screenText()).toContain('Tình huống');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  await press('N5');
  await press('Đời sống');
  expect(speakingService.list).toHaveBeenLastCalledWith({
    category_id: daily.id,
    level: 'N5',
    language_code: undefined,
    q: '',
  });
  await press('Làm quen bạn mới, Đời sống, trình độ N5, 5 phút. Xem chi tiết');
  await press('Đóng');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(speakingService.start).not.toHaveBeenCalled();
  expect(scenarios().map((item: ScenarioDetail) => item.id)).toEqual([
    first.id,
  ]);
  for (const label of ['Đời sống', 'N5']) {
    const filter = tree.root.findAll(
      node =>
        node.props.accessibilityRole === 'radio' &&
        node.props.accessibilityLabel === label,
    )[0];
    expect(filter.props.accessibilityState.checked).toBe(true);
  }
});

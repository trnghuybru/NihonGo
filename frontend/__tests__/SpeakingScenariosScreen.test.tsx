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
    history: jest.fn(),
    session: jest.fn(),
    categories: jest.fn(),
    list: jest.fn(),
    detail: jest.fn(),
    start: jest.fn(),
    messages: jest.fn(),
    send: jest.fn(),
  },
}));
jest.mock('../src/components/CharacterView3D', () => ({
  CharacterView3D: () => null,
}));
jest.mock('../src/services/geminiLiveService', () => ({
  GeminiLiveService: jest.fn().mockImplementation((_id, callbacks) => ({
    connect: async () => callbacks.onState('ready'),
    close: async () => undefined,
    hasUnsavedTurn: () => false,
  })),
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
  jest.mocked(speakingService.history).mockResolvedValue({
    items: [],
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
  });
  jest.mocked(speakingService.session).mockResolvedValue(started);
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
async function render(choose = true) {
  await act(async () => {
    tree = Renderer.create(<SpeakingScenariosScreen />);
  });
  if (choose) await press('Cuộc trò chuyện mới');
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
  await press('Làm quen bạn mới, Đời sống, trình độ N5, 5 phút. Chọn ngữ cảnh');
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

test('opens context selection over chat and posts the briefing after starting', async () => {
  await render();
  await openFirst();
  expect(speakingService.detail).toHaveBeenCalledWith(first.id);
  expect(screenText()).toContain('Giới thiệu bản thân');
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  expect(tree.root.findAllByType(SectionList)).toHaveLength(0);
  expect(screenText()).not.toContain('Chế độ nhập');
  expect(screenText()).not.toContain('Lưu audio');
  await press('Bắt đầu trò chuyện');
  expect(speakingService.start).toHaveBeenCalledWith(first.id, {
    role_id: role.id,
    input_mode: 'voice',
    audio_storage_enabled: true,
  });
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(1);
  expect(screenText()).toContain('Lời mở đầu từ backend');
  expect(screenText()).not.toContain('Chào hỏi');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  await press('Xem nhiệm vụ');
  expect(screenText()).toContain('Nhiệm vụ của bạn');
  expect(screenText()).toContain('Chào hỏi');
  expect(screenText()).toContain('AI đóng vai');
  expect(screenText()).toContain('Bạn mới');
  await press('Đóng nhiệm vụ');
  await press('Lịch sử hội thoại');
  await press('Cuộc trò chuyện mới');
  await openFirst();
  await press('Bắt đầu trò chuyện');
  expect(speakingService.start).toHaveBeenCalledTimes(2);
});

test('allows disabling audio storage before creating a conversation', async () => {
  await render();
  await openFirst();
  const checkbox = tree.root.findAll(
    node =>
      node.props.accessibilityRole === 'checkbox' &&
      node.props.accessibilityLabel === 'Lưu âm thanh để nghe lại',
  )[0];
  expect(checkbox.props.accessibilityState.checked).toBe(true);
  await act(async () => checkbox.props.onPress());
  await press('Bắt đầu trò chuyện');
  expect(speakingService.start).toHaveBeenCalledWith(
    first.id,
    expect.objectContaining({ audio_storage_enabled: false }),
  );
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
      .some(item => item.props.label === 'Bắt đầu trò chuyện'),
  ).toBe(false);
  await press('Thử lại');
  expect(screenText()).toContain('Giới thiệu bản thân');
});

test('prevents duplicate starts and displays start errors without leaving details', async () => {
  const pending = deferred<StartedSession>();
  jest.mocked(speakingService.start).mockReturnValueOnce(pending.promise);
  await render();
  await openFirst();
  const start = callback('Bắt đầu trò chuyện');
  await act(async () => {
    start();
    start();
  });
  expect(speakingService.start).toHaveBeenCalledTimes(1);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  await act(async () => pending.resolve(started));
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(1);
  await press('Lịch sử hội thoại');
  await press('Cuộc trò chuyện mới');
  await press('Tất cả chủ đề');
  await press('Phỏng vấn, Công việc, trình độ N3, 5 phút. Chọn ngữ cảnh');
  jest
    .mocked(speakingService.start)
    .mockRejectedValueOnce(new Error('Không tạo được buổi'));
  await press('Bắt đầu trò chuyện');
  expect(screenText()).toContain('Không tạo được buổi');
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(0);
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
});

test('closing a loading preview ignores its late response and never starts a session', async () => {
  const pending = deferred<ScenarioDetail>();
  jest.mocked(speakingService.detail).mockReturnValueOnce(pending.promise);
  await render();
  await openFirst();
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  await press('Đóng');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  await act(async () => pending.resolve(first));
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(speakingService.start).not.toHaveBeenCalled();
  jest.mocked(speakingService.detail).mockResolvedValueOnce({
    ...second,
    context: 'Trong văn phòng',
  });
  await press('Cuộc trò chuyện mới');
  await press('Tất cả chủ đề');
  await press('Phỏng vấn, Công việc, trình độ N3, 5 phút. Chọn ngữ cảnh');
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  expect(screenText()).toContain('Phỏng vấn');
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
  await press('Bắt đầu trò chuyện');
  expect(speakingService.start).toHaveBeenCalledWith(first.id, {
    role_id: another.id,
    input_mode: 'voice',
    audio_storage_enabled: true,
  });
  expect(screenText()).toContain('Bắt đầu trò chuyện cùng Aoi.');
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

test('opens the selector immediately and preserves filters after dismissing', async () => {
  await render();
  expect(scenarios()).toHaveLength(2);
  expect(screenText()).toContain('Chọn ngữ cảnh');
  expect(screenText()).toContain('Hội thoại cùng AI');
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  await press('N5');
  await press('Đời sống');
  expect(speakingService.list).toHaveBeenLastCalledWith({
    category_id: daily.id,
    level: 'N5',
    language_code: undefined,
    q: '',
  });
  await press('Làm quen bạn mới, Đời sống, trình độ N5, 5 phút. Chọn ngữ cảnh');
  await press('Đóng');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(speakingService.start).not.toHaveBeenCalled();
  await press('Cuộc trò chuyện mới');
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

test('creates new conversations from history and keeps the chat header minimal', async () => {
  await render();
  await openFirst();
  await press('Bắt đầu trò chuyện');
  expect(
    tree.root
      .findAllByType(AuthButton)
      .some(button => button.props.label === 'Cuộc trò chuyện mới'),
  ).toBe(false);
  await press('Lịch sử hội thoại');
  await press('Cuộc trò chuyện mới');
  await press('Đóng');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(0);
  expect(speakingService.start).toHaveBeenCalledTimes(1);
  expect(screenText()).toContain('Hội thoại gần đây');
});

test('hardware back from context details returns to the same selector', async () => {
  await render();
  await openFirst();
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(tree.root.findAllByType(Modal)).toHaveLength(1);
  expect(scenarios().map((item: ScenarioDetail) => item.id)).toEqual([
    first.id,
  ]);
  expect(speakingService.start).not.toHaveBeenCalled();
});

test('shows saved history on entry and opens the original session without creating one', async () => {
  jest.mocked(speakingService.history).mockResolvedValue({
    items: [
      {
        id: started.session.id,
        title: first.title,
        role_name: role.name,
        status: 'active',
        last_activity_at: started.session.started_at,
        last_message: 'Tin nhắn gần nhất',
      },
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
  });
  await render(false);
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(screenText()).toContain('Hội thoại gần đây');
  expect(screenText()).toContain('Tin nhắn gần nhất');
  await press('Mở hội thoại Làm quen bạn mới');
  expect(speakingService.session).toHaveBeenCalledWith(started.session.id);
  expect(speakingService.start).not.toHaveBeenCalled();
  expect(screenText()).toContain('Lời mở đầu từ backend');
  await press('Lịch sử hội thoại');
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(0);
  expect(speakingService.history).toHaveBeenCalledTimes(2);
});

test('distinguishes empty history from errors and retries loading', async () => {
  jest
    .mocked(speakingService.history)
    .mockRejectedValueOnce(new Error('Không tải được lịch sử'));
  await render(false);
  expect(screenText()).toContain('Không tải được lịch sử');
  expect(screenText()).not.toContain('Cuộc trò chuyện đầu tiên của bạn');
  await press('Tải lại lịch sử');
  expect(screenText()).toContain('Cuộc trò chuyện đầu tiên của bạn');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

test('keeps history visible when opening a saved session fails', async () => {
  jest.mocked(speakingService.history).mockResolvedValue({
    items: [
      {
        id: started.session.id,
        title: first.title,
        role_name: role.name,
        status: 'active',
        last_activity_at: started.session.started_at,
        last_message: null,
      },
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
  });
  jest
    .mocked(speakingService.session)
    .mockRejectedValueOnce(new Error('Không mở được phiên'));
  await render(false);
  await press('Mở hội thoại Làm quen bạn mới');
  expect(screenText()).toContain('Không mở được phiên');
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(0);
  await press('Mở hội thoại Làm quen bạn mới');
  expect(tree.root.findAllByType(ConversationScreen)).toHaveLength(1);
});

test('paginates history and retries the failed page without losing existing rows', async () => {
  const entry = {
    id: started.session.id,
    title: first.title,
    role_name: role.name,
    status: 'active' as const,
    last_activity_at: started.session.started_at,
    last_message: 'Lời nhắn',
  };
  jest.mocked(speakingService.history).mockResolvedValueOnce({
    items: [entry],
    pagination: { page: 1, page_size: 20, total: 2, total_pages: 2 },
  });
  await render(false);
  jest
    .mocked(speakingService.history)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await press('Xem thêm hội thoại');
  expect(screenText()).toContain(first.title);
  expect(screenText()).toContain('Mất kết nối');
  jest.mocked(speakingService.history).mockResolvedValueOnce({
    items: [{ ...entry, id: 'another-session', title: second.title }],
    pagination: { page: 2, page_size: 20, total: 2, total_pages: 2 },
  });
  await press('Tải lại lịch sử');
  expect(speakingService.history).toHaveBeenLastCalledWith(2);
  expect(screenText()).toContain(first.title);
  expect(screenText()).toContain(second.title);
  expect(
    tree.root
      .findAllByType(AuthButton)
      .some(button => button.props.label === 'Xem thêm hội thoại'),
  ).toBe(false);
});

test('opens completed conversations for reading and disables sending', async () => {
  jest.mocked(speakingService.history).mockResolvedValue({
    items: [
      {
        id: started.session.id,
        title: first.title,
        role_name: role.name,
        status: 'completed',
        last_activity_at: started.session.started_at,
        last_message: 'Đã xong',
      },
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
  });
  jest.mocked(speakingService.session).mockResolvedValue({
    ...started,
    session: { ...started.session, status: 'completed' },
  });
  jest.mocked(speakingService.messages).mockResolvedValue({
    items: [started.opening_message!],
    session: {
      id: started.session.id,
      status: 'completed',
      current_input_mode: 'voice',
    },
    has_more: false,
    next_sequence: 1,
  });
  await render(false);
  await press('Mở hội thoại Làm quen bạn mới');
  expect(screenText()).toContain('Phiên này chỉ xem lại');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  await press('Chế độ nhắn tin');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(screenText()).toContain('Xem điểm & nhận xét');
  expect(speakingService.start).not.toHaveBeenCalled();
});

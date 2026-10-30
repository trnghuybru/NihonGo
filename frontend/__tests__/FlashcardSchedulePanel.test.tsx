import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, Text, TextInput } from 'react-native';
import { FlashcardStudyProvider } from '../src/components/FlashcardStudyProvider';
import { FlashcardScreen } from '../src/screens/FlashcardScreen';
import {
  flashcardSrsService,
  FlashcardSchedule,
} from '../src/services/flashcardSrsService';
import {
  requestReminderPermission,
  syncFlashcardReminders,
} from '../src/services/flashcardNotifications';

jest.mock('../src/services/flashcardSrsService', () => ({
  flashcardSrsService: {
    schedule: jest.fn(),
    dueReview: jest.fn(),
    reminder: jest.fn(),
  },
  subscribeFlashcardSchedule: () => () => {},
}));
jest.mock('../src/services/flashcardService', () => ({
  flashcardService: {
    sessionFavorite: jest.fn().mockResolvedValue({ saved: false }),
    decks: jest.fn().mockResolvedValue({
      items: [],
      pagination: { page: 1, total_pages: 0 },
      active_session: null,
    }),
  },
}));
jest.mock('../src/services/flashcardNotifications', () => ({
  reminderSupported: true,
  setReminderAccount: jest.fn().mockResolvedValue(undefined),
  syncFlashcardReminders: jest.fn().mockResolvedValue(undefined),
  requestReminderPermission: jest.fn().mockResolvedValue(undefined),
  subscribeReminderPress: () => () => {},
}));
const schedule: FlashcardSchedule = {
  timezone: 'Asia/Ho_Chi_Minh',
  today: '2026-10-20',
  due_count: 2,
  reviewed_today_count: 4,
  overdue_count: 1,
  today_count: 3,
  scheduled_count: 5,
  next_due_at: 1,
  days: Array.from({ length: 30 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 20 + index)).toISOString().slice(0, 10),
    count: index === 0 ? 3 : 0,
  })),
  reminder: { enabled: false, hour: 19, minute: 0 },
  reminders: [],
};
let tree: Renderer.ReactTestRenderer;
const control = (label: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
const copy = () =>
  tree.root
    .findAllByType(Text)
    .map(node =>
      React.Children.toArray(node.props.children)
        .filter(value => typeof value === 'string' || typeof value === 'number')
        .join(''),
    )
    .join('\n');
const press = async (label: string) => {
  await act(async () => control(label).props.onPress());
};
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <FlashcardStudyProvider accountId="one" onOpenDue={jest.fn()}>
        <FlashcardScreen onExit={jest.fn()} />
      </FlashcardStudyProvider>,
    );
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(flashcardSrsService.schedule).mockResolvedValue(schedule);
  jest.mocked(requestReminderPermission).mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('shows real daily counts, expands the calendar and starts due review with retry on failure', async () => {
  await render();
  expect(
    tree.root.findAll(
      node => node.props.accessibilityLabel === '3 thẻ đến hạn hôm nay',
    ).length,
  ).toBeGreaterThan(0);
  expect(
    tree.root.findAll(
      node => node.props.accessibilityLabel === '4 thẻ đã ôn hôm nay',
    ).length,
  ).toBeGreaterThan(0);
  expect(copy()).not.toContain('Lịch dự kiến thay đổi');
  expect(copy()).toContain('1 thẻ quá hạn');
  expect(control('2026-11-18: 0 thẻ cần ôn')).toBeUndefined();
  await press('Xem lịch ôn 30 ngày');
  expect(control('2026-11-18: 0 thẻ cần ôn')).toBeDefined();
  jest
    .mocked(flashcardSrsService.dueReview)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await press('Ôn thẻ đến hạn');
  expect(copy()).toContain('Mất kết nối');
  jest.mocked(flashcardSrsService.dueReview).mockResolvedValue({
    id: 'due',
    kind: 'custom',
    deck_id: 'review:due',
    title: 'Ôn thẻ đến hạn',
    cards: [
      { id: 'a', front: '学校', reading: 'がっこう', back: 'trường học' },
    ],
    ratings: {},
    started_at: 1,
    finished_at: null,
    summary: {
      total: 1,
      studied: 0,
      counts: [0, 0, 0, 0],
      remembered: 0,
      remembered_percent: 0,
    },
  });
  await press('Ôn thẻ đến hạn');
  expect(copy()).toContain('学校');
  expect(copy()).not.toContain('Lịch ôn tập');
});

test('validates reminder time, requires permission and syncs saved preferences', async () => {
  await render();
  const time = tree.root
    .findAllByType(TextInput)
    .find(node => node.props.accessibilityLabel === 'Giờ nhắc ôn')!;
  await act(async () => time.props.onChangeText('25:00'));
  await press('Bật nhắc ôn');
  expect(flashcardSrsService.reminder).not.toHaveBeenCalled();
  await act(async () => time.props.onChangeText('20:30'));
  jest
    .mocked(requestReminderPermission)
    .mockRejectedValueOnce(new Error('Chưa cấp quyền'));
  await press('Bật nhắc ôn');
  expect(copy()).toContain('Chưa cấp quyền');
  expect(flashcardSrsService.reminder).not.toHaveBeenCalled();
  const enabled = {
    ...schedule,
    reminder: { enabled: true, hour: 20, minute: 30 },
  };
  jest.mocked(flashcardSrsService.schedule).mockResolvedValue(enabled);
  await press('Bật nhắc ôn');
  expect(flashcardSrsService.reminder).toHaveBeenCalledWith(enabled.reminder);
  expect(syncFlashcardReminders).toHaveBeenLastCalledWith(enabled, 'one');
  expect(control('Tắt nhắc ôn')).toBeDefined();
});

test('empty calendar never starts a review and displays a loading failure with retry', async () => {
  jest
    .mocked(flashcardSrsService.schedule)
    .mockRejectedValueOnce(new Error('Không tải được lịch ôn'));
  await render();
  expect(copy()).toContain('Không tải được lịch ôn');
  jest
    .mocked(flashcardSrsService.schedule)
    .mockResolvedValue({ ...schedule, due_count: 0 });
  await press('Tải lại lịch ôn');
  expect(control('Ôn thẻ đến hạn').props.disabled).toBe(true);
});

test('a reviewed card scheduled later today remains counted and unlocks only at its due time', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-20T03:00:00Z'));
  const previousState = AppState.currentState;
  AppState.currentState = 'active';
  const dueAt = Date.parse('2026-10-20T03:10:00Z');
  const waiting = {
    ...schedule,
    due_count: 0,
    today_count: 1,
    reviewed_today_count: 1,
    overdue_count: 0,
    next_due_at: dueAt,
  };
  jest.mocked(flashcardSrsService.schedule).mockResolvedValue(waiting);
  try {
    await render();
    expect(
      tree.root.findAll(
        node => node.props.accessibilityLabel === '1 thẻ đến hạn hôm nay',
      ).length,
    ).toBeGreaterThan(0);
    expect(copy()).toContain('Ôn tiếp lúc 10:10');
    expect(control('Ôn thẻ đến hạn').props.disabled).toBe(true);
    jest.mocked(flashcardSrsService.schedule).mockImplementation(async () => ({
      ...waiting,
      due_count: Date.now() >= dueAt ? 1 : 0,
    }));
    await act(async () => {
      jest.advanceTimersByTime(9 * 60000);
    });
    expect(control('Ôn thẻ đến hạn').props.disabled).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(60000 + 250);
    });
    expect(control('Ôn thẻ đến hạn').props.disabled).toBe(false);
  } finally {
    await act(async () => tree.unmount());
    AppState.currentState = previousState;
    jest.useRealTimers();
  }
});

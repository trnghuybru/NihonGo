import notifee from '@notifee/react-native';
import * as Keychain from 'react-native-keychain';
import {
  initializeFlashcardNotifications,
  requestReminderPermission,
  setReminderAccount,
  subscribeReminderPress,
  syncFlashcardReminders,
} from '../src/services/flashcardNotifications';
import type { FlashcardSchedule } from '../src/services/flashcardSrsService';

const schedule: FlashcardSchedule = {
  timezone: 'Asia/Ho_Chi_Minh',
  today: '2026-10-20',
  due_count: 1,
  reviewed_today_count: 0,
  overdue_count: 0,
  today_count: 1,
  scheduled_count: 1,
  next_due_at: Date.now(),
  days: [],
  reminder: { enabled: true, hour: 19, minute: 0 },
  reminders: [
    { id: 'flashcard:2026-10-21', at: Date.now() + 86400000, count: 1 },
  ],
};

beforeEach(async () => {
  await setReminderAccount(null);
  jest.clearAllMocks();
  jest
    .mocked(notifee.getNotificationSettings)
    .mockResolvedValue({ authorizationStatus: 1 } as never);
  jest
    .mocked(notifee.requestPermission)
    .mockResolvedValue({ authorizationStatus: 1 } as never);
  jest.mocked(notifee.getTriggerNotificationIds).mockResolvedValue([]);
  jest.mocked(notifee.getTriggerNotifications).mockResolvedValue([]);
  jest.mocked(notifee.getDisplayedNotifications).mockResolvedValue([]);
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue(false);
});

test('reschedules only flashcard triggers, skips expired dates and uses the native scheduler', async () => {
  await setReminderAccount('one');
  jest
    .mocked(notifee.getTriggerNotificationIds)
    .mockResolvedValue(['flashcard:old', 'unrelated']);
  await syncFlashcardReminders(
    {
      ...schedule,
      reminders: [
        { id: 'flashcard:expired', at: Date.now() - 1, count: 1 },
        ...schedule.reminders,
      ],
    },
    'one',
  );
  expect(notifee.cancelNotification).toHaveBeenCalledWith('flashcard:old');
  expect(notifee.cancelNotification).not.toHaveBeenCalledWith('unrelated');
  expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(1);
  expect(notifee.createTriggerNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'flashcard:2026-10-21',
      data: { kind: 'flashcard-due', accountId: 'one' },
    }),
    { type: 0, timestamp: schedule.reminders[0].at },
  );
});

test('logout cancels reminders and prevents a late response from scheduling for the previous account', async () => {
  await setReminderAccount('one');
  jest
    .mocked(notifee.getTriggerNotificationIds)
    .mockResolvedValue(['flashcard:old']);
  await setReminderAccount(null);
  await syncFlashcardReminders(schedule, 'one');
  expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  expect(notifee.cancelNotification).toHaveBeenCalledWith('flashcard:old');
  expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
    service: 'nihongo.flashcard-notification',
  });
});

test('launching offline keeps the signed-in account reminders and removes another account reminders', async () => {
  jest
    .mocked(notifee.getTriggerNotifications)
    .mockResolvedValue([
      { notification: { id: 'flashcard:mine', data: { accountId: 'one' } } },
      { notification: { id: 'flashcard:other', data: { accountId: 'two' } } },
    ] as never);
  await setReminderAccount('one');
  expect(notifee.cancelNotification).toHaveBeenCalledWith('flashcard:other');
  expect(notifee.cancelNotification).not.toHaveBeenCalledWith('flashcard:mine');
});

test('disabled reminders cancel old triggers; permission rejection is surfaced', async () => {
  await setReminderAccount('one');
  await syncFlashcardReminders(
    { ...schedule, reminder: { ...schedule.reminder, enabled: false } },
    'one',
  );
  expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  jest
    .mocked(notifee.requestPermission)
    .mockResolvedValue({ authorizationStatus: 0 } as never);
  await expect(requestReminderPermission()).rejects.toThrow(
    'cho phép thông báo',
  );
  jest
    .mocked(notifee.getNotificationSettings)
    .mockResolvedValue({ authorizationStatus: 0 } as never);
  await expect(syncFlashcardReminders(schedule, 'one')).rejects.toThrow(
    'bị chặn',
  );
});

test('caps scheduled reminders at thirty', async () => {
  await setReminderAccount('one');
  await syncFlashcardReminders(
    {
      ...schedule,
      reminders: Array.from({ length: 60 }, (_, index) => ({
        id: `flashcard:${index}`,
        at: Date.now() + (index + 1) * 86400000,
        count: 1,
      })),
    },
    'one',
  );
  expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(30);
});

test('unchanged schedules do not recreate native triggers on every refresh', async () => {
  await setReminderAccount('one');
  await syncFlashcardReminders(schedule, 'one');
  await syncFlashcardReminders(schedule, 'one');
  expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(1);
});

test('a notification press opens review only for its signed-in account', async () => {
  initializeFlashcardNotifications();
  const callback = jest.fn();
  jest
    .mocked(Keychain.getGenericPassword)
    .mockResolvedValue({ username: 'reminder', password: 'two' } as never);
  const stopWrong = subscribeReminderPress('one', callback);
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  expect(callback).not.toHaveBeenCalled();
  stopWrong();
  const stop = subscribeReminderPress('two', callback);
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  expect(callback).toHaveBeenCalledTimes(1);
  stop();
});

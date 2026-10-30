import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  EventType,
  TriggerType,
} from '@notifee/react-native';
import * as Keychain from 'react-native-keychain';
import type { FlashcardSchedule } from './flashcardSrsService';

export const reminderSupported = true;
const prefix = 'flashcard:';
const intentService = 'nihongo.flashcard-notification';
const listeners = new Set<() => void>();
let initialized = false;
let account: string | null = null;
let revision = 0;
let appliedPlan: string | null = null;
let queue = Promise.resolve();

function serialized(task: () => Promise<void>) {
  const next = queue.then(task);
  queue = next.catch(() => undefined);
  return next;
}

async function cancelReminders(keepAccount?: string) {
  const ids = keepAccount
    ? (await notifee.getTriggerNotifications())
        .filter(item => item.notification.data?.accountId !== keepAccount)
        .map(item => item.notification.id!)
    : await notifee.getTriggerNotificationIds();
  await Promise.all(
    ids
      .filter(id => id.startsWith(prefix))
      .map(id => notifee.cancelNotification(id)),
  );
  const displayed = await notifee.getDisplayedNotifications();
  await Promise.all(
    displayed
      .filter(
        item =>
          item.id?.startsWith(prefix) &&
          (!keepAccount || item.notification.data?.accountId !== keepAccount),
      )
      .map(item => notifee.cancelNotification(item.id!)),
  );
}

export function setReminderAccount(id: string | null) {
  if (id !== null && account === id) return Promise.resolve();
  account = id;
  revision += 1;
  appliedPlan = null;
  return serialized(async () => {
    // Keep this user's existing native reminders when launching offline.
    await cancelReminders(id ?? undefined);
    if (id === null)
      await Keychain.resetGenericPassword({ service: intentService });
  });
}

export async function requestReminderPermission() {
  const settings = await notifee.requestPermission();
  if (settings.authorizationStatus < AuthorizationStatus.AUTHORIZED)
    throw new Error(
      'Hãy cho phép thông báo trong cài đặt điện thoại để nhận nhắc ôn.',
    );
}

export function syncFlashcardReminders(
  data: FlashcardSchedule,
  accountId: string,
) {
  const version = ++revision;
  return serialized(async () => {
    if (account !== accountId || version !== revision) return;
    const plan = JSON.stringify({
      accountId,
      preference: data.reminder,
      reminders: data.reminders.map(({ id, at }) => ({ id, at })),
    });
    const settings = data.reminder.enabled
      ? await notifee.getNotificationSettings()
      : null;
    if (
      settings &&
      settings.authorizationStatus < AuthorizationStatus.AUTHORIZED
    ) {
      appliedPlan = null;
      await cancelReminders();
      throw new Error(
        'Thông báo đang bị chặn. Hãy cấp quyền trong cài đặt điện thoại.',
      );
    }
    if (account !== accountId || version !== revision || appliedPlan === plan)
      return;
    await cancelReminders();
    if (account !== accountId || version !== revision) return;
    appliedPlan = null;
    if (!data.reminder.enabled) {
      appliedPlan = plan;
      return;
    }
    const channelId = await notifee.createChannel({
      id: 'flashcard-review',
      name: 'Nhắc ôn flashcard',
      importance: AndroidImportance.DEFAULT,
    });
    // At most 30 one-shot triggers, below both platforms' scheduling limits.
    for (const reminder of data.reminders.slice(0, 30)) {
      if (account !== accountId || version !== revision) break;
      if (reminder.at <= Date.now()) continue;
      await notifee.createTriggerNotification(
        {
          id: reminder.id,
          title: 'Đến giờ ôn từ vựng',
          body: 'Bạn có thẻ đến hạn ôn. Dành ít phút để giữ vững từ đã học nhé.',
          data: { kind: 'flashcard-due', accountId },
          android: {
            channelId,
            smallIcon: 'ic_stat_review',
            pressAction: { id: 'default' },
          },
          ios: { sound: 'default' },
        },
        { type: TriggerType.TIMESTAMP, timestamp: reminder.at },
      );
    }
    if (account === accountId && version === revision) appliedPlan = plan;
  });
}

async function rememberPress(data: Record<string, unknown> | undefined) {
  if (data?.kind !== 'flashcard-due' || typeof data.accountId !== 'string')
    return;
  await Keychain.setGenericPassword('reminder', data.accountId, {
    service: intentService,
  });
  listeners.forEach(listener => listener());
}

export function initializeFlashcardNotifications() {
  if (initialized) return;
  initialized = true;
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS)
      await rememberPress(detail.notification?.data);
  });
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS)
      rememberPress(detail.notification?.data).catch(() => undefined);
  });
}

export function subscribeReminderPress(accountId: string, onPress: () => void) {
  let alive = true;
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const pending = await Keychain.getGenericPassword({
        service: intentService,
      });
      if (!alive || !pending || pending.password !== accountId) return;
      await Keychain.resetGenericPassword({ service: intentService });
      if (alive) onPress();
    } finally {
      checking = false;
    }
  };
  const listener = () => {
    check().catch(() => undefined);
  };
  listeners.add(listener);
  notifee
    .getInitialNotification()
    .then(async initial => {
      if (!alive) return;
      if (initial) await rememberPress(initial.notification.data);
      await check();
    })
    .catch(() => undefined);
  return () => {
    alive = false;
    listeners.delete(listener);
  };
}

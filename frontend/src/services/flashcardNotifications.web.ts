import type { FlashcardSchedule } from './flashcardSrsService';

// Local phone notifications are independent of the browser build.
export const reminderSupported = false;
export const setReminderAccount = async (_id: string | null) => {};
export const requestReminderPermission = async () => {};
export const syncFlashcardReminders = async (
  _data: FlashcardSchedule,
  _accountId: string,
) => {};
export const initializeFlashcardNotifications = () => {};
export const subscribeReminderPress =
  (_accountId: string, _onPress: () => void) => () => {};

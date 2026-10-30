import { authenticatedRequest } from './authService';
import type { FlashcardSession } from './flashcardService';

export type ReminderPreference = {
  enabled: boolean;
  hour: number;
  minute: number;
};
export type FlashcardSchedule = {
  timezone: string;
  today: string;
  due_count: number;
  reviewed_today_count: number;
  overdue_count: number;
  today_count: number;
  scheduled_count: number;
  next_due_at: number | null;
  days: { date: string; count: number }[];
  reminder: ReminderPreference;
  reminders: { id: string; at: number; count: number }[];
};

const listeners = new Set<() => void>();
export function notifyFlashcardScheduleChanged() {
  listeners.forEach(listener => listener());
}
export function subscribeFlashcardSchedule(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const flashcardSrsService = {
  schedule: () =>
    authenticatedRequest<FlashcardSchedule>('/flashcards/schedule'),
  dueReview: () =>
    authenticatedRequest<FlashcardSession>('/flashcards/due-review', {}),
  reminder: (preference: ReminderPreference) =>
    authenticatedRequest<ReminderPreference>(
      '/flashcards/reminder',
      preference,
      'PUT',
    ),
};

import { authenticatedRequest } from './authService';
import type { StudyInterval } from '../utils/studyTime';

export interface StudyProgress {
  date: string;
  timezone: string;
  seconds: number;
  goal_seconds: number | null;
  completed: boolean;
  server_time_ms: number;
  intervals: StudyInterval[];
}

export interface StudyCalendar {
  year: number;
  today: string;
  timezone: string;
  goal_seconds: number | null;
  first_year: number;
  days: { date: string; seconds: number }[];
  study_days: number;
  current_streak: number;
  longest_streak: number;
}

export const studyTimeService = {
  load: (accountId: string) =>
    authenticatedRequest<StudyProgress>(
      `/learning/progress?account_id=${encodeURIComponent(accountId)}`,
    ),
  calendar: (accountId: string, year: number) =>
    authenticatedRequest<StudyCalendar>(
      `/learning/study-calendar?account_id=${encodeURIComponent(accountId)}&year=${year}`,
    ),
  record: (accountId: string, intervals: StudyInterval[]) =>
    authenticatedRequest<StudyProgress>(
      '/learning/progress',
      { account_id: accountId, intervals },
      'POST',
      { timeoutMs: 10000 },
    ),
};

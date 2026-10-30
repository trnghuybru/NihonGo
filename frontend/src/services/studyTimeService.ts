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

export const studyTimeService = {
  load: (accountId: string) =>
    authenticatedRequest<StudyProgress>(
      `/learning/progress?account_id=${encodeURIComponent(accountId)}`,
    ),
  record: (accountId: string, intervals: StudyInterval[]) =>
    authenticatedRequest<StudyProgress>(
      '/learning/progress',
      { account_id: accountId, intervals },
      'POST',
      { timeoutMs: 10000 },
    ),
};

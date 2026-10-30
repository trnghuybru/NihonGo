import { authenticatedRequest } from './authService';
import type { FlashcardSession } from './flashcardService';

export type HomeFlashcards = {
  active_session: { id: string; title: string; remaining: number } | null;
  weak_count: number;
  due_count: number;
  today_count?: number;
  next_due_at?: number | null;
  learned_count: number;
  quiz_available: number;
  quiz: {
    id: string;
    total: number;
    answered: number;
    correct: number;
    finished: boolean;
  } | null;
};
export type DailyQuiz = {
  id: string;
  date: string;
  total: number;
  answered: number;
  correct: number;
  finished_at: number | null;
  questions: {
    id: string;
    front: string;
    options: { id: string; text: string }[];
    answer?: {
      selected_id: string;
      correct_id: string;
      correct: boolean;
      reading: string;
      meaning: string;
    };
  }[];
};
export const dailyFlashcardService = {
  home: () => authenticatedRequest<HomeFlashcards>('/flashcards/home'),
  review: (mode: 'weak' | 'quiz' = 'weak', quizId?: string) =>
    authenticatedRequest<FlashcardSession>('/flashcards/review', {
      mode,
      quiz_id: quizId,
    }),
  quiz: () => authenticatedRequest<DailyQuiz>('/flashcards/daily-quiz', {}),
  answer: (quizId: string, questionId: string, optionId: string) =>
    authenticatedRequest<DailyQuiz>(
      `/flashcards/daily-quiz/${encodeURIComponent(quizId)}/answer`,
      { question_id: questionId, option_id: optionId },
    ),
  repeatReview: (sessionId: string) =>
    authenticatedRequest<FlashcardSession>('/flashcards/review', {
      mode: 'repeat',
      session_id: sessionId,
    }),
};

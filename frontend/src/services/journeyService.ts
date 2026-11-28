import { authenticatedRequest } from './authService';

export type JourneyStep = {
  id: string;
  kind: 'review' | 'vocabulary' | 'shadowing' | 'reading' | 'writing';
  title: string;
  reason: string;
  instruction: string;
  target_id?: string;
  excerpt?: string;
  start_seconds?: number;
  minutes: number;
};
export type WritingTopic = {
  title: string;
  instruction: string;
  hint: string;
  level: string;
};
export type LearningJourney = {
  date: string;
  level: string;
  goal: string;
  knowledge: {
    reviewed_cards: number;
    due_cards: number;
    reading_passages: number;
    writing_submissions: number;
    recent_words: { word: string; reading: string; meaning: string }[];
    writing_corrections?: {
      original: string;
      replacement: string;
      explanation: string;
      title: string;
    }[];
  };
  steps: JourneyStep[];
  completed: string[];
  missing: string[];
  draft?: { id: string; text: string } | null;
  writing_topic: WritingTopic | null;
};
export const journeyService = {
  load: () => authenticatedRequest<LearningJourney>('/learning/journey'),
  complete: (date: string, stepId: string) =>
    authenticatedRequest<LearningJourney>(
      '/learning/journey/complete',
      { date, step_id: stepId },
      'POST',
    ),
  topic: (date: string) =>
    authenticatedRequest<LearningJourney>(
      '/learning/journey/writing-topic',
      { date },
      'POST',
      { timeoutMs: 45000 },
    ),
};

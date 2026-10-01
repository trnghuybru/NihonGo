import { authenticatedRequest } from './authService';

export type LearningLevel = 'beginner' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type LearningGoal =
  | 'communication'
  | 'jlpt'
  | 'travel'
  | 'work'
  | 'culture';
export interface LearningSelection {
  level: LearningLevel;
  goal: LearningGoal;
  daily_minutes: number;
}
export interface LearningProfile extends LearningSelection {
  level_source: 'manual';
  level_confirmed_at: number;
  created_at: number;
  updated_at: number;
  version: number;
}
export interface LearningOption<T extends string> {
  id: T;
  label: string;
  description: string;
}
export interface LearningOptions {
  levels: LearningOption<LearningLevel>[];
  goals: LearningOption<LearningGoal>[];
  daily_minutes: number[];
}
export interface LearningState {
  profile: LearningProfile | null;
  options: LearningOptions;
}

export const learningService = {
  load: () => authenticatedRequest<LearningState>('/learning/preferences'),
  async save(
    selection: LearningSelection,
    version: number,
  ): Promise<LearningProfile> {
    const result = await authenticatedRequest<{ profile: LearningProfile }>(
      '/learning/preferences',
      { ...selection, version, level_confirmed: true },
      'PUT',
    );
    return result.profile;
  },
};

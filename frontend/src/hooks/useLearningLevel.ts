import { createContext, useContext } from 'react';
import type { LearningLevel } from '../services/learningService';
import { JLPT_LEVELS } from '../services/vocabularyService';
import type { JlptLevel } from '../services/vocabularyService';

export const LearningLevelContext = createContext<LearningLevel>('N5');

export function toJlptLevel(level: string): JlptLevel {
  return JLPT_LEVELS.includes(level as JlptLevel) ? (level as JlptLevel) : 'N5';
}

export function useLearningLevel() {
  return useContext(LearningLevelContext);
}

export function useDefaultJlptLevel() {
  return toJlptLevel(useLearningLevel());
}

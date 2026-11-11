import { betaWeb } from './beta';

export const speakingTtsExperiment =
  import.meta.env.DEV ||
  (betaWeb && import.meta.env.VITE_BETA_SPEAKING_MODE === 'true');

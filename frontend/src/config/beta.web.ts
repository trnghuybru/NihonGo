export const betaWeb = import.meta.env.VITE_BETA_MODE === 'true';
export const betaLiveWeb = betaWeb && import.meta.env.VITE_BETA_LIVE_MODE === 'true';
export const betaAudioWeb = betaLiveWeb && import.meta.env.VITE_BETA_AUDIO_STORAGE_MODE === 'true';
export const betaGamesWeb = betaWeb && import.meta.env.VITE_BETA_GAMES_MODE === 'true';

export const aiSpeakingAvailable =
  import.meta.env.DEV ||
  (betaWeb && import.meta.env.VITE_BETA_SPEAKING_MODE === 'true');
export const aiSpeakingUnavailableMessage =
  'Tính năng Nói với AI hiện chưa khả dụng trong bản beta. Mong bạn thông cảm nhé!';

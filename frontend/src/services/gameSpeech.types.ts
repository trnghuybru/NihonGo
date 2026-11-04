export type SpeechCallbacks = {
  onText: (text: string) => void;
  onFinal: (alternatives: string[]) => void;
  onError: () => void;
  onEnd: () => void;
};
export type GameSpeech = {
  supported: boolean;
  start: (callbacks: SpeechCallbacks) => void;
  stop: () => void;
  close: () => void;
};

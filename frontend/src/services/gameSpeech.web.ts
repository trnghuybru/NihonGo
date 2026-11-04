import type { GameSpeech, SpeechCallbacks } from './gameSpeech.types';

type Alternative = { transcript: string };
type Result = ArrayLike<Alternative> & { isFinal: boolean };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<Result> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function createGameSpeech(): GameSpeech {
  const browser =
    typeof window === 'undefined' ? null : (window as SpeechWindow);
  const Constructor =
    browser?.SpeechRecognition ?? browser?.webkitSpeechRecognition;
  let recognition: Recognition | null = null;
  let generation = 0;
  const close = () => {
    generation++;
    if (!recognition) return;
    recognition.onresult = recognition.onerror = recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      /* Already stopped by the browser. */
    }
    recognition = null;
  };
  return {
    supported: Boolean(Constructor),
    start(callbacks: SpeechCallbacks) {
      close();
      if (!Constructor) {
        callbacks.onError();
        return;
      }
      const current = generation;
      let finalized = false;
      try {
        const next = new Constructor();
        recognition = next;
        next.lang = 'ja-JP';
        next.continuous = false;
        next.interimResults = true;
        next.maxAlternatives = 3;
        next.onresult = event => {
          if (current !== generation || finalized) return;
          const results = Array.from(event.results);
          callbacks.onText(
            results.map(result => result[0]?.transcript ?? '').join(''),
          );
          if (!results.length || results.some(result => !result.isFinal))
            return;
          const text = results
            .map(result => result[0]?.transcript ?? '')
            .join('')
            .trim();
          if (!text) return;
          finalized = true;
          const alternatives =
            results.length === 1
              ? Array.from(results[0])
                  .map(item => item.transcript.trim())
                  .filter(Boolean)
              : [text];
          callbacks.onFinal(
            alternatives.slice(0, 3).map(item => item.slice(0, 100)),
          );
        };
        next.onerror = () => {
          if (current === generation && !finalized) {
            finalized = true;
            callbacks.onError();
          }
        };
        next.onend = () => {
          if (current === generation && !finalized) callbacks.onEnd();
        };
        next.start();
      } catch {
        if (current === generation && !finalized) {
          finalized = true;
          callbacks.onError();
        }
      }
    },
    stop() {
      try {
        recognition?.stop();
      } catch {
        /* The session may already have ended. */
      }
    },
    close,
  };
}

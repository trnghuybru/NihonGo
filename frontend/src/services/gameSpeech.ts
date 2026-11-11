import type { GameSpeech } from './gameSpeech.types';

// Native builds retain server recognition until a native adapter is added.
export function createGameSpeech(_maxCharacters = 100): GameSpeech {
  return { supported: false, start() {}, stop() {}, close() {} };
}

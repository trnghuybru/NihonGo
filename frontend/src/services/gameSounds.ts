import { getAudioRuntime } from './audioRuntime';
import type { AudioContext } from 'react-native-audio-api';

export type GameCue = 'tick' | 'start' | 'correct' | 'incorrect' | 'finish';
const notes: Record<GameCue, number[]> = {
  tick: [660],
  start: [660, 880],
  correct: [523, 659, 784],
  incorrect: [220, 165],
  finish: [523, 659, 784, 1047],
};

// Short synthesized cues: no download, TTS or AI request.
export function createGameSounds() {
  let context: AudioContext | null = null;
  let closed = false;
  return {
    async unlock() {
      if (closed) return;
      context ??= new (getAudioRuntime().AudioContext)({ sampleRate: 24000 });
      await context.resume();
    },
    play(cue: GameCue) {
      if (!context || closed || context.state !== 'running') return;
      const rate = context.sampleRate;
      const duration = cue === 'tick' ? 0.07 : 0.12;
      const samples = Math.ceil(rate * duration);
      const buffer = context.createBuffer(1, samples * notes[cue].length, rate);
      const data = new Float32Array(buffer.length);
      notes[cue].forEach((frequency, index) => {
        for (let i = 0; i < samples; i++) {
          const envelope = Math.min(1, i / (rate * 0.008)) * (1 - i / samples);
          data[index * samples + i] =
            Math.sin((2 * Math.PI * frequency * i) / rate) * envelope * 0.12;
        }
      });
      buffer.copyToChannel(data, 0);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      node.onEnded = () => node.disconnect();
      node.start();
    },
    async close() {
      closed = true;
      await context?.close();
      context = null;
    },
  };
}

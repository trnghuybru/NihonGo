import type { AudioContext } from 'react-native-audio-api';
import { getAudioRuntime } from '../../services/audioRuntime';
import type { CastleEvent } from './engine';
export function createCastleAudio() {
  let context: AudioContext | null = null,
    lastHit = 0,
    lastBeat = -1;
  let enabled = true,
    music = true;
  const tone = (notes: number[], duration = 0.1, drum = false) => {
    if (!enabled || !context || context.state !== 'running') return;
    const rate = context.sampleRate,
      part = Math.floor(rate * duration),
      buffer = context.createBuffer(1, part * notes.length, rate),
      data = new Float32Array(buffer.length);
    notes.forEach((frequency, n) => {
      for (let i = 0; i < part; i++) {
        const t = i / rate,
          fade = Math.exp(-t / (drum ? 0.035 : 0.07));
        data[n * part + i] =
          (Math.sin(2 * Math.PI * frequency * t) +
            (drum
              ? Math.sin(2 * Math.PI * frequency * 0.51 * t) * 0.4
              : Math.sin(2 * Math.PI * frequency * 2 * t) * 0.2)) *
          fade *
          (drum ? 0.055 : 0.075);
      }
    });
    buffer.copyToChannel(data, 0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.onEnded = () => node.disconnect();
    node.start();
  };
  return {
    async unlock() {
      context ??= new (getAudioRuntime().AudioContext)({ sampleRate: 24000 });
      await context.resume();
    },
    configure(sound: boolean, background: boolean) {
      enabled = sound;
      music = background;
    },
    cue(event: CastleEvent) {
      if (event.kind === 'correct') tone([660, 880]);
      else if (event.kind === 'wrong') tone([145], 0.13, true);
      else if (event.kind === 'tier') tone([440, 660, 880]);
      else if (event.kind === 'clash' && event.at - lastHit > 140) {
        lastHit = event.at;
        tone([190], 0.06, true);
      } else if (event.kind === 'castle') tone([80, 60], 0.13, true);
      else if (event.kind === 'shield') tone([523, 784]);
      else if (event.kind === 'arrow') tone([1200, 900, 650], 0.05);
      else if (event.kind === 'end') tone([392, 523, 659, 784], 0.13);
    },
    tick() {
      tone([660], 0.05);
    },
    beat(now: number) {
      const beat = Math.floor(now / 430);
      if (!music || beat === lastBeat) return;
      lastBeat = beat;
      if (beat % 2 === 0) tone([beat % 8 === 0 ? 85 : 120], 0.12, true);
      if (beat % 4 === 1)
        tone([[220, 246.94, 329.63, 392, 440][Math.floor(beat / 4) % 5]], 0.17);
    },
    async close() {
      const old = context;
      context = null;
      await old?.close();
    },
  };
}

import type {
  AudioContext,
  AudioBufferSourceNode,
} from 'react-native-audio-api';
import { recordingPlaybackGain } from './audioLoudness';

// One player per conversation, shared by the chat and transcript popup.
export class AudioReplay {
  private context: AudioContext | null = null;
  private node: AudioBufferSourceNode | null = null;
  private controller: AbortController | null = null;
  private generation = 0;

  stop() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    if (this.node) {
      this.node.onEnded = null;
      this.node.stop();
      this.node.disconnect();
      this.node = null;
    }
  }

  async play(url: string, onEnded: () => void, normalizeMicrophone = false) {
    this.stop();
    const current = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Không tải được bản thu âm.');
      const bytes = await response.arrayBuffer();
      if (current !== this.generation) return false;
      if (!this.context) {
        const { AudioContext: Context, AudioManager } =
          require('react-native-audio-api') as typeof import('react-native-audio-api');
        // Match Live's session so replay works on read-only history without disabling the next mic turn.
        AudioManager.setAudioSessionOptions({
          iosCategory: 'playAndRecord',
          iosMode: 'default',
          iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
        });
        this.context = new Context({ sampleRate: 48000 });
      }
      await this.context.resume();
      const buffer = await this.context.decodeAudioData(bytes);
      if (current !== this.generation) return false;
      if (normalizeMicrophone && buffer.numberOfChannels === 1) {
        const samples = buffer.getChannelData(0);
        const gain = recordingPlaybackGain(samples);
        if (gain > 1) {
          for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
          buffer.copyToChannel(samples, 0);
        }
      }
      const node = this.context.createBufferSource();
      node.buffer = buffer;
      node.connect(this.context.destination);
      node.onEnded = () => {
        node.disconnect();
        if (this.node === node) this.node = null;
        if (current === this.generation) onEnded();
      };
      this.node = node;
      node.start();
      return true;
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = null;
    }
  }

  async close() {
    this.stop();
    const context = this.context;
    this.context = null;
    await context?.close();
  }
}

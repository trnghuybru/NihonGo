import { fromByteArray, toByteArray } from 'base64-js';
import { MicrophoneResampler } from './microphoneResampler';
import type {
  AudioContext,
  AudioRecorder,
  AudioBufferSourceNode,
} from 'react-native-audio-api';

// Gemini uses signed PCM16 little-endian. Recorder may deliver a different hardware rate.
export function encodePcm(
  samples: Float32Array,
  sampleRate: number,
  targetRate = 16000,
): string {
  const count = Math.floor((samples.length * targetRate) / sampleRate);
  const bytes = new Uint8Array(count * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < count; i += 1) {
    const position = (i * sampleRate) / targetRate;
    const left = Math.floor(position);
    const weight = position - left;
    const value = Math.max(
      -1,
      Math.min(
        1,
        samples[left] * (1 - weight) +
          (samples[left + 1] ?? samples[left]) * weight,
      ),
    );
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return fromByteArray(bytes);
}
export function decodePcm(encoded: string): Float32Array {
  const bytes = toByteArray(encoded);
  if (bytes.length % 2) throw new Error('Dữ liệu âm thanh không hợp lệ.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i += 1)
    samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}

// Metering reads the same PCM buffer; it never alters the streamed samples.
export function microphoneLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return Math.max(0, Math.min(1, (rms - 0.008) / 0.12));
}

export class LiveAudio {
  private context: AudioContext | null = null;
  private recorder: AudioRecorder | null = null;
  private nodes = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private disposed = false;
  private epoch = 0;
  private recordingStart: Promise<void> | null = null;
  private playbackQueue: Promise<void> = Promise.resolve();
  private playbackEpoch = 0;
  private playbackNeedsResume = true;
  private pendingPlayback = 0;
  constructor(
    private onPlaying: (value: boolean) => void,
    private onError: (message: string) => void,
  ) {}
  async prepare() {
    const {
      AudioContext: Context,
      AudioRecorder: Recorder,
      AudioManager,
    } = require('react-native-audio-api') as typeof import('react-native-audio-api');
    if (this.disposed) return;
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'default',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    });
    this.context = new Context({ sampleRate: 24000 });
    this.recorder = new Recorder();
    this.recorder.onError(() =>
      this.onError('Không thể thu âm. Kiểm tra quyền microphone và thử lại.'),
    );
    await this.context.resume();
  }
  async start(
    onChunk: (pcm: string) => void,
    onLevel?: (level: number) => void,
    onRecording?: (pcm: string, sampleRate: 44100 | 48000) => void,
  ) {
    const epoch = ++this.epoch;
    this.recordingStart = (async () => {
      const { AudioManager } =
        require('react-native-audio-api') as typeof import('react-native-audio-api');
      if ((await AudioManager.requestRecordingPermissions()) !== 'Granted')
        throw new Error('Chưa được cấp quyền microphone.');
      if (this.disposed || epoch !== this.epoch) return;
      if (!this.recorder) throw new Error('Âm thanh chưa sẵn sàng.');
      this.stopPlayback();
      const preferredRate = AudioManager.getDevicePreferredSampleRate();
      const recordingRate = preferredRate === 44100 ? 44100 : 48000;
      let resampler: MicrophoneResampler | null = null;
      let inputRate = 0;
      const registration = this.recorder.onAudioReady(
        {
          sampleRate: recordingRate,
          bufferLength: recordingRate / 10,
          channelCount: 1,
        },
        ({ buffer, numFrames }) => {
          if (!this.disposed && epoch === this.epoch) {
            const samples = buffer.getChannelData(0).subarray(0, numFrames);
            onLevel?.(microphoneLevel(samples));
            // Native callbacks should honor the requested rate. Never label a
            // different rate as high-quality PCM in a stored WAV.
            if (onRecording && buffer.sampleRate !== recordingRate) {
              this.onError(
                'Tần số thu âm đã thay đổi. Hãy kết nối lại để thu tiếp.',
              );
              return;
            }
            onRecording?.(
              encodePcm(samples, recordingRate, recordingRate),
              recordingRate,
            );
            if (buffer.sampleRate === 16000) {
              onChunk(encodePcm(samples, 16000));
            } else {
              if (inputRate !== buffer.sampleRate) {
                inputRate = buffer.sampleRate;
                resampler = new MicrophoneResampler(inputRate);
              }
              const streamed = resampler!.process(samples);
              if (streamed.length) onChunk(encodePcm(streamed, 16000));
            }
          }
        },
      );
      if (registration.status === 'error')
        throw new Error(registration.message);
      const result = await this.recorder.start();
      if (result.status === 'error') throw new Error(result.message);
      if (this.disposed || epoch !== this.epoch) await this.recorder.stop();
    })();
    return this.recordingStart;
  }
  async stop() {
    await this.recordingStart?.catch(() => undefined);
    // Keep the callback enabled until stop flushes the last audio chunk.
    await this.recorder?.stop();
    this.epoch += 1;
    this.recorder?.clearOnAudioReady();
    this.recordingStart = null;
  }
  play(pcm: string): Promise<void> {
    const context = this.context;
    if (!context || this.disposed) return Promise.resolve();
    const samples = decodePcm(pcm);
    if (!samples.length) return Promise.resolve();
    const epoch = this.playbackEpoch;
    this.pendingPlayback += 1;
    this.playbackQueue = this.playbackQueue.then(async () => {
      try {
        if (this.disposed || epoch !== this.playbackEpoch) return;
        if (this.playbackNeedsResume) {
          this.playbackNeedsResume = false;
          const { AudioManager } =
            require('react-native-audio-api') as typeof import('react-native-audio-api');
          // The native engine can be rebuilt after recording or a route change
          // while the JS context still reports running. Restart its driver.
          await context.suspend();
          await AudioManager.setAudioSessionActivity(true);
          await context.resume();
          if (this.disposed || epoch !== this.playbackEpoch) return;
        }
        this.schedulePlayback(context, samples);
      } catch {
        if (!this.disposed && epoch === this.playbackEpoch) {
          this.playbackNeedsResume = true;
          this.onError('Không thể phát âm thanh của Aoi. Hãy kết nối lại.');
        }
      } finally {
        this.pendingPlayback -= 1;
      }
    });
    return this.playbackQueue;
  }
  private schedulePlayback(context: AudioContext, samples: Float32Array) {
    const start = Math.max(context.currentTime + 0.02, this.nextTime);
    if (start - context.currentTime > 30)
      throw new Error('Âm thanh bị trễ. Hãy kết nối lại.');
    const buffer = context.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    this.nodes.add(node);
    node.onEnded = () => {
      node.disconnect();
      this.nodes.delete(node);
      if (!this.nodes.size && !this.pendingPlayback) {
        this.playbackNeedsResume = true;
        this.onPlaying(false);
      }
    };
    this.nextTime = start + samples.length / 24000;
    this.onPlaying(true);
    node.start(start);
  }
  stopPlayback() {
    this.playbackEpoch += 1;
    this.playbackNeedsResume = true;
    this.nodes.forEach(node => {
      node.onEnded = null;
      node.stop();
      node.disconnect();
    });
    this.nodes.clear();
    this.nextTime = 0;
    this.onPlaying(false);
  }
  async dispose() {
    this.disposed = true;
    this.epoch += 1;
    await this.stop();
    this.stopPlayback();
    await this.playbackQueue;
    await this.context?.close();
    this.context = null;
    this.recorder = null;
  }
}

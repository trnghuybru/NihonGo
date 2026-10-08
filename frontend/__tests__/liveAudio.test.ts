import { toByteArray } from 'base64-js';
import {
  encodePcm,
  decodePcm,
  microphoneLevel,
} from '../src/services/liveAudio';
test('encodes signed PCM16 little endian with clipping', () => {
  const bytes = toByteArray(encodePcm(new Float32Array([-2, 0, 2]), 16000));
  expect(Array.from(bytes)).toEqual([0, 128, 0, 0, 255, 127]);
  expect(Array.from(decodePcm('AIAAAP9/'))).toEqual([-1, 0, 32767 / 32768]);
});
test('resamples hardware 48k input to the 16k Gemini stream', () => {
  expect(
    decodePcm(encodePcm(new Float32Array([0, 1, 1, -1, 0, 0]), 48000)),
  ).toEqual(new Float32Array([0, -1]));
});
test('rejects a truncated PCM sample', () => {
  expect(() => decodePcm('AA==')).toThrow('âm thanh');
});

jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn(),
  AudioRecorder: jest.fn(),
  AudioManager: {
    setAudioSessionOptions: jest.fn(),
    requestRecordingPermissions: jest.fn(),
  },
}));

import {
  AudioContext,
  AudioRecorder,
  AudioManager,
} from 'react-native-audio-api';
import { LiveAudio } from '../src/services/liveAudio';
const recorder = {
  onError: jest.fn(),
  onAudioReady: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  clearOnAudioReady: jest.fn(),
};
function source() {
  return {
    buffer: null,
    onEnded: null as (() => void) | null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  };
}
const context = {
  currentTime: 1,
  destination: {},
  resume: jest.fn(),
  close: jest.fn(),
  createBuffer: jest.fn(),
  createBufferSource: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(AudioContext)
    .mockImplementation(() => context as unknown as AudioContext);
  jest
    .mocked(AudioRecorder)
    .mockImplementation(() => recorder as unknown as AudioRecorder);
  jest
    .mocked(AudioManager.requestRecordingPermissions)
    .mockResolvedValue('Granted');
  recorder.start.mockResolvedValue({ status: 'success' });
  recorder.stop.mockResolvedValue({ status: 'success' });
  recorder.onAudioReady.mockReturnValue({ status: 'success' });
  context.createBuffer.mockImplementation((_channels, length) => ({
    getChannelData: () => new Float32Array(length),
  }));
});
test('requests permission and flushes the final recording chunk before removing its callback', async () => {
  const audio = new LiveAudio(jest.fn(), jest.fn());
  await audio.prepare();
  const chunks = jest.fn();
  await audio.start(chunks);
  const callback = recorder.onAudioReady.mock.calls[0][1];
  const event = {
    buffer: {
      sampleRate: 16000,
      getChannelData: () => new Float32Array([0, 1, 0]),
    },
    numFrames: 2,
  };
  recorder.stop.mockImplementationOnce(async () => {
    callback(event);
    return { status: 'success' };
  });
  await audio.stop();
  expect(chunks).toHaveBeenCalledWith(
    encodePcm(new Float32Array([0, 1]), 16000),
  );
  callback(event);
  expect(chunks).toHaveBeenCalledTimes(1);
  expect(recorder.clearOnAudioReady).toHaveBeenCalled();
  await audio.dispose();
});
test('queues 24k playback without overlap and stops mouth animation after the last buffer', async () => {
  const playing = jest.fn();
  const audio = new LiveAudio(playing, jest.fn());
  await audio.prepare();
  const first = source();
  const second = source();
  context.createBufferSource
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second);
  const pcm = encodePcm(new Float32Array(2400), 16000);
  audio.play(pcm);
  audio.play(pcm);
  expect(context.createBuffer).toHaveBeenCalledWith(1, 2400, 24000);
  expect(first.start).toHaveBeenCalledWith(1.02);
  expect(second.start.mock.calls[0][0]).toBeCloseTo(1.12);
  first.onEnded?.();
  expect(playing).toHaveBeenLastCalledWith(true);
  second.onEnded?.();
  expect(playing).toHaveBeenLastCalledWith(false);
  await audio.dispose();
  expect(context.close).toHaveBeenCalled();
});
test('a denied microphone permission never starts native recording', async () => {
  jest
    .mocked(AudioManager.requestRecordingPermissions)
    .mockResolvedValue('Denied');
  const audio = new LiveAudio(jest.fn(), jest.fn());
  await audio.prepare();
  await expect(audio.start(jest.fn())).rejects.toThrow('quyền microphone');
  expect(recorder.start).not.toHaveBeenCalled();
  await audio.dispose();
});

test('meter is silent below the noise floor and responds to waveform energy', () => {
  expect(microphoneLevel(new Float32Array())).toBe(0);
  expect(microphoneLevel(new Float32Array([0.001, -0.001]))).toBe(0);
  expect(microphoneLevel(new Float32Array([0.06, -0.06]))).toBeGreaterThan(0.3);
  expect(microphoneLevel(new Float32Array([1, -1]))).toBe(1);
});
test('reports microphone energy without changing the streamed PCM samples', async () => {
  const audio = new LiveAudio(jest.fn(), jest.fn());
  await audio.prepare();
  const chunk = jest.fn();
  const meter = jest.fn();
  await audio.start(chunk, meter);
  const samples = new Float32Array([0.05, -0.05]);
  recorder.onAudioReady.mock.calls[0][1]({
    buffer: { sampleRate: 16000, getChannelData: () => samples },
    numFrames: 2,
  });
  expect(meter).toHaveBeenCalledWith(microphoneLevel(samples));
  expect(chunk).toHaveBeenCalledWith(encodePcm(samples, 16000));
  await audio.stop();
  await audio.dispose();
});

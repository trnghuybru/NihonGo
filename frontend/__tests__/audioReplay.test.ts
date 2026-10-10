import { AudioReplay } from '../src/services/audioReplay';
import { AudioContext } from 'react-native-audio-api';

jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn(),
  AudioManager: { setAudioSessionOptions: jest.fn() },
}));
const source = {
  buffer: null,
  onEnded: null as (() => void) | null,
  connect: jest.fn(),
  disconnect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};
const context = {
  destination: {},
  resume: jest.fn(),
  decodeAudioData: jest.fn(),
  createBufferSource: jest.fn(),
  close: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  source.onEnded = null;
  jest
    .mocked(AudioContext)
    .mockImplementation(() => context as unknown as AudioContext);
  context.resume.mockResolvedValue(undefined);
  context.decodeAudioData.mockResolvedValue({ duration: 1 });
  context.createBufferSource.mockReturnValue(source);
  context.close.mockResolvedValue(undefined);
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(48),
  });
});

test('decodes downloaded audio, plays once and releases the native context', async () => {
  const player = new AudioReplay();
  const ended = jest.fn();
  expect(await player.play('http://s3/signed', ended)).toBe(true);
  expect(context.decodeAudioData).toHaveBeenCalledWith(expect.any(ArrayBuffer));
  expect(source.start).toHaveBeenCalledTimes(1);
  source.onEnded!();
  expect(ended).toHaveBeenCalledTimes(1);
  await player.close();
  expect(context.close).toHaveBeenCalledTimes(1);
});

test('stopping during download prevents late playback', async () => {
  let resolve!: (response: Response) => void;
  jest.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise<Response>(done => {
        resolve = done;
      }),
  );
  const player = new AudioReplay();
  const pending = player.play('http://s3/signed', jest.fn());
  player.stop();
  resolve({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(48),
  } as Response);
  expect(await pending).toBe(false);
  expect(source.start).not.toHaveBeenCalled();
  await player.close();
});

test('starting another recording stops the previous source', async () => {
  const player = new AudioReplay();
  await player.play('http://s3/first', jest.fn());
  await player.play('http://s3/second', jest.fn());
  expect(source.stop).toHaveBeenCalledTimes(1);
  expect(source.start).toHaveBeenCalledTimes(2);
  await player.close();
});

test('boosts quiet user replay while preserving frame count and sample rate', async () => {
  const samples = new Float32Array([0.01, -0.01, 0.02, -0.02]);
  const buffer = {
    numberOfChannels: 1,
    sampleRate: 16000,
    length: samples.length,
    getChannelData: () => samples,
    copyToChannel: jest.fn(),
  };
  context.decodeAudioData.mockResolvedValue(buffer);
  const player = new AudioReplay();
  await player.play('http://s3/user', jest.fn(), true);
  expect(Math.abs(samples[0])).toBeGreaterThan(0.05);
  expect(buffer.copyToChannel).toHaveBeenCalledWith(samples, 0);
  expect(source.buffer).toBe(buffer);
  expect(buffer.sampleRate).toBe(16000);
  expect(buffer.length).toBe(4);
  await player.close();
});

test('leaves AI playback samples unchanged', async () => {
  const samples = new Float32Array([0.01, -0.01]);
  const buffer = {
    numberOfChannels: 1,
    getChannelData: () => samples,
    copyToChannel: jest.fn(),
  };
  context.decodeAudioData.mockResolvedValue(buffer);
  const player = new AudioReplay();
  await player.play('http://s3/ai', jest.fn(), false);
  expect(samples).toEqual(new Float32Array([0.01, -0.01]));
  expect(buffer.copyToChannel).not.toHaveBeenCalled();
  await player.close();
});

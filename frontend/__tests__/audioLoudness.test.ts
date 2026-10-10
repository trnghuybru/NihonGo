import { recordingPlaybackGain } from '../src/services/audioLoudness';

test('brings a quiet microphone toward speech level without changing its waveform', () => {
  const samples = new Float32Array([0.008, -0.008, 0.016, -0.016]);
  const original = samples.slice();
  const gain = recordingPlaybackGain(samples);
  const rms = Math.sqrt(
    samples.reduce((sum, sample) => sum + (sample * gain) ** 2, 0) /
      samples.length,
  );
  expect(rms).toBeCloseTo(0.1);
  expect(samples).toEqual(original);
});

test('a loud transient limits amplification before clipping', () => {
  const samples = new Float32Array(16000).fill(0.005);
  samples[100] = -0.8;
  const gain = recordingPlaybackGain(samples);
  expect(gain).toBeGreaterThan(1);
  expect(Math.abs(samples[100]) * gain).toBeCloseTo(0.95);
});

test('caps amplification for an extremely quiet recording', () => {
  const samples = new Float32Array(16000).fill(0.0015);
  samples[0] = 0.015;
  expect(recordingPlaybackGain(samples)).toBeLessThanOrEqual(20);
});

test('leaves silence, noise floor and normal speech alone', () => {
  for (const samples of [
    new Float32Array(),
    new Float32Array(100),
    new Float32Array([0.0005, -0.0005]),
    new Float32Array([0.2, -0.2]),
    new Float32Array([Number.NaN]),
  ]) {
    expect(recordingPlaybackGain(samples)).toBe(1);
  }
});

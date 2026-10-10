import { MicrophoneResampler } from '../src/services/microphoneResampler';

function tone(rate: number, frequency: number) {
  return Float32Array.from({ length: rate }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / rate),
  );
}
function rms(samples: Float32Array) {
  const settled = samples.subarray(100);
  return Math.sqrt(settled.reduce((sum, x) => sum + x * x, 0) / settled.length);
}

test.each([44100, 48000])(
  'preserves duration and waveform across uneven %i Hz callbacks',
  rate => {
    const samples = tone(rate, 1000);
    const expected = new MicrophoneResampler(rate).process(samples);
    const resampler = new MicrophoneResampler(rate);
    const pieces: number[] = [];
    for (let offset = 0; offset < samples.length; offset += 997) {
      pieces.push(...resampler.process(samples.subarray(offset, offset + 997)));
    }
    expect(pieces).toHaveLength(16000);
    expect(new Float32Array(pieces)).toEqual(expected);
    expect(rms(expected)).toBeGreaterThan(0.65);
  },
);

test.each([44100, 48000])(
  'removes frequencies that would alias into Gemini speech at %i Hz',
  rate => {
    const speech = new MicrophoneResampler(rate).process(tone(rate, 1000));
    const high = new MicrophoneResampler(rate).process(tone(rate, 12000));
    expect(rms(high) / rms(speech)).toBeLessThan(0.01);
  },
);

import { fromByteArray } from 'base64-js';
import { PcmRecording } from '../src/services/audioRecording';

test.each([16000, 24000, 44100, 48000] as const)(
  'writes a playable mono PCM16 WAV at %i Hz',
  rate => {
    const recording = new PcmRecording(rate);
    const pcm = new Uint8Array(rate * 2);
    pcm[0] = 1;
    recording.append(fromByteArray(pcm.subarray(0, rate)));
    recording.append(fromByteArray(pcm.subarray(rate)));
    const wav = recording.finish()!;
    const view = new DataView(wav.bytes.buffer);
    expect(String.fromCharCode(...wav.bytes.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.bytes.subarray(8, 12))).toBe('WAVE');
    expect(view.getUint32(4, true)).toBe(wav.bytes.length - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(rate);
    expect(view.getUint32(40, true)).toBe(pcm.length);
    expect(wav.bytes.subarray(44)).toEqual(pcm);
    expect(wav.durationMs).toBe(1000);
    expect(recording.finish()).toBeNull();
  },
);

test('rejects broken samples and bounds each recording to three minutes', () => {
  const recording = new PcmRecording(16000);
  expect(() => recording.append('AA==')).toThrow('không hợp lệ');
  expect(() =>
    recording.append(fromByteArray(new Uint8Array(16000 * 2 * 180 + 2))),
  ).toThrow('3 phút');
});

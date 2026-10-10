// A fixed gain for the whole utterance avoids pumping between words and pauses.
// Keep the stored PCM unchanged; only compensate quiet microphones during replay.
export function recordingPlaybackGain(samples: Float32Array): number {
  if (!samples.length) return 1;
  let energy = 0;
  let peak = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return 1;
    energy += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = Math.sqrt(energy / samples.length);
  // Avoid amplifying near-silence. Limit gain to 26 dB and leave peak headroom.
  if (rms < 0.001 || peak < 0.01) return 1;
  return Math.max(1, Math.min(20, 0.1 / rms, 0.95 / peak));
}

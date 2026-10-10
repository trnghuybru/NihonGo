// Low-pass before downsampling, preserving filter history and fractional timing
// across native callbacks (including the 44.1 kHz simulator).
export class MicrophoneResampler {
  private taps = new Float64Array(63);
  private history = new Float32Array(64);
  private cursor = 0;
  private frames = 0;
  private outputFrames = 0;
  constructor(private inputRate: number) {
    const cutoff = Math.min(7000 / inputRate, 0.45);
    let sum = 0;
    for (let i = 0; i < this.taps.length; i += 1) {
      const x = i - 31;
      const sinc =
        x === 0
          ? 2 * cutoff
          : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
      const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / 62);
      this.taps[i] = sinc * window;
      sum += this.taps[i];
    }
    for (let i = 0; i < this.taps.length; i += 1) this.taps[i] /= sum;
  }
  process(samples: Float32Array): Float32Array {
    const output = new Float32Array(
      Math.floor(((this.frames + samples.length) * 16000) / this.inputRate) -
        this.outputFrames,
    );
    let written = 0;
    for (const sample of samples) {
      this.history[this.cursor] = sample;
      this.frames += 1;
      const position = ((this.outputFrames + 1) * this.inputRate) / 16000;
      if (this.frames >= position) {
        let current = 0;
        let previous = 0;
        for (let i = 0; i < this.taps.length; i += 1) {
          current += this.taps[i] * this.history[(this.cursor - i + 64) % 64];
          previous +=
            this.taps[i] * this.history[(this.cursor - i - 1 + 64) % 64];
        }
        const fraction = position - (this.frames - 1);
        output[written++] = previous * (1 - fraction) + current * fraction;
        this.outputFrames += 1;
      }
      this.cursor = (this.cursor + 1) % 64;
    }
    return output;
  }
}

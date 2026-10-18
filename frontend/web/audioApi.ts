// Browser adapter for the narrow audio API used by LiveAudio and AudioReplay.
export class AudioContext extends window.AudioContext {
  createBufferSource(): AudioBufferSourceNode {
    const node = super.createBufferSource();
    Object.defineProperty(node, 'onEnded', {
      get: () => node.onended,
      set: value => {
        node.onended = value;
      },
    });
    return node;
  }
}
export const AudioManager = {
  setAudioSessionOptions() {},
  async setAudioSessionActivity(_active: boolean) {
    return true;
  },
  async requestRecordingPermissions() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Microphone cần HTTPS hoặc localhost.');
    return 'Granted';
  },
  getDevicePreferredSampleRate() {
    return 48000;
  },
};
type Ready = (event: { buffer: AudioBuffer; numFrames: number }) => void;
export class AudioRecorder {
  private callback: Ready | null = null;
  private error: (() => void) | null = null;
  private context: globalThis.AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private input: MediaStreamAudioSourceNode | null = null;
  private epoch = 0;
  onError(callback: () => void) {
    this.error = callback;
  }
  onAudioReady(_options: unknown, callback: Ready) {
    this.callback = callback;
    return true;
  }
  clearOnAudioReady() {
    this.callback = null;
  }
  async start() {
    const epoch = ++this.epoch;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (epoch !== this.epoch) {
        stream.getTracks().forEach(track => track.stop());
        return { status: 'success' };
      }
      this.stream = stream;
      const context = new window.AudioContext({ sampleRate: 48000 });
      this.context = context;
      await context.resume();
      this.input = context.createMediaStreamSource(stream);
      // Preview adapter. Use AudioWorklet for production audio processing.
      this.processor = context.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = event => {
        if (epoch === this.epoch)
          this.callback?.({
            buffer: event.inputBuffer,
            numFrames: event.inputBuffer.length,
          });
      };
      this.input.connect(this.processor);
      this.processor.connect(context.destination);
      return { status: 'success' };
    } catch (failure) {
      await this.stop();
      this.error?.();
      throw failure;
    }
  }
  async stop() {
    this.epoch += 1;
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    this.input?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    const context = this.context;
    this.processor = null;
    this.input = null;
    this.stream = null;
    this.context = null;
    await context?.close();
  }
}

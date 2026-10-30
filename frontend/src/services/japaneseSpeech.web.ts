export class JapaneseSpeech {
  private generation = 0;
  private utterance?: SpeechSynthesisUtterance;
  private cancelWait?: () => void;

  stop() {
    this.generation++;
    this.cancelWait?.();
    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
      window.speechSynthesis.cancel();
      this.utterance = undefined;
    }
  }

  async speak(text: string, onEnd: () => void, onError: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error('Trình duyệt chưa hỗ trợ đọc từ vựng.');
    }
    const generation = ++this.generation;
    const synth = window.speechSynthesis;
    const japaneseVoice = () =>
      synth.getVoices().find(voice => /^ja(?:[-_]|$)/i.test(voice.lang));
    if (!japaneseVoice()) {
      await new Promise<void>(resolve => {
        const done = () => {
          clearTimeout(timer);
          synth.removeEventListener('voiceschanged', changed);
          this.cancelWait = undefined;
          resolve();
        };
        const changed = () => {
          if (japaneseVoice()) done();
        };
        const timer = setTimeout(done, 2000);
        this.cancelWait = done;
        synth.addEventListener('voiceschanged', changed);
      });
    }
    if (generation !== this.generation) return;
    const voice = japaneseVoice();
    if (!voice)
      throw new Error(
        'Thiết bị chưa có giọng tiếng Nhật. Hãy tải giọng Nhật trong cài đặt giọng nói.',
      );
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.voice = voice;
    utterance.onend = () => {
      if (generation === this.generation) {
        this.utterance = undefined;
        onEnd();
      }
    };
    utterance.onerror = () => {
      if (generation === this.generation) {
        this.utterance = undefined;
        onError();
      }
    };
    this.utterance = utterance;
    synth.speak(utterance);
  }
}

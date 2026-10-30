import Tts from 'react-native-tts';

export class JapaneseSpeech {
  private generation = 0;
  private cleanup?: () => void;

  stop() {
    this.generation++;
    this.cleanup?.();
    this.cleanup = undefined;
    Tts.stop().catch(() => undefined);
  }

  async speak(text: string, onEnd: () => void, onError: () => void) {
    const generation = ++this.generation;
    try {
      await Tts.getInitStatus();
    } catch {
      throw new Error(
        'Thiết bị chưa có bộ đọc văn bản. Hãy bật bộ đọc và tải giọng tiếng Nhật trong cài đặt.',
      );
    }
    const voices = await Tts.voices();
    if (generation !== this.generation) return;
    const voice = voices
      .filter(
        item => /^ja(?:[-_]|$)/i.test(item.language) && !item.notInstalled,
      )
      .sort(
        (a, b) =>
          Number(a.networkConnectionRequired) -
          Number(b.networkConnectionRequired),
      )[0];
    if (!voice)
      throw new Error(
        'Thiết bị chưa có giọng tiếng Nhật. Hãy tải giọng Nhật trong cài đặt chuyển văn bản thành giọng nói.',
      );
    await Tts.setDefaultLanguage('ja-JP');
    await Tts.setDefaultVoice(voice.id);
    if (generation !== this.generation) return;
    let id: string | number | undefined;
    const pendingEvents: {
      event: { utteranceId: string | number };
      failed: boolean;
    }[] = [];
    const finish = (
      event: { utteranceId: string | number },
      failed: boolean,
    ) => {
      if (id === undefined) {
        pendingEvents.push({ event, failed });
        return;
      }
      if (
        generation !== this.generation ||
        (id !== undefined && event.utteranceId !== id)
      )
        return;
      this.cleanup?.();
      this.cleanup = undefined;
      if (failed) onError();
      else onEnd();
    };
    // The library returns an emitter subscription despite its void TypeScript signature.
    const end = Tts.addEventListener('tts-finish', event =>
      finish(event, false),
    ) as unknown as { remove: () => void };
    const error = Tts.addEventListener('tts-error', event =>
      finish(event, true),
    ) as unknown as { remove: () => void };
    const cancel = Tts.addEventListener('tts-cancel', event =>
      finish(event, false),
    ) as unknown as { remove: () => void };
    this.cleanup = () => {
      cancel.remove();
      end.remove();
      error.remove();
    };
    id = await Tts.speak(text);
    pendingEvents.forEach(item => finish(item.event, item.failed));
  }
}

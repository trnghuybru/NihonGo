import { Platform, NativeModules } from 'react-native';

export interface TTSOptions {
  language?: string;
  rate?: number;
  pitch?: number;
}

export type TTSStatusCallback = (isSpeaking: boolean) => void;

let cachedTtsModule: any = null;

function getTtsModule(): any | null {
  if (cachedTtsModule) return cachedTtsModule;
  // Chỉ nạp react-native-tts khi NativeModules.TextToSpeech thực sự tồn tại trong native binary
  if (NativeModules.TextToSpeech) {
    try {
      const mod = require('react-native-tts');
      cachedTtsModule = mod.default || mod;
      return cachedTtsModule;
    } catch (err) {
      console.warn('Không thể nạp react-native-tts:', err);
      return null;
    }
  }
  return null;
}

class TTSService {
  private isInitialized = false;
  private isSpeaking = false;
  private buffer = '';
  private onStatusChange: TTSStatusCallback | null = null;
  private queuedSentencesCount = 0;

  public isAvailable(): boolean {
    return Boolean(NativeModules.TextToSpeech);
  }

  public async init(onStatusChange?: TTSStatusCallback): Promise<void> {
    this.onStatusChange = onStatusChange || null;
    if (this.isInitialized) return;

    const tts = getTtsModule();
    if (!tts) {
      console.warn(
        '[TTSService] NativeModules.TextToSpeech chưa được nạp. Hãy chạy `cd ios && pod install` và build lại app.',
      );
      return;
    }

    try {
      await tts.getInitStatus();

      // Cấu hình ngôn ngữ mặc định (ưu tiên Tiếng Nhật cho Kaiwa)
      try {
        await tts.setDefaultLanguage('ja-JP');
      } catch {
        console.log('Tiếng Nhật chưa được cài đặt trên TTS, dùng ngôn ngữ mặc định hệ thống');
      }

      // Phát âm thanh qua loa ngay cả khi iPhone gạt nút im lặng (Silent Switch)
      if (Platform.OS === 'ios') {
        try {
          await tts.setIgnoreSilentSwitch('ignore');
        } catch (e) {
          console.warn('Lỗi cấu hình ignoreSilentSwitch:', e);
        }
      }

      // Tối ưu tốc độ nói và cao độ cho tự nhiên (0.50 cho tiếng Nhật giúp người học nghe rõ)
      try {
        await tts.setDefaultRate(Platform.OS === 'ios' ? 0.5 : 0.95);
      } catch (rateErr) {
        console.log('setDefaultRate không áp dụng được qua bridge, sẽ truyền rate khi gọi speak:', rateErr);
      }

      try {
        await tts.setDefaultPitch(1.0);
      } catch (pitchErr) {
        console.log('setDefaultPitch bỏ qua:', pitchErr);
      }

      // Đăng ký event listeners
      tts.addEventListener('tts-start', () => {
        this.isSpeaking = true;
        this.onStatusChange?.(true);
      });

      tts.addEventListener('tts-finish', () => {
        this.queuedSentencesCount = Math.max(0, this.queuedSentencesCount - 1);
        if (this.queuedSentencesCount === 0 && this.buffer.trim() === '') {
          this.isSpeaking = false;
          this.onStatusChange?.(false);
        }
      });

      tts.addEventListener('tts-cancel', () => {
        this.queuedSentencesCount = 0;
        this.isSpeaking = false;
        this.onStatusChange?.(false);
      });

      this.isInitialized = true;
    } catch (err) {
      console.warn('Khởi tạo TTS thất bại:', err);
    }
  }

  /**
   * Thay đổi ngôn ngữ đọc của TTS (ja-JP, vi-VN, en-US)
   */
  public async setLanguage(language: string): Promise<void> {
    const tts = getTtsModule();
    if (!tts) return;
    try {
      await tts.setDefaultLanguage(language);
      if (Platform.OS === 'ios') {
        const rate = language.startsWith('ja') ? 0.5 : 0.52;
        await tts.setDefaultRate(rate);
      }
    } catch (err) {
      console.warn(`Không thể đổi ngôn ngữ TTS sang ${language}:`, err);
    }
  }

  /**
   * Kỹ thuật "Sentence-Level Streaming Buffer":
   * Nhận từng token từ SSE stream. Tách các câu hoàn chỉnh (bao gồm dấu câu tiếng Nhật: 。, ？, ！ và latin: ., ?, !, ;, \n)
   * và đẩy ngay vào queue Tts.speak() mà không chờ toàn bộ câu trả lời hoàn tất.
   */
  public feedToken(token: string): void {
    this.buffer += token;

    // Vòng lặp tách hết tất cả các câu đã hoàn chỉnh trong buffer (hỗ trợ cả dấu câu tiếng Nhật 。？！ và latin .?!;\n)
    while (true) {
      const sentenceEndRegex = /^([\s\S]*?[。？！.?!;\n]+)([\s\S]*)$/;
      const match = this.buffer.match(sentenceEndRegex);

      if (match) {
        const sentenceToSpeak = match[1].trim();
        this.buffer = match[2];

        if (sentenceToSpeak.length > 0) {
          this.speakSentence(sentenceToSpeak);
        }
      } else {
        // Nếu buffer dài hơn 30 ký tự tiếng Nhật hoặc 60 ký tự latin và gặp dấu phẩy (、 / ,), ngắt câu sớm để giảm độ trễ
        const commaBreakRegex = /^([\s\S]*?[、,])([\s\S]*)$/;
        const commaMatch =
          this.buffer.length > 30 ? this.buffer.match(commaBreakRegex) : null;
        if (commaMatch) {
          const sentenceToSpeak = commaMatch[1].trim();
          this.buffer = commaMatch[2];
          if (sentenceToSpeak.length > 0) {
            this.speakSentence(sentenceToSpeak);
          }
        } else {
          break;
        }
      }
    }
  }

  /**
   * Đẩy phần chữ còn lại trong buffer vào TTS khi SSE stream kết thúc [DONE].
   */
  public flush(): void {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (remaining.length > 0) {
      this.speakSentence(remaining);
    }
  }

  private speakSentence(text: string): void {
    // Làm sạch các ký tự markdown, emoji, link hoặc ký tự lạ trước khi đọc
    const cleaned = text
      .replace(/[*#_~`>[\]()\\/]/g, '')
      .replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return;

    const tts = getTtsModule();
    if (!tts) {
      console.log('[TTS Simulation (Chưa liên kết Native Module)]:', cleaned);
      return;
    }

    this.queuedSentencesCount++;
    this.isSpeaking = true;
    this.onStatusChange?.(true);

    try {
      if (Platform.OS === 'ios') {
        tts.speak(cleaned, { rate: 0.50 });
      } else {
        tts.speak(cleaned);
      }
    } catch (err) {
      console.warn('Lỗi gọi Tts.speak:', err);
      this.queuedSentencesCount = Math.max(0, this.queuedSentencesCount - 1);
    }
  }

  /**
   * Cơ chế Ngắt lời (Barge-in / Interruption):
   * Lập tức dừng mọi âm thanh đang phát, huỷ hàng đợi TTS và xoá buffer.
   */
  public stop(): void {
    try {
      this.buffer = '';
      this.queuedSentencesCount = 0;
      const tts = getTtsModule();
      if (tts) {
        tts.stop();
      }
    } catch (err) {
      console.warn('Lỗi dừng TTS:', err);
    } finally {
      this.isSpeaking = false;
      this.onStatusChange?.(false);
    }
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const ttsService = new TTSService();

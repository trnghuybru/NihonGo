import { Platform, PermissionsAndroid, NativeModules } from 'react-native';

export interface VoiceCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string, errorCode?: string) => void;
  onPartialResults?: (text: string) => void;
  onFinalResults?: (text: string) => void;
  onVolumeChanged?: (volume: number) => void;
}

let cachedVoiceModule: any = null;

function getVoiceModule(): any | null {
  if (cachedVoiceModule) return cachedVoiceModule;
  if (NativeModules.Voice) {
    try {
      const mod = require('@react-native-voice/voice');
      cachedVoiceModule = mod.default || mod;
      return cachedVoiceModule;
    } catch (err) {
      console.warn('Không thể nạp @react-native-voice/voice:', err);
      return null;
    }
  }
  return null;
}

class VoiceService {
  private isInitialized = false;
  private isListening = false;
  private callbacks: VoiceCallbacks = {};

  public isAvailable(): boolean {
    return Boolean(NativeModules.Voice);
  }

  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Quyền sử dụng Microphone',
            message:
              'Ứng dụng cần quyền ghi âm để nhận dạng giọng nói trò chuyện với AI.',
            buttonNeutral: 'Hỏi lại sau',
            buttonNegative: 'Từ chối',
            buttonPositive: 'Đồng ý',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Lỗi xin quyền Microphone Android:', err);
        return false;
      }
    }
    return true;
  }

  public init(callbacks: VoiceCallbacks): void {
    this.callbacks = callbacks;
    if (this.isInitialized) return;

    const Voice = getVoiceModule();
    if (!Voice) {
      console.warn(
        '[VoiceService] NativeModules.Voice chưa được nạp. Hãy chạy `cd ios && pod install` và build lại app.',
      );
      return;
    }

    Voice.onSpeechStart = () => {
      this.isListening = true;
      this.callbacks.onStart?.();
    };

    Voice.onSpeechEnd = () => {
      this.isListening = false;
      this.callbacks.onEnd?.();
    };

    Voice.onSpeechVolumeChanged = (e: any) => {
      if (typeof e?.value === 'number') {
        this.callbacks.onVolumeChanged?.(e.value);
      }
    };

    Voice.onSpeechError = (e: any) => {
      this.isListening = false;
      const rawMsg = e?.error?.message || '';
      let friendlyMsg = 'Không nhận diện được giọng nói';

      // Xử lý các mã lỗi phổ biến trên Android và iOS
      if (rawMsg.includes('300') || rawMsg.includes('Failed to initialize recognizer')) {
        friendlyMsg =
          "Lỗi 300: Thiết bị chưa bật 'Đọc chính tả' (Dictation) trong Cài đặt bàn phím iOS hoặc Simulator chưa hỗ trợ locale này";
      } else if (rawMsg.includes('7/') || rawMsg.includes('No match')) {
        friendlyMsg = 'Không nghe rõ, bạn hãy thử nói to và gần micro hơn nhé';
      } else if (rawMsg.includes('6/') || rawMsg.includes('timeout')) {
        friendlyMsg = 'Hết thời gian chờ, bạn hãy bấm micro và nói lại nhé';
      } else if (rawMsg.includes('9/') || rawMsg.includes('permission')) {
        friendlyMsg = 'Chưa được cấp quyền sử dụng microphone';
      } else if (rawMsg) {
        friendlyMsg = rawMsg;
      }

      this.callbacks.onError?.(friendlyMsg, rawMsg);
    };

    Voice.onSpeechPartialResults = (e: any) => {
      if (e?.value && e.value.length > 0) {
        this.callbacks.onPartialResults?.(e.value[0]);
      }
    };

    Voice.onSpeechResults = (e: any) => {
      if (e?.value && e.value.length > 0) {
        this.callbacks.onFinalResults?.(e.value[0]);
      }
    };

    this.isInitialized = true;
  }

  public async start(locale = 'ja-JP'): Promise<void> {
    const Voice = getVoiceModule();
    if (!Voice) {
      this.callbacks.onError?.(
        'Native Module Voice chưa sẵn sàng. Hãy chạy `cd ios && pod install` và build lại app native.',
      );
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      this.callbacks.onError?.('Chưa được cấp quyền truy cập Microphone.');
      return;
    }

    try {
      if (this.isListening) {
        await Voice.stop();
      }

      const options = {
        EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
        EXTRA_MAX_RESULTS: 5,
        EXTRA_PARTIAL_RESULTS: true,
        REQUEST_PERMISSIONS_AUTO: true,
      };

      await Voice.start(locale, options);
      this.isListening = true;
    } catch (e: any) {
      console.warn('Lỗi khi bắt đầu nhận dạng giọng nói:', e);
      this.isListening = false;
      this.callbacks.onError?.(e?.message || 'Không thể mở microphone');
    }
  }

  public async stop(): Promise<void> {
    const Voice = getVoiceModule();
    if (!Voice) return;

    try {
      if (this.isListening) {
        await Voice.stop();
      }
    } catch (e) {
      console.warn('Lỗi dừng Voice:', e);
    } finally {
      this.isListening = false;
    }
  }

  public async cancel(): Promise<void> {
    const Voice = getVoiceModule();
    if (!Voice) return;

    try {
      await Voice.cancel();
    } catch (e) {
      console.warn('Lỗi huỷ Voice:', e);
    } finally {
      this.isListening = false;
    }
  }

  public async destroy(): Promise<void> {
    const Voice = getVoiceModule();
    if (Voice) {
      try {
        await Voice.destroy();
        Voice.removeAllListeners();
      } catch (e) {
        console.warn('Lỗi dọn dẹp Voice:', e);
      }
    }
    this.isInitialized = false;
    this.isListening = false;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}

export const voiceService = new VoiceService();

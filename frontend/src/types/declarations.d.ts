declare module '@react-native-voice/voice' {
  export interface SpeechResultsEvent {
    value?: string[];
  }

  export interface SpeechErrorEvent {
    error?: {
      code?: string;
      message?: string;
    };
  }

  export interface VoiceStatic {
    onSpeechStart?: () => void;
    onSpeechRecognized?: () => void;
    onSpeechEnd?: () => void;
    onSpeechError?: (e: SpeechErrorEvent) => void;
    onSpeechResults?: (e: SpeechResultsEvent) => void;
    onSpeechPartialResults?: (e: SpeechResultsEvent) => void;
    onSpeechVolumeChanged?: (e: { value?: number }) => void;

    start: (locale?: string, options?: any) => Promise<void>;
    stop: () => Promise<void>;
    cancel: () => Promise<void>;
    destroy: () => Promise<void>;
    removeAllListeners: () => void;
    isRecognizing: () => Promise<boolean>;
    isAvailable: () => Promise<boolean>;
  }

  const Voice: VoiceStatic;
  export default Voice;
}

declare module 'react-native-tts' {
  export interface TtsStatic {
    getInitStatus: () => Promise<'success'>;
    speak: (text: string, options?: any) => string;
    stop: (onWordBoundary?: boolean) => Promise<boolean>;
    pause: (onWordBoundary?: boolean) => Promise<boolean>;
    resume: () => Promise<boolean>;
    setDefaultLanguage: (language: string) => Promise<string>;
    setDefaultRate: (rate: number, skipTransform?: boolean) => Promise<string>;
    setDefaultPitch: (pitch: number) => Promise<string>;
    setDefaultVoice: (voiceId: string) => Promise<string>;
    voices: () => Promise<Array<{ id: string; name: string; language: string; quality: number }>>;
    addEventListener: (
      type: 'tts-start' | 'tts-finish' | 'tts-error' | 'tts-cancel' | 'tts-progress',
      handler: (event: any) => void
    ) => any;
    removeEventListener: (
      type: 'tts-start' | 'tts-finish' | 'tts-error' | 'tts-cancel' | 'tts-progress',
      handler: (event: any) => void
    ) => any;
  }

  const Tts: TtsStatic;
  export default Tts;
}


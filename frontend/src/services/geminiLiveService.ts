import { LiveAudio } from './liveAudio';
import {
  speakingService,
  LiveCredentials,
  LiveTurnInput,
  TurnReply,
} from './speakingService';

export type LiveState =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'processing'
  | 'saving'
  | 'error';
export interface LiveCallbacks {
  onState: (state: LiveState) => void;
  onPlaying: (playing: boolean) => void;
  onMicLevel?: (level: number) => void;
  onTranscript: (user: string, assistant: string) => void;
  onSaved: (reply: TurnReply) => void;
  onError: (message: string) => void;
}
const endpoint =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => {
    const random = Math.floor(Math.random() * 16);
    return (value === 'x' ? random : (random % 4) + 8).toString(16);
  });
}

export class GeminiLiveService {
  private socket: WebSocket | null = null;
  private audio: LiveAudio;
  private credentials: LiveCredentials | null = null;
  private disposed = false;
  private user = '';
  private assistant = '';
  private inputMode: 'text' | 'voice' = 'voice';
  private pending: LiveTurnInput | null = null;
  private busy = false;
  private readingOpening = false;
  private capturing = false;
  private starting = false;
  private released = false;
  private complete = false;
  private state: LiveState = 'idle';
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private connectReject: ((error: Error) => void) | null = null;
  constructor(private sessionId: string, private callbacks: LiveCallbacks) {
    this.audio = new LiveAudio(callbacks.onPlaying, message =>
      this.fail(message),
    );
  }
  private setState(value: LiveState) {
    this.state = value;
    if (!this.disposed) this.callbacks.onState(value);
  }
  private send(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error('Mất kết nối Gemini. Hãy kết nối lại.');
    if (
      ((this.socket as WebSocket & { bufferedAmount?: number })
        .bufferedAmount || 0) > 512000
    )
      throw new Error('Mạng quá chậm để truyền âm thanh. Hãy kết nối lại.');
    this.socket.send(JSON.stringify(message));
  }
  private clearTimeout() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }
  private fail(message: string) {
    if (this.disposed) return;
    this.clearTimeout();
    this.connectReject?.(new Error(message));
    this.connectReject = null;
    this.capturing = false;
    this.audio.stop().catch(() => undefined);
    this.audio.stopPlayback();
    this.setState('error');
    this.socket?.close();
    this.callbacks.onError(message);
  }
  async connect(openingText?: string) {
    this.setState('connecting');
    try {
      this.credentials = await speakingService.liveToken(this.sessionId);
      if (this.disposed) return;
      await this.audio.prepare();
      if (this.disposed) return;
      await new Promise<void>((resolve, reject) => {
        this.connectReject = reject;
        this.timeout = setTimeout(
          () => this.fail('Kết nối Gemini quá lâu. Hãy thử lại.'),
          15000,
        );
        const socket = new WebSocket(
          `${endpoint}?access_token=${encodeURIComponent(
            this.credentials!.token,
          )}`,
        );
        (socket as WebSocket & { binaryType: string }).binaryType =
          'arraybuffer';
        this.socket = socket;
        socket.onopen = () => {
          if (this.disposed) return;
          try {
            this.send({ setup: { model: this.credentials!.model } });
          } catch {
            this.fail('Không gửi được cấu hình Gemini. Hãy kết nối lại.');
          }
        };
        socket.onmessage = event => {
          if (this.disposed) return;
          try {
            const data =
              typeof event.data === 'string'
                ? event.data
                : decodeURIComponent(
                    Array.from(
                      new Uint8Array(event.data as ArrayBuffer),
                      byte => '%' + byte.toString(16).padStart(2, '0'),
                    ).join(''),
                  );
            const message = JSON.parse(data);
            if (message.setupComplete) {
              this.clearTimeout();
              this.send({
                clientContent: {
                  turns: this.credentials!.history,
                  turnComplete: true,
                },
              });
              this.connectReject = null;
              if (
                openingText?.trim() &&
                this.credentials!.last_sequence === 1
              ) {
                this.readingOpening = true;
                this.busy = true;
                this.setState('processing');
                this.send({
                  clientContent: {
                    turns: [
                      {
                        role: 'user',
                        parts: [
                          {
                            text:
                              'Read the following opening line aloud exactly as written, in its original language. Do not add an introduction, translation, explanation or answer.\n' +
                              openingText.trim().slice(0, 2000),
                          },
                        ],
                      },
                    ],
                    turnComplete: true,
                  },
                });
                this.timeout = setTimeout(
                  () =>
                    this.fail('Không đọc được lời mở đầu. Hãy kết nối lại.'),
                  45000,
                );
              } else this.setState('ready');
              resolve();
            } else if (message.error)
              this.fail(
                'Gemini không nhận được cấu hình phiên. Hãy kiểm tra model trên máy chủ.',
              );
            else if (message.goAway)
              this.fail('Phiên Live sắp hết hạn. Hãy kết nối lại để tiếp tục.');
            else if (message.serverContent) this.receive(message.serverContent);
          } catch {
            this.fail('Không xử lý được phản hồi Gemini. Hãy kết nối lại.');
          }
        };
        socket.onerror = () =>
          this.fail(
            'Không kết nối được Gemini Live. Kiểm tra mạng và thử lại.',
          );
        socket.onclose = () => {
          if (!this.disposed && this.state !== 'error')
            this.fail('Kết nối Live đã đóng. Hãy kết nối lại.');
        };
      });
      return !this.disposed && this.state !== 'error';
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : 'Không thể mở phiên Live.',
      );
      return false;
    }
  }
  private receive(content: {
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: {
      parts?: { inlineData?: { data: string; mimeType: string } }[];
    };
    interrupted?: boolean;
    turnComplete?: boolean;
  }) {
    if (!this.busy) return;
    if (content.interrupted) this.audio.stopPlayback();
    // The opening line is already persisted. Play its audio without adding a user turn
    // or another assistant bubble for the internal read-aloud request.
    if (this.readingOpening) {
      for (const part of content.modelTurn?.parts || []) {
        if (part.inlineData?.mimeType.startsWith('audio/pcm'))
          this.audio.play(part.inlineData.data);
      }
      if (content.turnComplete) {
        this.clearTimeout();
        this.readingOpening = false;
        this.busy = false;
        this.setState('ready');
      }
      return;
    }

    if (content.inputTranscription?.text && this.inputMode === 'voice')
      this.user += content.inputTranscription.text;
    if (content.outputTranscription?.text)
      this.assistant += content.outputTranscription.text;
    if (this.user.length > 2000 || this.assistant.length > 2000) {
      this.fail('Lượt nói quá dài. Hãy chia thành các câu ngắn.');
      return;
    }
    for (const part of content.modelTurn?.parts || []) {
      if (part.inlineData?.mimeType.startsWith('audio/pcm'))
        this.audio.play(part.inlineData.data);
    }
    this.callbacks.onTranscript(this.user, this.assistant);
    if (content.turnComplete && this.busy) {
      this.complete = true;
      this.clearTimeout();
      this.timeout = setTimeout(() => {
        if (this.busy && !this.pending)
          this.fail('Không nhận được transcript đầy đủ. Hãy kết nối lại.');
      }, 3000);
    }
    if (
      this.busy &&
      this.complete &&
      this.user.trim() &&
      this.assistant.trim() &&
      !this.pending
    ) {
      this.clearTimeout();
      this.pending = {
        lease: this.credentials!.lease,
        request_id: requestId(),
        after_sequence: this.credentials!.last_sequence,
        input_mode: this.inputMode,
        user_text: this.user.trim(),
        assistant_text: this.assistant.trim(),
      };
      this.retrySave();
    }
  }
  private begin(mode: 'text' | 'voice', text = '') {
    if (this.busy || this.state !== 'ready') return false;
    this.busy = true;
    this.complete = false;
    this.user = text;
    this.assistant = '';
    this.inputMode = mode;
    this.audio.stopPlayback();
    this.callbacks.onTranscript(text, '');
    return true;
  }
  async startSpeaking() {
    if (!this.begin('voice')) return;
    this.starting = true;
    this.released = false;
    this.capturing = true;
    this.setState('listening');
    try {
      this.send({ realtimeInput: { activityStart: {} } });
      await this.audio.start(
        data => {
          if (this.capturing && !this.disposed) {
            try {
              this.send({
                realtimeInput: {
                  audio: { data, mimeType: 'audio/pcm;rate=16000' },
                },
              });
            } catch {
              this.fail(
                'Không truyền được âm thanh. Kiểm tra mạng và kết nối lại.',
              );
            }
          }
        },
        level => {
          if (this.capturing && !this.disposed)
            this.callbacks.onMicLevel?.(level);
        },
      );
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Không thể thu âm.');
    } finally {
      this.starting = false;
      if (this.released && this.capturing && !this.disposed)
        await this.stopSpeaking();
    }
  }
  async stopSpeaking() {
    this.released = true;
    if (!this.capturing || this.starting || this.disposed) return;
    try {
      await this.audio.stop();
      this.capturing = false;
      if (this.disposed || this.state === 'error') return;
      this.send({ realtimeInput: { activityEnd: {} } });
      this.setState('processing');
      this.timeout = setTimeout(
        () => this.fail('AI phản hồi quá lâu. Hãy kết nối lại.'),
        45000,
      );
    } catch {
      this.fail('Không thể kết thúc lượt nói. Hãy kết nối lại.');
    }
  }
  sendText(text: string) {
    if (!text.trim() || text.length > 2000 || !this.begin('text', text.trim()))
      return false;
    try {
      this.send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: text.trim() }] }],
          turnComplete: true,
        },
      });
      this.setState('processing');
      this.timeout = setTimeout(
        () => this.fail('AI phản hồi quá lâu. Hãy kết nối lại.'),
        45000,
      );
      return true;
    } catch {
      this.fail('Không thể gửi tin nhắn. Hãy kết nối lại.');
      return false;
    }
  }
  async retrySave() {
    if (!this.pending || this.state === 'saving') return;
    const pending = this.pending;
    this.setState('saving');
    try {
      const reply = await speakingService.saveLiveTurn(this.sessionId, pending);
      this.credentials!.last_sequence = reply.assistant_message.sequence_number;
      this.pending = null;
      this.busy = false;
      if (!this.disposed) {
        this.callbacks.onSaved(reply);
        this.callbacks.onTranscript('', '');
        this.setState(
          this.socket?.readyState === WebSocket.OPEN ? 'ready' : 'error',
        );
      }
    } catch {
      if (!this.disposed) {
        this.setState('error');
        this.callbacks.onError(
          'Chưa lưu được hội thoại. Bấm thử lưu lại trước khi tiếp tục.',
        );
      }
    }
  }
  discardUnsavedTurn() {
    if (this.state === 'saving') return;
    this.pending = null;
    this.busy = false;
    this.complete = false;
    this.audio.stopPlayback();
    this.callbacks.onTranscript('', '');
    this.setState('idle');
  }
  interrupt() {
    this.fail('Hội thoại đã dừng khi app chuyển nền. Kết nối lại để tiếp tục.');
  }
  hasUnsavedTurn() {
    return Boolean(this.pending);
  }
  async close() {
    this.disposed = true;
    this.clearTimeout();
    this.connectReject?.(new Error('Closed'));
    this.connectReject = null;
    this.socket?.close();
    this.socket = null;
    await this.audio.dispose();
  }
}

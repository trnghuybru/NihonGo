import { authenticatedRequest } from './authService';
import { createGameSpeech } from './gameSpeech';
import { AudioReplay } from './audioReplay';
import { vocabularyService } from './vocabularyService';
import type { LiveCallbacks } from './geminiLiveService';
import type { TurnInput, TurnReply } from './speakingService';

export type ExperimentMetrics = { stt_ms: number; llm_ms: number; tts_storage_ms: number; download_ms: number; total_ms: number };
type Reply = TurnReply & { emotion?: string; audio: { url: string }; timings: { llm_ms: number; tts_storage_ms: number } };
export class TtsConversationService {
  private speech = createGameSpeech(2000);
  private audio = new AudioReplay();
  private closed = false;
  private epoch = 0;
  private busy = false;
  private listening = false;
  private pending: TurnInput | null = null;
  private stoppedAt = 0;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  constructor(private sessionId: string, private callbacks: LiveCallbacks,
    private onMetrics: (value: ExperimentMetrics) => void,
    private onEmotion: (value: string) => void) {}
  private fail(message: string) {
    if (this.closed) return;
    this.epoch++;
    clearTimeout(this.watchdog);
    this.listening = false;
    this.busy = false;
    this.speech.close();
    this.audio.stop();
    this.callbacks.onPlaying(false);
    this.callbacks.onState('error');
    this.callbacks.onError(message);
  }
  async connect(openingText?: string, _openingMessageId?: string) {
    this.callbacks.onState('connecting');
    try {
      if (openingText) {
        const result = await vocabularyService.audioSynthesize(openingText);
        if (this.closed) return false;
        this.callbacks.onTranscript('', openingText);
        await this.play(result.url);
      }
      if (!this.closed) this.callbacks.onState('ready');
      return !this.closed;
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Không tạo được giọng mở đầu.');
      return false;
    }
  }
  private async play(url: string) {
    const played = await this.audio.play(url, () => {
      if (!this.closed) this.callbacks.onPlaying(false);
    });
    if (played && !this.closed) this.callbacks.onPlaying(true);
  }
  async startSpeaking() {
    if (this.closed || this.busy || this.listening) return;
    if (!this.speech.supported) {
      this.fail('Trình duyệt chưa hỗ trợ nhận dạng tiếng Nhật. Hãy dùng Chrome hoặc chế độ nhắn tin.');
      return;
    }
    this.stoppedAt = 0;
    this.listening = true;
    this.callbacks.onState('listening');
    this.watchdog = setTimeout(() => this.fail('Không nhận được giọng nói. Hãy thử lại.'), 30000);
    this.speech.start({
      onText: text => { if (!this.closed) this.callbacks.onTranscript(text, ''); },
      onFinal: alternatives => {
        if (this.closed || !this.listening) return;
        this.listening = false;
        clearTimeout(this.watchdog);
        this.speech.close();
        this.submit(alternatives[0], 'voice');
      },
      onError: () => this.fail('Không nhận dạng được giọng nói. Kiểm tra quyền micro và thử lại.'),
      onEnd: () => this.fail('Chưa nghe rõ câu nói. Hãy thử lại.'),
    });
  }
  async stopSpeaking() {
    if (!this.listening) return;
    this.stoppedAt = performance.now();
    this.callbacks.onState('processing');
    this.speech.stop();
  }
  sendText(text: string) {
    if (this.closed || this.busy || this.pending || !text.trim()) return false;
    this.stoppedAt = performance.now();
    this.submit(text.trim(), 'text');
    return true;
  }
  private submit(text: string, mode: 'voice' | 'text') {
    if (this.closed || this.busy || !text) return;
    this.pending = { request_id: crypto.randomUUID(), content: text, input_mode: mode };
    void this.retrySave();
  }
  async retrySave() {
    if (this.closed || this.busy || !this.pending) return;
    this.busy = true;
    const epoch = this.epoch;
    const requestStarted = performance.now();
    const endOfSpeech = this.stoppedAt || requestStarted;
    this.callbacks.onState('processing');
    try {
      const reply = await authenticatedRequest<Reply>(
        `/speaking/sessions/${encodeURIComponent(this.sessionId)}/experimental-turn`,
        this.pending, 'POST', { timeoutMs: 90000 });
      if (this.closed || epoch !== this.epoch) return;
      const audioStart = performance.now();
      this.callbacks.onTranscript(this.pending.content, reply.assistant_message.content);
      this.onEmotion(reply.emotion || 'neutral');
      await this.play(reply.audio.url);
      if (this.closed || epoch !== this.epoch) return;
      const now = performance.now();
      this.onMetrics({ stt_ms: Math.round(requestStarted-endOfSpeech),
        ...reply.timings, download_ms: Math.round(now-audioStart), total_ms: Math.round(now-endOfSpeech) });
      this.pending = null;
      this.callbacks.onSaved(reply);
      this.callbacks.onState('ready');
    } catch (error) {
      if (!this.closed && epoch === this.epoch) this.fail(error instanceof Error ? error.message : 'Không tạo được phản hồi.');
    } finally { this.busy = false; }
  }
  hasUnsavedTurn() { return Boolean(this.pending); }
  discardUnsavedTurn() { this.epoch++; this.pending = null; this.speech.close(); this.audio.stop(); this.callbacks.onState('idle'); }
  interrupt() { this.fail('Đã dừng thử nghiệm khi chuyển nền. Kết nối lại để tiếp tục.'); }
  async close() { this.closed = true; clearTimeout(this.watchdog); this.speech.close(); await this.audio.close(); }
}

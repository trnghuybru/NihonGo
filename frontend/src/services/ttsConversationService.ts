import { authenticatedRequest } from './authService';
import { fromByteArray, toByteArray } from 'base64-js';
import { AudioReplay } from './audioReplay';
import { PcmRecording, WavRecording } from './audioRecording';
import { LiveAudio } from './liveAudio';
import { speakingService } from './speakingService';
import { vocabularyService } from './vocabularyService';
import type { LiveCallbacks } from './geminiLiveService';
import type { TurnInput, TurnReply } from './speakingService';

type Reply = TurnReply & { emotion?: string; audio: { url: string } };
const MAX_RECORDING_BYTES = 16_000 * 2 * 9;
const MAX_RECORDING_MS = 9_000;
export class TtsConversationService {
  private audio = new AudioReplay();
  private microphone: LiveAudio;
  private closed = false;
  private epoch = 0;
  private busy = false;
  private listening = false;
  private pending: TurnInput | null = null;
  private pendingAudio: string | null = null;
  private pendingRecording: WavRecording | null = null;
  private recordingChunks: Uint8Array[] = [];
  private recordingBytes = 0;
  private recordingStopping = false;
  private microphonePrepared = false;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  constructor(private sessionId: string, private callbacks: LiveCallbacks,
  private onEmotion: (value: string) => void,
  private onUserAudio?: (messageId: string, wav: Uint8Array) => void) {
    this.microphone = this.createMicrophone();
  }
  private createMicrophone() {
    return new LiveAudio(() => {}, message => this.fail(message));
  }
  private fail(message: string) {
    if (this.closed) return;
    this.epoch++;
    clearTimeout(this.watchdog);
    this.listening = false;
    this.busy = false;
    void this.microphone.stop();
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
    if (this.closed || this.busy || this.listening || this.pending || this.pendingAudio) return;
    this.recordingChunks = [];
    this.recordingBytes = 0;
    this.listening = true;
    this.callbacks.onState('listening');
    this.watchdog = setTimeout(() => void this.stopSpeaking(), MAX_RECORDING_MS);
    try {
      if (!this.microphonePrepared) {
        await this.microphone.prepare();
        this.microphonePrepared = true;
      }
      if (this.closed || !this.listening) return;
      await this.microphone.start(
        pcm => this.appendRecording(pcm),
        this.callbacks.onMicLevel,
      );
    } catch (error) {
      if (!this.closed)
        this.fail(error instanceof Error ? error.message : 'Không thể thu âm. Kiểm tra quyền microphone và thử lại.');
    }
  }
  private appendRecording(pcm: string) {
    if ((!this.listening && !this.recordingStopping) || this.closed) return;
    const chunk = toByteArray(pcm);
    const remaining = MAX_RECORDING_BYTES - this.recordingBytes;
    if (remaining <= 0) {
      void this.stopSpeaking();
      return;
    }
    const kept = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    this.recordingChunks.push(kept);
    this.recordingBytes += kept.length;
    if (this.recordingBytes >= MAX_RECORDING_BYTES) void this.stopSpeaking();
  }
  async stopSpeaking() {
    if (!this.listening) return;
    this.listening = false;
    this.recordingStopping = true;
    clearTimeout(this.watchdog);
    this.callbacks.onState('processing');
    try {
      await this.microphone.stop();
      this.recordingStopping = false;
      if (this.closed) return;
      const bytes = new Uint8Array(this.recordingBytes);
      let offset = 0;
      for (const chunk of this.recordingChunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      this.recordingChunks = [];
      if (!bytes.length) {
        this.fail('Không nhận được âm thanh. Hãy thử lại.');
        return;
      }
      const recording = new PcmRecording(16000);
      recording.append(fromByteArray(bytes));
      this.pendingRecording = recording.finish();
      this.pendingAudio = fromByteArray(bytes);
      void this.retrySave();
    } catch (error) {
      this.recordingStopping = false;
      this.fail(error instanceof Error ? error.message : 'Không thể dừng ghi âm. Hãy thử lại.');
    }
  }
  sendText(text: string) {
    if (this.closed || this.busy || this.pending || this.pendingAudio || !text.trim()) return false;
    this.pending = { request_id: crypto.randomUUID(), content: text.trim(), input_mode: 'text' };
    void this.retrySave();
    return true;
  }
  async retrySave() {
    if (this.closed || this.busy || (!this.pending && !this.pendingAudio)) return;
    this.busy = true;
    const epoch = this.epoch;
    this.callbacks.onState('processing');
    try {
      if (!this.pending && this.pendingAudio) {
        const transcript = await speakingService.experimentalTranscribe(
          this.sessionId,
          this.pendingAudio,
        );
        if (this.closed || epoch !== this.epoch) return;
        this.pendingAudio = null;
        this.pending = {
          request_id: crypto.randomUUID(),
          content: transcript.text,
          input_mode: 'voice',
        };
        this.callbacks.onTranscript(transcript.text, '');
      }
      if (!this.pending) return;
      const reply = await authenticatedRequest<Reply>(
        `/speaking/sessions/${encodeURIComponent(this.sessionId)}/experimental-turn`,
        this.pending, 'POST', { timeoutMs: 90000 });
      if (this.closed || epoch !== this.epoch) return;
      this.callbacks.onTranscript(this.pending.content, reply.assistant_message.content);
      this.onEmotion(reply.emotion || 'neutral');
      await this.play(reply.audio.url);
      if (this.closed || epoch !== this.epoch) return;
      this.pending = null;
      if (this.pendingRecording) {
        this.onUserAudio?.(
          reply.user_message.id,
          this.pendingRecording.bytes,
        );
      }
      this.pendingRecording = null;
      this.callbacks.onSaved(reply);
      this.callbacks.onState('ready');
    } catch (error) {
      if (!this.closed && epoch === this.epoch) this.fail(error instanceof Error ? error.message : 'Không tạo được phản hồi.');
    } finally { this.busy = false; }
  }
  hasUnsavedTurn() { return Boolean(this.pending || this.pendingAudio); }
  discardUnsavedTurn() {
    this.epoch++;
    this.pending = null;
    this.pendingAudio = null;
    this.pendingRecording = null;
    this.recordingChunks = [];
    this.recordingBytes = 0;
    void this.microphone.stop();
    this.audio.stop();
    this.callbacks.onState('idle');
  }
  interrupt() { this.fail('Đã dừng thử nghiệm khi chuyển nền. Kết nối lại để tiếp tục.'); }
  async close() {
    this.closed = true;
    clearTimeout(this.watchdog);
    this.pendingAudio = null;
    this.pendingRecording = null;
    this.recordingChunks = [];
    await Promise.all([this.microphone.dispose(), this.audio.close()]);
  }
}

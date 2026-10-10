import { toByteArray } from 'base64-js';

export interface WavRecording {
  bytes: Uint8Array;
  durationMs: number;
  sampleRate: 16000 | 24000 | 44100 | 48000;
}

// Bound memory while Gemini streams. Keep the original PCM, without re-recording the speaker.
export class PcmRecording {
  private chunks: Uint8Array[] = [];
  private size = 0;
  constructor(private sampleRate: WavRecording['sampleRate']) {}

  append(base64: string) {
    const bytes = toByteArray(base64);
    if (bytes.length % 2) throw new Error('Dữ liệu âm thanh không hợp lệ.');
    if (this.size + bytes.length > this.sampleRate * 2 * 180) {
      throw new Error('Lượt nói quá dài. Hãy chia thành các lượt dưới 3 phút.');
    }
    this.chunks.push(bytes);
    this.size += bytes.length;
  }

  finish(): WavRecording | null {
    if (!this.size) return null;
    const bytes = new Uint8Array(44 + this.size);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        bytes[offset + i] = value.charCodeAt(i);
      }
    };
    text(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, this.sampleRate, true);
    view.setUint32(28, this.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, this.size, true);
    let offset = 44;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.size = 0;
    return {
      bytes,
      sampleRate: this.sampleRate,
      durationMs: Math.max(
        1,
        Math.round(((bytes.length - 44) * 1000) / (this.sampleRate * 2)),
      ),
    };
  }
}

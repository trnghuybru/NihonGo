export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export interface StreamVoiceChatOptions {
  summary?: string;
  level?: string;
  topic?: string;
  language?: string;
}

// Địa chỉ kết nối Flask Backend:
// Sử dụng IP LAN của máy tính (192.168.1.31) để iPhone thật, Android và Simulator đều gọi được qua cùng mạng Wi-Fi
export const DEFAULT_HOST_IP = '192.168.1.31';
const DEFAULT_BACKEND_URL = `http://${DEFAULT_HOST_IP}:5001/api/chat/voice-stream`;

class ChatStreamService {
  private currentXhr: XMLHttpRequest | null = null;
  private backendUrl = DEFAULT_BACKEND_URL;

  public setBackendUrl(url: string): void {
    this.backendUrl = url;
  }

  public getBackendUrl(): string {
    return this.backendUrl;
  }

  /**
   * Gửi yêu cầu tới Flask backend và nhận stream SSE.
   * Sử dụng XMLHttpRequest với onprogress nhằm hỗ trợ chuẩn streaming trên React Native (cả iOS & Android).
   */
  public streamVoiceChat(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    options?: StreamVoiceChatOptions,
  ): () => void {
    // Huỷ request cũ nếu còn đang chạy
    this.abort();

    const xhr = new XMLHttpRequest();
    this.currentXhr = xhr;

    let seenIndex = 0;
    let fullResponseText = '';
    let buffer = '';
    let hasEnded = false;

    xhr.open('POST', this.backendUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');

    const finishSuccess = () => {
      if (hasEnded) return;
      hasEnded = true;
      callbacks.onDone(fullResponseText);
    };

    const finishError = (errMsg: string) => {
      if (hasEnded) return;
      hasEnded = true;
      callbacks.onError(errMsg);
    };

    const processBuffer = () => {
      const lines = buffer.split('\n');
      // Giữ lại dòng cuối cùng nếu chưa có ký tự xuống dòng \n
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data: ')) {
          const dataContent = trimmed.substring(6).trim();
          if (dataContent === '[DONE]') {
            finishSuccess();
            return;
          }

          try {
            const parsed = JSON.parse(dataContent);
            if (parsed.error) {
              finishError(parsed.error);
              return;
            }
            if (parsed.content) {
              fullResponseText += parsed.content;
              callbacks.onToken(parsed.content);
            }
          } catch {
            // Không phải JSON hợp lệ (ví dụ text thô)
            if (dataContent && dataContent !== '[DONE]') {
              fullResponseText += dataContent;
              callbacks.onToken(dataContent);
            }
          }
        } else if (trimmed.startsWith('event: error')) {
          // Bắt sự kiện error từ backend
        }
      }
    };

    xhr.onprogress = () => {
      const newText = xhr.responseText.substring(seenIndex);
      seenIndex = xhr.responseText.length;
      buffer += newText;
      processBuffer();
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (buffer) {
          processBuffer();
        }
        finishSuccess();
      } else {
        finishError(
          `Lỗi kết nối máy chủ (${xhr.status}): ${xhr.responseText || 'Không thể kết nối Backend'}`,
        );
      }
      this.currentXhr = null;
    };

    xhr.onerror = () => {
      finishError(
        `Không thể kết nối tới Backend tại ${this.backendUrl}. Hãy đảm bảo server Flask đang chạy (port 5001).`,
      );
      this.currentXhr = null;
    };

    xhr.onabort = () => {
      this.currentXhr = null;
    };

    const payload = JSON.stringify({
      messages,
      summary: options?.summary,
      level: options?.level || 'N4',
      topic: options?.topic || 'free_talk',
      language: options?.language || 'ja-JP',
    });

    xhr.send(payload);

    return () => this.abort();
  }

  public abort(): void {
    if (this.currentXhr) {
      try {
        this.currentXhr.abort();
      } catch (e) {
        console.warn('Lỗi abort XHR:', e);
      } finally {
        this.currentXhr = null;
      }
    }
  }
}

export const chatStreamService = new ChatStreamService();

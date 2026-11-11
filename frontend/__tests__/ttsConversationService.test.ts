import { fromByteArray } from 'base64-js';
import { authenticatedRequest } from '../src/services/authService';
import { speakingService } from '../src/services/speakingService';
import { TtsConversationService } from '../src/services/ttsConversationService';
import type { LiveCallbacks } from '../src/services/geminiLiveService';

let mockCapture: ((pcm: string) => void) | undefined;

jest.mock('../src/services/authService', () => ({
  authenticatedRequest: jest.fn(),
}));
jest.mock('../src/services/liveAudio', () => ({
  LiveAudio: jest.fn().mockImplementation(() => ({
    prepare: jest.fn(),
    start: jest.fn(async (onChunk: (pcm: string) => void) => {
      mockCapture = onChunk;
    }),
    stop: jest.fn(),
    dispose: jest.fn(),
  })),
}));
jest.mock('../src/services/audioReplay', () => ({
  AudioReplay: jest.fn().mockImplementation(() => ({
    play: jest.fn().mockResolvedValue(true),
    stop: jest.fn(),
    close: jest.fn(),
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCapture = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('sends captured PCM to Cloud STT before the LLM turn', async () => {
  const sessionId = 'session-1';
  const audio = new Uint8Array(4000).fill(1);
  const encoded = fromByteArray(audio);
  const onSaved = jest.fn();
  const onUserAudio = jest.fn();
  const callbacks: LiveCallbacks = {
    onState: jest.fn(),
    onPlaying: jest.fn(),
    onError: jest.fn(),
    onTranscript: jest.fn(),
    onSaved,
  };
  const service = new TtsConversationService(
    sessionId,
    callbacks,
    jest.fn(),
    onUserAudio,
  );
  const saved = new Promise<void>(resolve => {
    onSaved.mockImplementation(resolve);
  });
  jest.spyOn(speakingService, 'experimentalTranscribe').mockResolvedValue({
    text: 'こんにちは',
  });
  jest.mocked(authenticatedRequest).mockResolvedValue({
    user_message: { id: 'user-message-1', content: 'こんにちは' },
    assistant_message: { content: 'はい。' },
    audio: { url: 'http://localhost/audio.wav' },

  } as never);

  await service.startSpeaking();
  mockCapture?.(encoded);
  await service.stopSpeaking();
  await saved;
  await service.close();

  expect(speakingService.experimentalTranscribe).toHaveBeenCalledWith(
    sessionId,
    encoded,
  );
  expect(authenticatedRequest).toHaveBeenCalledWith(
    `/speaking/sessions/${sessionId}/experimental-turn`,
    expect.objectContaining({
      content: 'こんにちは',
      input_mode: 'voice',
    }),
    'POST',
    { timeoutMs: 90000 },
  );
  expect(onUserAudio).toHaveBeenCalledWith(
    'user-message-1',
    expect.any(Uint8Array),
  );
  const wav = onUserAudio.mock.calls[0][1] as Uint8Array;
  expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
  expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe('WAVE');
  expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16000);
});

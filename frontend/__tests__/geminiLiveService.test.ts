import {
  GeminiLiveService,
  LiveCallbacks,
} from '../src/services/geminiLiveService';
import { LiveAudio } from '../src/services/liveAudio';
import { speakingService } from '../src/services/speakingService';
jest.mock('../src/services/liveAudio', () => ({ LiveAudio: jest.fn() }));
jest.mock('../src/services/speakingService', () => ({
  speakingService: { liveToken: jest.fn(), saveLiveTurn: jest.fn() },
}));
class Socket {
  static OPEN = 1;
  static instance: Socket;
  readyState = 1;
  bufferedAmount = 0;
  binaryType = '';
  onopen = () => {};
  onclose = () => {};
  onmessage = (_event: { data: string }) => {};
  sent: object[] = [];
  constructor(public url: string) {
    Socket.instance = this;
  }
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
    this.onclose();
  }
  receive(value: object) {
    this.onmessage({ data: JSON.stringify(value) });
  }
}
let service: GeminiLiveService;
let callbacks: LiveCallbacks;
const audio = {
  prepare: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  play: jest.fn(),
  stopPlayback: jest.fn(),
  dispose: jest.fn(),
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  jest.clearAllMocks();
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  Object.values(audio).forEach(fn => fn.mockReset());
  audio.prepare.mockResolvedValue(undefined);
  audio.start.mockResolvedValue(undefined);
  audio.stop.mockResolvedValue(undefined);
  audio.dispose.mockResolvedValue(undefined);
  jest
    .mocked(LiveAudio)
    .mockImplementation(() => audio as unknown as LiveAudio);
  jest.mocked(speakingService.liveToken).mockResolvedValue({
    token: 'ephemeral',
    model: 'models/live',
    lease: 'signed',
    last_sequence: 1,
    history: [{ role: 'model', parts: [{ text: 'Hello' }] }],
  });
  jest
    .mocked(speakingService.saveLiveTurn)
    .mockReset()
    .mockResolvedValue({
      user_message: {} as never,
      assistant_message: { sequence_number: 3 } as never,
    });
  callbacks = {
    onState: jest.fn(),
    onPlaying: jest.fn(),
    onTranscript: jest.fn(),
    onSaved: jest.fn(),
    onError: jest.fn(),
  };
  service = new GeminiLiveService('session', callbacks);
});
afterEach(async () => {
  await service.close();
  jest.useRealTimers();
});
async function connect(openingText?: string) {
  const pending = service.connect(openingText);
  await flush();
  Socket.instance.onopen();
  Socket.instance.receive({ setupComplete: {} });
  await pending;
}
function response() {
  Socket.instance.receive({
    serverContent: {
      outputTranscription: { text: 'Hi!' },
      modelTurn: {
        parts: [
          { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'PCM' } },
        ],
      },
      turnComplete: true,
    },
  });
}

test('uses an ephemeral token and restores locked session history before enabling input', async () => {
  await connect();
  expect(Socket.instance.url).toContain(
    'BidiGenerateContentConstrained?access_token=ephemeral',
  );
  expect(Socket.instance.sent).toEqual([
    { setup: { model: 'models/live' } },
    {
      clientContent: {
        turns: [{ role: 'model', parts: [{ text: 'Hello' }] }],
        turnComplete: true,
      },
    },
  ]);
  expect(callbacks.onState).toHaveBeenLastCalledWith('ready');
});
test('streams PCM and activity boundaries, including release before microphone finishes opening', async () => {
  await connect();
  let ready!: () => void;
  audio.start.mockImplementationOnce(chunk => {
    chunk('raw');
    return new Promise<void>(resolve => {
      ready = resolve;
    });
  });
  const starting = service.startSpeaking();
  await service.stopSpeaking();
  expect(audio.stop).not.toHaveBeenCalled();
  ready();
  await starting;
  expect(Socket.instance.sent.slice(2)).toEqual([
    { realtimeInput: { activityStart: {} } },
    {
      realtimeInput: {
        audio: { data: 'raw', mimeType: 'audio/pcm;rate=16000' },
      },
    },
    { realtimeInput: { activityEnd: {} } },
  ]);
  Socket.instance.receive({
    serverContent: { inputTranscription: { text: 'Hello' } },
  });
  response();
  await flush();
  expect(audio.play).toHaveBeenCalledWith('PCM');
  expect(speakingService.saveLiveTurn).toHaveBeenCalledWith(
    'session',
    expect.objectContaining({
      input_mode: 'voice',
      user_text: 'Hello',
      assistant_text: 'Hi!',
      after_sequence: 1,
    }),
  );
});
test('does not send overlapping turns and retries persistence with the same ID', async () => {
  await connect();
  jest
    .mocked(speakingService.saveLiveTurn)
    .mockRejectedValueOnce(new Error('network'));
  expect(service.sendText('Hello')).toBe(true);
  expect(service.sendText('second')).toBe(false);
  response();
  await flush();
  expect(service.hasUnsavedTurn()).toBe(true);
  const first = jest.mocked(speakingService.saveLiveTurn).mock.calls[0][1];
  await service.retrySave();
  expect(jest.mocked(speakingService.saveLiveTurn).mock.calls[1][1]).toEqual(
    first,
  );
  expect(service.hasUnsavedTurn()).toBe(false);
  expect(callbacks.onState).toHaveBeenLastCalledWith('ready');
  Socket.instance.receive({
    serverContent: {
      outputTranscription: { text: 'late' },
      turnComplete: true,
    },
  });
  expect(speakingService.saveLiveTurn).toHaveBeenCalledTimes(2);
});
test('waits for late voice transcription instead of saving an empty user message', async () => {
  await connect();
  await service.startSpeaking();
  await service.stopSpeaking();
  response();
  expect(speakingService.saveLiveTurn).not.toHaveBeenCalled();
  Socket.instance.receive({
    serverContent: { inputTranscription: { text: 'Hello' } },
  });
  await flush();
  expect(speakingService.saveLiveTurn).toHaveBeenCalledTimes(1);
});
test('stops playback and capture when the connection closes without recursive failure', async () => {
  await connect();
  Socket.instance.close();
  expect(audio.stopPlayback).toHaveBeenCalled();
  expect(callbacks.onState).toHaveBeenLastCalledWith('error');
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
});
test('preserves a failed save when backgrounding so it can still be retried', async () => {
  await connect();
  jest
    .mocked(speakingService.saveLiveTurn)
    .mockRejectedValueOnce(new Error('offline'));
  service.sendText('Hello');
  response();
  await flush();
  service.interrupt();
  await service.retrySave();
  expect(callbacks.onSaved).toHaveBeenCalled();
  expect(service.hasUnsavedTurn()).toBe(false);
});
test('timeouts do not save incomplete transcriptions', async () => {
  jest.useFakeTimers();
  await connect();
  await service.startSpeaking();
  await service.stopSpeaking();
  response();
  jest.advanceTimersByTime(3000);
  expect(speakingService.saveLiveTurn).not.toHaveBeenCalled();
  expect(callbacks.onState).toHaveBeenLastCalledWith('error');
});

test('can discard an unsaved turn to recover from a stale session sequence', async () => {
  await connect();
  jest
    .mocked(speakingService.saveLiveTurn)
    .mockRejectedValueOnce(new Error('session changed'));
  service.sendText('Hello');
  response();
  await flush();
  expect(service.hasUnsavedTurn()).toBe(true);
  service.discardUnsavedTurn();
  expect(service.hasUnsavedTurn()).toBe(false);
  expect(callbacks.onTranscript).toHaveBeenLastCalledWith('', '');
  expect(callbacks.onState).toHaveBeenLastCalledWith('idle');
});

test('reads the persisted opening aloud once without saving a synthetic user turn', async () => {
  await connect('こんにちは！');
  expect(callbacks.onState).toHaveBeenLastCalledWith('processing');
  expect(Socket.instance.sent).toHaveLength(3);
  expect(JSON.stringify(Socket.instance.sent[2])).toContain('こんにちは！');
  expect(service.sendText('Too early')).toBe(false);
  await service.startSpeaking();
  expect(audio.start).not.toHaveBeenCalled();
  response();
  await flush();
  expect(audio.play).toHaveBeenCalledWith('PCM');
  expect(speakingService.saveLiveTurn).not.toHaveBeenCalled();
  expect(callbacks.onTranscript).not.toHaveBeenCalled();
  expect(callbacks.onState).toHaveBeenLastCalledWith('ready');
  Socket.instance.receive({
    serverContent: { outputTranscription: { text: 'Late opening transcript' } },
  });
  expect(callbacks.onTranscript).not.toHaveBeenCalled();
  expect(service.sendText('Hello')).toBe(true);
  response();
  await flush();
  expect(speakingService.saveLiveTurn).toHaveBeenCalledWith(
    'session',
    expect.objectContaining({
      user_text: 'Hello',
      assistant_text: 'Hi!',
      after_sequence: 1,
    }),
  );
});

test('does not read the opening again for a conversation that already has user turns', async () => {
  jest.mocked(speakingService.liveToken).mockResolvedValueOnce({
    token: 'ephemeral',
    model: 'models/live',
    lease: 'signed',
    last_sequence: 3,
    history: [],
  });
  await connect('こんにちは！');
  expect(Socket.instance.sent).toHaveLength(2);
  expect(callbacks.onState).toHaveBeenLastCalledWith('ready');
});

test('reports an opening audio timeout and stops playback', async () => {
  jest.useFakeTimers();
  await connect('こんにちは！');
  jest.advanceTimersByTime(45000);
  expect(callbacks.onState).toHaveBeenLastCalledWith('error');
  expect(callbacks.onError).toHaveBeenCalledWith(
    'Không đọc được lời mở đầu. Hãy kết nối lại.',
  );
  expect(audio.stopPlayback).toHaveBeenCalled();
  expect(speakingService.saveLiveTurn).not.toHaveBeenCalled();
});

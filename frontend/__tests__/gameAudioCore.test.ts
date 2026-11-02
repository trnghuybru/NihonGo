import { audioClient } from '../src/services/gameAudioCore';
const mockMic = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockPreflightStop = jest.fn();
const mockPreflight = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockHandlers = new Map<string, (...args: any[]) => void>();
const mockRemoteParticipants = new Map();
const mockPermissions = { canPublish: true };
const mockStartAudio = jest.fn().mockResolvedValue(undefined);
jest.mock('livekit-client', () => ({
  Room: jest.fn().mockImplementation(() => ({
    on: jest.fn((event, callback) => mockHandlers.set(event, callback)),
    connect: mockConnect,
    disconnect: mockDisconnect,
    startAudio: mockStartAudio,
    canPlaybackAudio: true,
    remoteParticipants: mockRemoteParticipants,
    localParticipant: {
      permissions: mockPermissions,
      setMicrophoneEnabled: mockMic,
    },
  })),
  RoomEvent: {
    Disconnected: 'disconnected',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    AudioPlaybackStatusChanged: 'audioPlaybackStatusChanged',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
  },
  Track: { Kind: { Audio: 'audio' } },
  createLocalAudioTrack: (...args: unknown[]) => mockPreflight(...args),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.clear();
  mockRemoteParticipants.clear();
  mockPermissions.canPublish = true;
  mockPreflight.mockResolvedValue({ stop: mockPreflightStop });
});

test('attaches tracks for both directions, cleans up when unpublished and reattaches after another turn', async () => {
  const cleanup = jest.fn();
  const platform = {
    start: jest.fn(),
    stop: jest.fn(),
    attach: jest.fn().mockReturnValue(cleanup),
  };
  const audio = audioClient(platform);
  await audio.connect('ws://room', 'token', jest.fn());
  const first = { kind: 'audio' },
    second = { kind: 'audio' };
  mockHandlers.get('trackSubscribed')!(first);
  mockHandlers.get('trackSubscribed')!(first);
  expect(platform.attach).toHaveBeenCalledTimes(1);
  mockHandlers.get('trackUnsubscribed')!(first);
  expect(cleanup).toHaveBeenCalledTimes(1);
  mockHandlers.get('trackSubscribed')!(second);
  expect(platform.attach).toHaveBeenCalledTimes(2);
  await audio.close();
  expect(cleanup).toHaveBeenCalledTimes(2);
});

test('reports blocked playback separately from connection and allows an explicit user unlock', async () => {
  const platform = {
    autoplay: true,
    start: jest.fn(),
    stop: jest.fn(),
    attach: jest.fn(),
  };
  const audio = audioClient(platform),
    status = jest.fn(),
    blocked = jest.fn();
  mockStartAudio.mockRejectedValueOnce(new Error('NotAllowedError'));
  await audio.connect('ws://room', 'token', status, blocked);
  expect(status).toHaveBeenLastCalledWith(true);
  expect(blocked).toHaveBeenLastCalledWith(true);
  await audio.resumePlayback();
  expect(mockStartAudio).toHaveBeenCalledTimes(2);
  await audio.close();
});

test('does not reopen microphone when a turn ends while permission is still arriving', async () => {
  jest.useFakeTimers();
  try {
    const audio = audioClient({
      start: jest.fn(),
      stop: jest.fn(),
      attach: jest.fn(),
    });
    await audio.connect('ws://room', 'token', jest.fn());
    mockPermissions.canPublish = false;
    const opening = audio.setSpeaking(true);
    await Promise.resolve();
    const ending = audio.setSpeaking(false);
    mockPermissions.canPublish = true;
    await jest.advanceTimersByTimeAsync(100);
    await Promise.all([opening, ending]);
    expect(mockMic.mock.calls.some(call => call[0] === true)).toBe(false);
    expect(mockMic).toHaveBeenLastCalledWith(false, expect.any(Object));
    await audio.close();
  } finally {
    jest.useRealTimers();
  }
});

test('waits for a permission update that arrives after the old one-second limit', async () => {
  jest.useFakeTimers();
  try {
    const audio = audioClient({
      start: jest.fn(),
      stop: jest.fn(),
      attach: jest.fn(),
    });
    await audio.connect('ws://room', 'token', jest.fn());
    mockPermissions.canPublish = false;
    const opening = audio.setSpeaking(true);
    await jest.advanceTimersByTimeAsync(1500);
    expect(mockMic).not.toHaveBeenCalled();
    mockPermissions.canPublish = true;
    await jest.advanceTimersByTimeAsync(100);
    await opening;
    expect(mockMic).toHaveBeenLastCalledWith(true, expect.any(Object));
    await audio.close();
  } finally {
    jest.useRealTimers();
  }
});

test('manual reconnect resets readiness so an existing holder republishes the microphone', async () => {
  const audio = audioClient({
    start: jest.fn(),
    stop: jest.fn(),
    attach: jest.fn(),
  });
  const ready = jest.fn();
  await audio.connect('ws://room', 'first-token', ready);
  await audio.setSpeaking(true);
  await audio.connect('ws://room', 'replacement-token', ready);
  expect(ready.mock.calls.map(call => call[0])).toEqual([
    false,
    true,
    false,
    true,
  ]);
  await audio.setSpeaking(true);
  expect(mockMic.mock.calls.filter(call => call[0] === true)).toHaveLength(2);
  await audio.close();
});
test('checks microphone permission without publishing and only enables it for the granted turn', async () => {
  const platform = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    attach: jest.fn(),
  };
  const audio = audioClient(platform),
    ready = jest.fn();
  await audio.connect('ws://room', 'token', ready);
  expect(mockPreflightStop).toHaveBeenCalledTimes(1);
  expect(mockMic).not.toHaveBeenCalled();
  expect(ready).toHaveBeenLastCalledWith(true);
  await audio.setSpeaking(true);
  expect(mockMic).toHaveBeenCalledWith(true, expect.any(Object));
  await audio.setSpeaking(false);
  expect(mockMic).toHaveBeenLastCalledWith(false, expect.any(Object));
  await audio.close();
  expect(mockDisconnect).toHaveBeenCalledTimes(1);
  expect(platform.stop).toHaveBeenCalledTimes(1);
  await audio.close();
  expect(platform.stop).toHaveBeenCalledTimes(1);
});
test('stops the native audio session when microphone permission is denied', async () => {
  const platform = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    attach: jest.fn(),
  };
  mockPreflight.mockRejectedValueOnce(new Error('Permission denied'));
  const audio = audioClient(platform),
    ready = jest.fn();
  await expect(audio.connect('ws://room', 'token', ready)).rejects.toThrow(
    'Permission denied',
  );
  expect(ready).toHaveBeenCalledWith(false);
  expect(mockConnect).not.toHaveBeenCalled();
  expect(platform.stop).toHaveBeenCalledTimes(1);
});

import { audioClient } from '../src/services/gameAudioCore';
const mockMic = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockPreflightStop = jest.fn();
const mockPreflight = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
jest.mock('livekit-client', () => ({
  Room: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: mockConnect,
    disconnect: mockDisconnect,
    startAudio: jest.fn().mockResolvedValue(undefined),
    localParticipant: {
      permissions: { canPublish: true },
      setMicrophoneEnabled: mockMic,
    },
  })),
  RoomEvent: {
    Disconnected: 'disconnected',
    TrackSubscribed: 'trackSubscribed',
  },
  Track: { Kind: { Audio: 'audio' } },
  createLocalAudioTrack: (...args: unknown[]) => mockPreflight(...args),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockPreflight.mockResolvedValue({ stop: mockPreflightStop });
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

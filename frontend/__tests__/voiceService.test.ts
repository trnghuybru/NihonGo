import Voice from '@react-native-voice/voice';
import { voiceService } from '../src/services/voiceService';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: { Voice: {} },
  PermissionsAndroid: {},
}));
jest.mock('@react-native-voice/voice', () => ({
  __esModule: true,
  default: {
    destroy: jest.fn().mockResolvedValue(undefined),
    removeAllListeners: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
  },
}));

test('waits for old microphone cleanup before starting a newly mounted conversation', async () => {
  let finishCleanup!: () => void;
  jest.mocked(Voice.destroy).mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finishCleanup = resolve;
      }),
  );
  voiceService.init({});
  const cleanup = voiceService.destroy();
  const onStart = jest.fn();
  voiceService.init({ onStart });
  const start = voiceService.start('ja-JP');
  await Promise.resolve();
  expect(Voice.start).not.toHaveBeenCalled();
  finishCleanup();
  await cleanup;
  await start;
  expect(Voice.start).toHaveBeenCalledWith('ja-JP', expect.any(Object));
  Voice.onSpeechStart?.();
  expect(onStart).toHaveBeenCalledTimes(1);
  await voiceService.destroy();
});

test('does not open the microphone if the screen leaves while permissions are pending', async () => {
  jest.mocked(Voice.start).mockClear();
  let finishPermission!: (value: boolean) => void;
  const permission = jest
    .spyOn(voiceService, 'requestPermissions')
    .mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          finishPermission = resolve;
        }),
    );
  voiceService.init({});
  const start = voiceService.start();
  await Promise.resolve();
  await voiceService.destroy();
  finishPermission(true);
  await start;
  expect(Voice.start).not.toHaveBeenCalled();
  permission.mockRestore();
});

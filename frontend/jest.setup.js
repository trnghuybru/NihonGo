/* eslint-env jest */
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  AuthorizationStatus: { DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  AndroidImportance: { DEFAULT: 3 },
  TriggerType: { TIMESTAMP: 0 },
  EventType: { PRESS: 1 },
  default: {
    getTriggerNotificationIds: jest.fn().mockResolvedValue([]),
    getTriggerNotifications: jest.fn().mockResolvedValue([]),
    getDisplayedNotifications: jest.fn().mockResolvedValue([]),
    cancelNotification: jest.fn().mockResolvedValue(undefined),
    getNotificationSettings: jest
      .fn()
      .mockResolvedValue({ authorizationStatus: 1 }),
    requestPermission: jest.fn().mockResolvedValue({ authorizationStatus: 1 }),
    createChannel: jest.fn().mockResolvedValue('flashcard-review'),
    createTriggerNotification: jest.fn().mockResolvedValue('id'),
    getInitialNotification: jest.fn().mockResolvedValue(null),
    onForegroundEvent: jest.fn(() => () => {}),
    onBackgroundEvent: jest.fn(),
  },
}));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly' },
  getGenericPassword: jest.fn().mockResolvedValue(false),
  setGenericPassword: jest.fn().mockResolvedValue({ service: 'auth' }),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-tts', () => ({
  __esModule: true,
  default: {
    getInitStatus: jest.fn().mockResolvedValue('success'),
    voices: jest
      .fn()
      .mockResolvedValue([
        { id: 'ja', language: 'ja-JP', notInstalled: false },
      ]),
    setDefaultLanguage: jest.fn().mockResolvedValue('success'),
    setDefaultVoice: jest.fn().mockResolvedValue('success'),
    speak: jest.fn().mockResolvedValue('utterance'),
    stop: jest.fn().mockResolvedValue(true),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('./src/services/gameAudio', () => ({
  createGameAudio: jest.fn(() => ({
    connect: jest.fn(),
    setSpeaking: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

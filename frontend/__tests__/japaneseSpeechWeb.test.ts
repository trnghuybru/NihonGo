import { JapaneseSpeech } from '../src/services/japaneseSpeech.web';

const speak = jest.fn();
const cancel = jest.fn();
const getVoices = jest.fn();
const synth = {
  speak,
  cancel,
  getVoices,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};
const originalWindow = globalThis.window;
const originalUtterance = globalThis.SpeechSynthesisUtterance;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { speechSynthesis: synth },
  });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: class {
      constructor(public text: string) {}
    },
  });
  getVoices.mockReturnValue([
    { lang: 'en-US' },
    { lang: 'ja-JP', name: 'Japanese' },
  ]);
});
afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: originalUtterance,
  });
  jest.useRealTimers();
});
test('selects a Japanese voice and cancels the current utterance', async () => {
  const player = new JapaneseSpeech();
  const end = jest.fn();
  await player.speak('がっこう', end, jest.fn());
  const utterance = speak.mock.calls[0][0];
  expect(utterance.text).toBe('がっこう');
  expect(utterance.voice.lang).toBe('ja-JP');
  player.stop();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(utterance.onend).toBeNull();
  expect(end).not.toHaveBeenCalled();
});
test('cancels asynchronous voice loading when leaving the screen', async () => {
  jest.useFakeTimers();
  getVoices.mockReturnValue([]);
  const player = new JapaneseSpeech();
  const pending = player.speak('がっこう', jest.fn(), jest.fn());
  player.stop();
  await pending;
  jest.runAllTimers();
  expect(speak).not.toHaveBeenCalled();
  expect(synth.removeEventListener).toHaveBeenCalledWith(
    'voiceschanged',
    expect.any(Function),
  );
});

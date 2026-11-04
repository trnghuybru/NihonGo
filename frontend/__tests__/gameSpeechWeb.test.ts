import { createGameSpeech } from '../src/services/gameSpeech.web';

let instance: any;
const callbacks = () => ({
  onText: jest.fn(),
  onFinal: jest.fn(),
  onError: jest.fn(),
  onEnd: jest.fn(),
});
const previous = Object.getOwnPropertyDescriptor(global, 'window');
beforeEach(() => {
  Object.defineProperty(global, 'window', {
    configurable: true,
    value: {
      webkitSpeechRecognition: class {
        start = jest.fn();
        stop = jest.fn();
        abort = jest.fn();
        constructor() {
          // eslint-disable-next-line consistent-this
          instance = this;
        }
      },
    },
  });
});
afterEach(() => {
  if (previous) Object.defineProperty(global, 'window', previous);
  else delete (global as any).window;
});
test('recognizes Japanese and submits only final alternatives once', () => {
  const speech = createGameSpeech(),
    events = callbacks();
  speech.start(events);
  expect(instance.lang).toBe('ja-JP');
  expect(instance.maxAlternatives).toBe(3);
  instance.onresult({
    results: [Object.assign([{ transcript: 'がっこう' }], { isFinal: false })],
  });
  expect(events.onText).toHaveBeenLastCalledWith('がっこう');
  expect(events.onFinal).not.toHaveBeenCalled();
  instance.onresult({
    results: [
      Object.assign([{ transcript: '学校' }, { transcript: 'がっこう' }], {
        isFinal: true,
      }),
    ],
  });
  instance.onerror();
  instance.onend();
  expect(events.onFinal).toHaveBeenCalledTimes(1);
  expect(events.onFinal).toHaveBeenCalledWith(['学校', 'がっこう']);
  expect(events.onError).not.toHaveBeenCalled();
  expect(events.onEnd).not.toHaveBeenCalled();
  speech.close();
});
test('ignores late results after leaving the turn and stopping requests a final result', () => {
  const speech = createGameSpeech(),
    events = callbacks();
  speech.start(events);
  speech.stop();
  expect(instance.stop).toHaveBeenCalledTimes(1);
  const late = instance.onresult;
  speech.close();
  late({ results: [Object.assign([{ transcript: '猫' }], { isFinal: true })] });
  expect(events.onFinal).not.toHaveBeenCalled();
  expect(instance.abort).toHaveBeenCalledTimes(1);
});
test('detects unavailable recognition without loading a native module', () => {
  Object.defineProperty(global, 'window', { configurable: true, value: {} });
  const speech = createGameSpeech(),
    events = callbacks();
  expect(speech.supported).toBe(false);
  speech.start(events);
  expect(events.onError).toHaveBeenCalledTimes(1);
});

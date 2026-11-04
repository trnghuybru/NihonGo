import { audioClient } from '../src/services/gameAudioCore';
import { createGameAudio } from '../src/services/gameAudio.web';
jest.mock('../src/services/gameAudioCore', () => ({ audioClient: jest.fn() }));

test('recovers blocked remote audio on a gesture and when a surviving track unmutes', async () => {
  const listeners = new Map<string, () => void>();
  const oldDocument = global.document;
  Object.defineProperty(global, 'document', {
    configurable: true,
    value: {
      body: { appendChild: jest.fn() },
      addEventListener: jest.fn((name, callback) =>
        listeners.set(name, callback),
      ),
      removeEventListener: jest.fn(name => listeners.delete(name)),
    },
  });
  try {
    createGameAudio();
    const platform = jest.mocked(audioClient).mock.calls[0][0];
    await platform.start();
    const handlers = new Map<string, () => void>();
    const element = {
      style: {},
      muted: true,
      setAttribute: jest.fn(),
      play: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error(), { name: 'NotAllowedError' }),
        )
        .mockResolvedValue(undefined),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      remove: jest.fn(),
    };
    const track = {
      attach: () => element,
      detach: jest.fn(),
      on: (name: string, callback: () => void) => handlers.set(name, callback),
      off: (name: string) => handlers.delete(name),
    };
    const blocked = jest.fn();
    const cleanup = platform.attach(track as any, blocked);
    await Promise.resolve();
    expect(blocked).toHaveBeenLastCalledWith(true);
    listeners.get('pointerup')!();
    await Promise.resolve();
    await Promise.resolve();
    expect(blocked).toHaveBeenLastCalledWith(false);
    expect(element.muted).toBe(false);
    handlers.get('unmuted')!();
    await Promise.resolve();
    expect(element.play).toHaveBeenCalledTimes(3);
    cleanup();
    expect(handlers.size).toBe(0);
    expect(track.detach).toHaveBeenCalledWith(element);
    await platform.stop();
    expect(listeners.size).toBe(0);
  } finally {
    Object.defineProperty(global, 'document', {
      configurable: true,
      value: oldDocument,
    });
  }
});

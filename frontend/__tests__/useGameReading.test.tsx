import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useGameReading } from '../src/hooks/useGameReading';
import { gameService, GameRoom } from '../src/services/gameService';
import type { SpeechCallbacks } from '../src/services/gameSpeech.types';

let mockCallbacks: SpeechCallbacks;
const mockStart = jest.fn((events: SpeechCallbacks) => {
  mockCallbacks = events;
});
const mockClose = jest.fn();
jest.mock('../src/services/gameSpeech', () => ({
  createGameSpeech: () => ({
    supported: true,
    start: mockStart,
    close: mockClose,
    stop: jest.fn(),
  }),
}));
jest.mock('../src/services/gameService', () => ({
  gameService: { action: jest.fn() },
}));
const receive = jest.fn();
const room = {
  code: 'ABC234',
  round_id: 'r1',
  recognizer: 'browser',
  mode: 'read',
  phase: 'reading',
  holder: 'u',
} as GameRoom;
let value: ReturnType<typeof useGameReading>;
function Probe({
  active = true,
  current = room,
}: {
  active?: boolean;
  current?: GameRoom;
}) {
  value = useGameReading(current, 'u', active, receive);
  return null;
}
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(gameService.action)
    .mockResolvedValue({ ...room, phase: 'results' });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
test('only starts for the holder after the live microphone is active', async () => {
  await act(async () => {
    tree = Renderer.create(<Probe active={false} />);
  });
  expect(mockStart).not.toHaveBeenCalled();
  await act(async () => {
    tree.update(<Probe current={{ ...room, holder: 'other' }} />);
  });
  expect(mockStart).not.toHaveBeenCalled();
  await act(async () => {
    tree.update(<Probe />);
  });
  expect(mockStart).toHaveBeenCalledTimes(1);
  await act(async () => {
    mockCallbacks.onText('がっこう');
  });
  expect(value.text).toBe('がっこう');
  expect(gameService.action).not.toHaveBeenCalled();
  await act(async () => {
    mockCallbacks.onFinal(['学校', 'がっこう']);
  });
  expect(gameService.action).toHaveBeenCalledWith('ABC234', 'speech-answer', {
    round_id: 'r1',
    alternatives: ['学校', 'がっこう'],
  });
  expect(receive).toHaveBeenCalledWith(
    expect.objectContaining({ phase: 'results' }),
  );
});
test('falls back without ending the live microphone when browser recognition fails', async () => {
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  await act(async () => {
    mockCallbacks.onError();
    mockCallbacks.onEnd();
  });
  expect(gameService.action).toHaveBeenCalledTimes(1);
  expect(gameService.action).toHaveBeenCalledWith('ABC234', 'finish-reading', {
    round_id: 'r1',
    fallback: true,
  });
});
test('ignores stale callbacks after the turn changes', async () => {
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  const old = mockCallbacks;
  await act(async () => {
    tree.update(<Probe current={{ ...room, phase: 'results' }} />);
  });
  await act(async () => {
    old.onFinal(['猫']);
    old.onError();
  });
  expect(gameService.action).not.toHaveBeenCalled();
});
test('retries the saved transcript without opening a new recognition session', async () => {
  jest.mocked(gameService.action).mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  await act(async () => {
    mockCallbacks.onFinal(['学校']);
  });
  expect(value.notice).toContain('thử lại');
  await act(async () => {
    value.finish();
  });
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(gameService.action).toHaveBeenCalledTimes(2);
  expect(receive).toHaveBeenCalledTimes(1);
});

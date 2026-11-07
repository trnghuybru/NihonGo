import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SharedGameRoomScreen } from '../src/screens/SharedGameRoomScreen';
import {
  sharedRoomService,
  SharedRoom,
} from '../src/services/sharedRoomService';
import { gameService } from '../src/services/gameService';
import { createGameAudio } from '../src/services/gameAudio';
jest.mock('../src/services/sharedRoomService', () => ({
  sharedRoomService: { snapshot: jest.fn(), action: jest.fn() },
}));
jest.mock('../src/services/gameService', () => ({
  gameService: {
    watch: jest.fn().mockResolvedValue(() => {}),
    audio: jest.fn(),
    catalog: jest.fn(),
  },
}));
let tree: Renderer.ReactTestRenderer;
const base: SharedRoom = {
  id: 'shared',
  code: 'ABC234',
  host_id: 'u0',
  version: 1,
  phase: 'waiting',
  game: 'read',
  selected_game: 'read',
  settings: {
    level: 'N5',
    source: 'jlpt',
    topic: 'Tất cả',
    lesson_id: null,
    question_count: 2,
    seconds: 15,
  },
  members: [
    { id: 'u0', name: 'A', ready: false },
    { id: 'u1', name: 'B', ready: false },
  ],
  round: 0,
  read_available: true,
  configured: true,
};
function control(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
test('checks audio before readiness and hands the same connection to the voice game', async () => {
  jest.mocked(sharedRoomService.snapshot).mockResolvedValue(base);
  jest
    .mocked(gameService.audio)
    .mockResolvedValue({ url: 'ws://audio', token: 'test' });
  const audio = createGameAudio();
  jest.mocked(createGameAudio).mockReturnValue(audio);
  jest
    .mocked(audio.connect)
    .mockImplementation(async (_url, _token, status) => {
      status(true);
    });
  let notify = () => {};
  jest.mocked(gameService.watch).mockImplementation(async (_code, refresh) => {
    notify = refresh;
    return () => {};
  });
  const render = jest.fn(() => <Text>Voice game</Text>);
  await act(async () => {
    tree = Renderer.create(
      <SharedGameRoomScreen
        code="ABC234"
        userId="u0"
        onExit={jest.fn()}
        renderGame={render}
      />,
    );
  });
  expect(control('Sẵn sàng').props.disabled).toBe(true);
  await act(async () => {
    await control('Kiểm tra âm thanh').props.onPress();
  });
  expect(audio.connect).toHaveBeenCalledWith(
    'ws://audio',
    'test',
    expect.any(Function),
    expect.any(Function),
  );
  expect(control('Sẵn sàng').props.disabled).toBe(false);
  const active = { ...base, version: 2, phase: 'countdown', round: 1 };
  jest.mocked(sharedRoomService.snapshot).mockResolvedValue(active);
  await act(async () => {
    notify();
  });
  expect(render).toHaveBeenLastCalledWith(
    'read',
    'ABC234',
    expect.any(Function),
    expect.objectContaining({ instance: audio, ready: true }),
  );
});
test('finished game goes back to the same lobby without a new room or code', async () => {
  const ended = { ...base, version: 3, phase: 'finished', round: 1 };
  jest.mocked(sharedRoomService.snapshot).mockResolvedValue(ended);
  let back = () => {};
  const render = jest.fn((_game, _code, onBack) => {
    back = onBack;
    return <Text>Results</Text>;
  });
  await act(async () => {
    tree = Renderer.create(
      <SharedGameRoomScreen
        code="ABC234"
        userId="u0"
        onExit={jest.fn()}
        renderGame={render}
      />,
    );
  });
  expect(render).toHaveBeenCalledWith(
    'read',
    'ABC234',
    expect.any(Function),
    undefined,
  );
  await act(async () => {
    back();
  });
  expect(control('Chọn Công thành Momo')).toBeDefined();
  expect(control('Áp dụng')).toBeDefined();
  expect(
    tree.root
      .findAllByType(Text)
      .some(node => node.props.children === 'ABC234'),
  ).toBe(true);
});

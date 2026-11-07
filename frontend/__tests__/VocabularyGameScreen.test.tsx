import { LearningLevelContext } from '../src/hooks/useLearningLevel';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput, Text } from 'react-native';
import {
  VocabularyGameScreen,
  VocabularyRoomScreen,
} from '../src/screens/VocabularyGameScreen';
import { WebNavigationContext } from '../src/navigation/webNavigation';
import { gameService, GameRoom } from '../src/services/gameService';
import { createGameAudio } from '../src/services/gameAudio';
import {
  sharedRoomService,
  SharedRoom,
} from '../src/services/sharedRoomService';
const mockSharedRoom: SharedRoom = {
  id: 'shared',
  code: 'ABC234',
  host_id: 'u',
  version: 1,
  phase: 'waiting',
  game: null,
  selected_game: 'castle',
  settings: {
    level: 'N5',
    source: 'starter',
    topic: 'Tất cả',
    lesson_id: null,
    question_count: 10,
    seconds: 9,
  },
  members: [{ id: 'u', name: 'Minh', ready: false }],
  round: 0,
  read_available: true,
  configured: false,
};
jest.mock('../src/services/sharedRoomService', () => ({
  sharedRoomService: {
    create: jest.fn(),
    snapshot: jest.fn(),
    action: jest.fn(),
  },
}));
const mockSoundPlay = jest.fn();
jest.mock('../src/services/gameSounds', () => ({
  createGameSounds: () => ({
    unlock: jest.fn().mockResolvedValue(undefined),
    play: mockSoundPlay,
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../src/services/gameService', () => ({
  gameService: {
    resolve: jest
      .fn()
      .mockResolvedValue({ game: 'vocabulary', mode: 'write', code: 'ABC234' }),
    catalog: jest.fn(),
    savedRoom: jest.fn().mockResolvedValue(null),
    saveRoom: jest.fn().mockResolvedValue(undefined),
    watch: jest.fn().mockResolvedValue(() => {}),
    create: jest.fn(),
    join: jest.fn(),
    snapshot: jest.fn(),
    action: jest.fn(),
    audio: jest.fn(),
  },
}));
const room: GameRoom = {
  id: 'r',
  code: 'ABC234',
  host_id: 'u',
  mode: 'write',
  phase: 'waiting',
  version: 1,
  level: 'N5',
  source: 'jlpt',
  lesson_id: null,
  question_count: 2,
  seconds: 15,
  number: 0,
  round_id: null,
  deadline: null,
  server_time: Date.now(),
  holder: null,
  voice_ready: false,
  players: [
    {
      id: 'u',
      name: 'Minh',
      ready: false,
      left: false,
      score: 0,
      submitted: false,
    },
  ],
  question: null,
  result: null,
  attempts: [],
  history: [],
};
let tree: Renderer.ReactTestRenderer;
const exit = jest.fn();
function control(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
async function press(label: string) {
  await act(async () => {
    await control(label).props.onPress();
  });
}
async function type(label: string, value: string) {
  await act(async () =>
    tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === label)!
      .props.onChangeText(value),
  );
}
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(sharedRoomService.create).mockResolvedValue(mockSharedRoom);
  jest.mocked(sharedRoomService.snapshot).mockResolvedValue(mockSharedRoom);
  jest.mocked(sharedRoomService.action).mockResolvedValue(mockSharedRoom);
  jest
    .mocked(gameService.resolve)
    .mockResolvedValue({ game: 'vocabulary', mode: 'write', code: 'ABC234' });

  jest.mocked(gameService.catalog).mockImplementation(async level => ({
    level,
    available_count: 30,
    lessons: [{ id: 'lesson', title: 'Bài 1', textbook: 'N4', word_count: 10 }],
    page: 1,
    total_pages: 1,
    read_available: false,
  }));
  jest.mocked(gameService.create).mockResolvedValue(room);
  await act(async () => {
    tree = Renderer.create(<VocabularyRoomScreen userId="u" onExit={exit} />);
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});
test('opens castle from the game library and returns to its three game cards', async () => {
  await act(async () => {
    tree.unmount();
    tree = Renderer.create(<VocabularyGameScreen userId="u" onExit={exit} />);
  });
  expect(control('Chơi Giành mic')).toBeDefined();
  expect(control('Chơi Đối kháng từ vựng')).toBeDefined();
  jest
    .mocked(gameService.resolve)
    .mockResolvedValueOnce({ game: 'shared', mode: 'write', code: 'ABC234' });
  await press('Chơi Công thành Momo');
  expect(
    tree.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Công thành Momo'),
  ).toBe(true);
  await press('Rời phòng, về kho game');
  expect(control('Chơi Công thành Momo')).toBeDefined();
});
test('shared code resolves to one lobby and does not join a legacy game directly', async () => {
  const navigate = jest.fn();
  jest
    .mocked(gameService.resolve)
    .mockResolvedValue({ game: 'shared', mode: 'write', code: 'ABC234' });
  await act(async () => {
    tree.unmount();
    tree = Renderer.create(
      <WebNavigationContext.Provider
        value={{
          pathname: '/games/ABC234',
          search: '',
          key: 'shared',
          state: null,
          navigate,
          back: jest.fn(),
        }}
      >
        <VocabularyGameScreen userId="u" onExit={exit} />
      </WebNavigationContext.Provider>,
    );
  });
  expect(control('Chọn Công thành Momo')).toBeDefined();
  expect(sharedRoomService.snapshot).toHaveBeenCalledWith('ABC234');
  expect(gameService.join).not.toHaveBeenCalled();
  await press('Rời phòng, về kho game');
  expect(navigate).toHaveBeenCalledWith('/games');
});
test('game library selects the voice game route without loading a room first', async () => {
  const navigate = jest.fn();
  await act(async () => {
    tree.unmount();
    tree = Renderer.create(
      <WebNavigationContext.Provider
        value={{
          pathname: '/games',
          search: '',
          key: 'library',
          state: null,
          navigate,
          back: jest.fn(),
        }}
      >
        <VocabularyGameScreen userId="u" onExit={exit} />
      </WebNavigationContext.Provider>,
    );
  });
  jest.clearAllMocks();
  await press('Chơi Giành mic');
  expect(sharedRoomService.create).toHaveBeenCalledWith('read', 'N5');
  expect(navigate).toHaveBeenCalledWith('/games/ABC234');
  expect(gameService.catalog).not.toHaveBeenCalled();
});
test('joins an existing room from the native game library', async () => {
  jest.mocked(gameService.join).mockResolvedValue(room);
  await act(async () => {
    tree.unmount();
    tree = Renderer.create(<VocabularyGameScreen userId="u" onExit={exit} />);
  });
  await type('Mã phòng', 'abc234');
  await press('Vào phòng');
  expect(gameService.join).toHaveBeenCalledWith('ABC234');
  expect(control('Sẵn sàng')).toBeDefined();
});
test('creates a room from the selected JLPT and lesson', async () => {
  await press('N4');
  expect(gameService.catalog).toHaveBeenLastCalledWith('N4', 1);
  await press('Chọn bài học');
  await press('Chọn Bài 1 · N4');
  await type('Số câu (1–30)', '2');
  await press('Tạo phòng');
  expect(gameService.create).toHaveBeenCalledWith({
    mode: 'write',
    level: 'N4',
    source: 'lesson',
    lesson_id: 'lesson',
    question_count: 2,
    seconds: 15,
  });
  expect(gameService.saveRoom).toHaveBeenCalledWith('u', 'ABC234');
  expect(control('Sẵn sàng')).toBeDefined();
});
test('disables read mode when room audio is not configured and joins by code', async () => {
  expect(control('Giành mic').props.disabled).toBe(true);
  jest.mocked(gameService.join).mockResolvedValue(room);
  await type('Mã phòng', 'abc234');
  await press('Vào phòng');
  expect(gameService.join).toHaveBeenCalledWith('ABC234');
  expect(control('Bắt đầu trận').props.disabled).toBe(true);
});
test('sends only one writing answer for the current round', async () => {
  const current = {
    ...room,
    phase: 'question' as const,
    round_id: 'round',
    number: 1,
    deadline: Date.now() + 15000,
    question: { word: '学校' },
  };
  jest.mocked(gameService.join).mockResolvedValue(current);
  await type('Mã phòng', 'ABC234');
  await press('Vào phòng');
  expect(control('Gửi đáp án').props.disabled).toBe(true);
  await type('Cách đọc (kana)', 'がっこう');
  jest.mocked(gameService.action).mockResolvedValue({
    ...current,
    version: 2,
    players: [{ ...room.players[0], submitted: true }],
  });
  await press('Gửi đáp án');
  expect(gameService.action).toHaveBeenCalledWith('ABC234', 'answer', {
    round_id: 'round',
    answer: 'がっこう',
  });
  expect(control('Đã gửi đáp án').props.disabled).toBe(true);
});

test('a non-host sees every player in the final standings', async () => {
  const finished: GameRoom = {
    ...room,
    host_id: 'other',
    phase: 'finished',
    version: 4,
    players: [
      { ...room.players[0], score: 10 },
      { ...room.players[0], id: 'other', name: 'Lan', score: 20 },
    ],
    history: [
      { number: 1, word: '猫', reading: 'ねこ', meaning: 'mèo', attempts: [] },
    ],
  };
  jest.mocked(gameService.join).mockResolvedValue(finished);
  await type('Mã phòng', 'ABC234');
  await press('Vào phòng');
  const summary = tree.root.findByProps({ testID: 'game-final-standings' });
  // Rendered text nodes, rather than host-only actions, define the visible summary.
  const labels = summary
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');
  expect(labels).toContain('Minh');
  expect(labels).toContain('Lan');
  expect(labels).toContain('20');
  expect(control('Về khu chơi')).toBeDefined();
});

test('new shared room starts at the profile level', async () => {
  await act(async () => {
    tree.unmount();
    tree = Renderer.create(
      <LearningLevelContext.Provider value="N2">
        <VocabularyGameScreen userId="u" onExit={exit} />
      </LearningLevelContext.Provider>,
    );
  });
  jest
    .mocked(gameService.resolve)
    .mockResolvedValueOnce({ game: 'shared', mode: 'write', code: 'ABC234' });
  await press('Chơi Đối kháng từ vựng');
  expect(sharedRoomService.create).toHaveBeenCalledWith('write', 'N2');
});
test('keeps the mic action visible while another player reads and restores it next round', async () => {
  const current: GameRoom = {
    ...room,
    mode: 'read',
    phase: 'question',
    round_id: 'round-1',
    deadline: Date.now() + 15000,
    voice_ready: true,
    question: { word: '学校' },
  };
  jest.mocked(createGameAudio).mockReturnValueOnce({
    connect: jest.fn(async (_url, _token, ready) => {
      ready(true);
    }),
    setSpeaking: jest.fn().mockResolvedValue(undefined),
    resumePlayback: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  });
  jest
    .mocked(gameService.audio)
    .mockResolvedValue({ url: 'wss://voice', token: 'test' });
  jest.mocked(gameService.join).mockResolvedValue(current);
  await type('Mã phòng', 'ABC234');
  await press('Vào phòng');
  await press('Kiểm tra âm thanh');
  expect(control('Giành lượt đọc').props.disabled).toBe(false);
  const notify = jest.mocked(gameService.watch).mock.calls.at(-1)![1];
  jest.mocked(gameService.snapshot).mockResolvedValue({
    ...current,
    version: 2,
    phase: 'reading',
    holder: 'other',
  });
  await act(async () => {
    notify();
  });
  expect(control('Người khác đang đọc').props.disabled).toBe(true);
  jest.mocked(gameService.snapshot).mockResolvedValue({
    ...current,
    version: 3,
    round_id: 'round-2',
  });
  await act(async () => {
    notify();
  });
  expect(control('Giành lượt đọc').props.disabled).toBe(false);
});

test('only shows the microphone as active after publication has completed', async () => {
  const current: GameRoom = {
    ...room,
    mode: 'read',
    phase: 'question',
    round_id: 'round-1',
    deadline: Date.now() + 15000,
    voice_ready: true,
    question: { word: '学校' },
  };
  let publish!: () => void;
  jest.mocked(createGameAudio).mockReturnValueOnce({
    connect: jest.fn(async (_url, _token, ready) => {
      ready(true);
    }),
    setSpeaking: jest.fn(enabled =>
      enabled
        ? new Promise<void>(resolve => {
            publish = resolve;
          })
        : Promise.resolve(),
    ),
    resumePlayback: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  });
  jest
    .mocked(gameService.audio)
    .mockResolvedValue({ url: 'wss://voice', token: 'test' });
  jest.mocked(gameService.join).mockResolvedValue(current);
  await type('Mã phòng', 'ABC234');
  await press('Vào phòng');
  await press('Kiểm tra âm thanh');
  jest.mocked(gameService.action).mockResolvedValue({
    ...current,
    version: 2,
    phase: 'reading',
    holder: 'u',
  });
  await press('Giành lượt đọc');
  expect(control('Đang bật micro…').props.disabled).toBe(true);
  await act(async () => {
    publish();
  });
  expect(control('Đọc xong').props.disabled).toBe(false);
});

test('plays result cues once per round and muting cues leaves player audio alone', async () => {
  const current: GameRoom = {
    ...room,
    phase: 'question',
    round_id: 'r1',
    deadline: Date.now() + 15000,
  };
  jest.mocked(gameService.join).mockResolvedValue(current);
  await type('Mã phòng', 'ABC234');
  await press('Vào phòng');
  const notify = jest.mocked(gameService.watch).mock.calls.at(-1)![1];
  const result: GameRoom = {
    ...current,
    phase: 'results',
    version: 2,
    attempts: [
      {
        user_id: 'u',
        answer: 'a',
        correct: true,
        rank: 1,
        points: 10,
        sequence: 1,
      },
    ],
  };
  jest.mocked(gameService.snapshot).mockResolvedValue(result);
  await act(async () => {
    notify();
  });
  jest
    .mocked(gameService.snapshot)
    .mockResolvedValue({ ...result, version: 3 });
  await act(async () => {
    notify();
  });
  expect(
    mockSoundPlay.mock.calls.filter(([cue]) => cue === 'correct'),
  ).toHaveLength(1);
  await press('Tắt âm báo trò chơi');
  jest
    .mocked(gameService.snapshot)
    .mockResolvedValue({ ...result, version: 4, round_id: 'r2', attempts: [] });
  await act(async () => {
    notify();
  });
  expect(mockSoundPlay).not.toHaveBeenCalledWith('incorrect');
});

test('does not lose a turn change notified while an older snapshot is in flight', async () => {
  jest.mocked(gameService.join).mockResolvedValue(room);
  await type('Mã phòng', 'ABC234');
  await press('Vào phòng');
  const notify = jest.mocked(gameService.watch).mock.calls.at(-1)![1];
  let complete!: (value: GameRoom) => void;
  jest
    .mocked(gameService.snapshot)
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ...room,
      phase: 'question',
      version: 3,
      round_id: 'next',
      deadline: Date.now() + 15000,
    });
  await act(async () => {
    notify();
    notify();
  });
  await act(async () => {
    complete({ ...room, version: 2 });
  });
  expect(gameService.snapshot).toHaveBeenCalledTimes(2);
  expect(control('Gửi đáp án')).toBeDefined();
});

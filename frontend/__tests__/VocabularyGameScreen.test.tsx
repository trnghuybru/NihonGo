import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { VocabularyGameScreen } from '../src/screens/VocabularyGameScreen';
import { gameService, GameRoom } from '../src/services/gameService';
jest.mock('../src/services/gameService', () => ({
  gameService: {
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
  jest
    .mocked(gameService.catalog)
    .mockImplementation(async level => ({
      level,
      available_count: 30,
      lessons: [
        { id: 'lesson', title: 'Bài 1', textbook: 'N4', word_count: 10 },
      ],
      page: 1,
      total_pages: 1,
      read_available: false,
    }));
  jest.mocked(gameService.create).mockResolvedValue(room);
  await act(async () => {
    tree = Renderer.create(<VocabularyGameScreen userId="u" onExit={exit} />);
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
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
  jest
    .mocked(gameService.action)
    .mockResolvedValue({
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

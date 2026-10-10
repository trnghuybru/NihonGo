import React from 'react';
import { Alert, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { SpeakingHistory } from '../src/screens/SpeakingHistory';
import {
  speakingService,
  ConversationHistory,
} from '../src/services/speakingService';

jest.mock('../src/services/speakingService', () => ({
  speakingService: { history: jest.fn(), deleteSession: jest.fn() },
}));
const history: ConversationHistory = {
  items: [
    {
      id: 'first',
      title: 'Làm quen',
      role_name: 'Aoi',
      status: 'active',
      last_activity_at: '2026-10-10T06:00:00Z',
      last_message: 'こんにちは',
    },
    {
      id: 'second',
      title: 'Phỏng vấn',
      role_name: 'Aoi',
      status: 'completed',
      last_activity_at: '2026-10-09T06:00:00Z',
      last_message: 'よろしくお願いします',
    },
  ],
  pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 },
};
let tree: Renderer.ReactTestRenderer;
const open = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.mocked(speakingService.history).mockResolvedValue(history);
  jest
    .mocked(speakingService.deleteSession)
    .mockResolvedValue({ deleted: true, audio_cleanup_pending: false });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
});
async function render() {
  await act(async () => {
    tree = Renderer.create(
      <SpeakingHistory
        refreshKey={0}
        opening={false}
        openError=""
        onOpen={open}
      />,
    );
  });
}
function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
function confirm() {
  return jest
    .mocked(Alert.alert)
    .mock.calls.at(-1)![2]!
    .find(value => value.style === 'destructive')!.onPress!;
}
test('asks for explicit confirmation and does not open the conversation when deleting', async () => {
  await render();
  await act(async () => button('Xóa hội thoại Làm quen').props.onPress());
  expect(Alert.alert).toHaveBeenCalledWith(
    'Xóa buổi hội thoại?',
    expect.stringContaining('không thể khôi phục'),
    expect.any(Array),
    { cancelable: true },
  );
  expect(speakingService.deleteSession).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(button('Mở hội thoại Làm quen')).toBeDefined();
});
test('removes only the confirmed session and reloads pagination', async () => {
  await render();
  jest
    .mocked(speakingService.history)
    .mockResolvedValueOnce({
      ...history,
      items: [history.items[1]],
      pagination: { ...history.pagination, total: 1 },
    });
  await act(async () => button('Xóa hội thoại Làm quen').props.onPress());
  await act(async () => confirm()());
  expect(speakingService.deleteSession).toHaveBeenCalledWith('first');
  expect(speakingService.history).toHaveBeenCalledTimes(2);
  expect(button('Mở hội thoại Làm quen')).toBeUndefined();
  expect(button('Mở hội thoại Phỏng vấn')).toBeDefined();
});
test('preserves the card and shows a retryable error when deletion fails', async () => {
  jest
    .mocked(speakingService.deleteSession)
    .mockRejectedValueOnce(new Error('Chưa xóa được hội thoại.'));
  await render();
  await act(async () => button('Xóa hội thoại Làm quen').props.onPress());
  await act(async () => confirm()());
  expect(button('Mở hội thoại Làm quen')).toBeDefined();
  expect(button('Xóa hội thoại Làm quen').props.disabled).toBe(false);
  const text = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
  expect(text).toContain('Chưa xóa được hội thoại.');
});
test('blocks duplicate confirmation and opening cards while deletion is in flight', async () => {
  let resolve!: (value: {
    deleted: boolean;
    audio_cleanup_pending: boolean;
  }) => void;
  jest.mocked(speakingService.deleteSession).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await render();
  await act(async () => button('Xóa hội thoại Làm quen').props.onPress());
  const action = confirm();
  await act(async () => {
    action();
    action();
  });
  expect(speakingService.deleteSession).toHaveBeenCalledTimes(1);
  expect(button('Mở hội thoại Phỏng vấn').props.disabled).toBe(true);
  expect(button('Xóa hội thoại Phỏng vấn').props.disabled).toBe(true);
  jest
    .mocked(speakingService.history)
    .mockResolvedValueOnce({ ...history, items: [history.items[1]] });
  await act(async () =>
    resolve({ deleted: true, audio_cleanup_pending: false }),
  );
});

import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { HandwritingLookup } from '../src/components/HandwritingLookup';
import { HandwritingCanvas } from '../src/components/HandwritingCanvas';
import {
  handwritingService,
  HandwritingResult,
} from '../src/services/handwritingService';
jest.mock('../src/services/handwritingService', () => ({
  handwritingService: { recognize: jest.fn() },
}));
let tree: Renderer.ReactTestRenderer;
const onClose = jest.fn(),
  onSelect = jest.fn();
const image = 'data:image/png;base64,aW5r';
const result: HandwritingResult = {
  predictions: [
    { character: '一', score: 0.9 },
    { character: '二', score: 0.05 },
  ],
  elapsed_ms: 10,
};
function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
async function draw(value = image) {
  await act(async () => {
    tree.root.findByType(HandwritingCanvas).props.onStrokeStart();
    tree.root.findByType(HandwritingCanvas).props.onChange(value);
  });
}
async function pause(ms = 300) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(handwritingService.recognize).mockResolvedValue(result);
  await act(async () => {
    tree = Renderer.create(
      <HandwritingLookup onClose={onClose} onSelect={onSelect} />,
    );
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});
test('automatically recognizes after a pause and allows selecting a candidate', async () => {
  expect(button('Nhận dạng')).toBeUndefined();
  expect(button('Xóa nét').props.disabled).toBe(true);
  await pause();
  expect(handwritingService.recognize).not.toHaveBeenCalled();
  await draw();
  await pause(299);
  expect(handwritingService.recognize).not.toHaveBeenCalled();
  await pause(1);
  expect(handwritingService.recognize).toHaveBeenCalledWith(image);
  await act(async () => button('Tra ký tự 一').props.onPress());
  expect(onSelect).toHaveBeenCalledWith('一');
  await act(async () => button('Xóa nét').props.onPress());
  expect(button('Xóa nét').props.disabled).toBe(true);
  expect(button('Tra ký tự 一')).toBeUndefined();
});
test('debounces consecutive strokes and submits only the latest image', async () => {
  await draw();
  await pause(200);
  const latest = image + 'new';
  await draw(latest);
  await pause(299);
  expect(handwritingService.recognize).not.toHaveBeenCalled();
  await pause(1);
  expect(handwritingService.recognize).toHaveBeenCalledTimes(1);
  expect(handwritingService.recognize).toHaveBeenCalledWith(latest);
});
test('keeps drawing enabled during a request, discards stale results, and processes the newest queued image', async () => {
  let resolve!: (value: HandwritingResult) => void;
  jest
    .mocked(handwritingService.recognize)
    .mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce({
      predictions: [{ character: '三', score: 1 }],
      elapsed_ms: 10,
    });
  await draw();
  await pause();
  expect(button('Xóa nét').props.disabled).toBe(false);
  await act(async () =>
    tree.root.findByType(HandwritingCanvas).props.onStrokeStart(),
  );
  await act(async () =>
    tree.root.findByType(HandwritingCanvas).props.onChange(image + 'second'),
  );
  await pause();
  await draw(image + 'third');
  await pause();
  expect(handwritingService.recognize).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve(result);
  });
  expect(handwritingService.recognize).toHaveBeenCalledTimes(2);
  expect(handwritingService.recognize).toHaveBeenLastCalledWith(
    image + 'third',
  );
  expect(button('Tra ký tự 一')).toBeUndefined();
  expect(button('Tra ký tự 三')).toBeDefined();
});
test('clearing cancels waiting recognition and ignores in-flight responses', async () => {
  await draw();
  await act(async () => button('Xóa nét').props.onPress());
  await pause();
  expect(handwritingService.recognize).not.toHaveBeenCalled();
  let resolve!: (value: HandwritingResult) => void;
  jest.mocked(handwritingService.recognize).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await draw();
  await pause();
  await act(async () => button('Xóa nét').props.onPress());
  await act(async () => {
    resolve(result);
  });
  expect(button('Tra ký tự 一')).toBeUndefined();
  await draw();
  await pause();
  expect(button('Tra ký tự 一')).toBeDefined();
});
test('shows automatic recognition failures and supports retry', async () => {
  jest
    .mocked(handwritingService.recognize)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await draw();
  await pause();
  expect(
    tree.root
      .findAllByType(Text)
      .some(node => String(node.props.children).includes('Mất kết nối')),
  ).toBe(true);
  await act(async () => button('Thử lại').props.onPress());
  await pause();
  expect(button('Tra ký tự 一')).toBeDefined();
});
test('closing cancels the debounce even before the parent unmounts', async () => {
  await draw();
  await act(async () => button('Đóng viết tay').props.onPress());
  await pause();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(handwritingService.recognize).not.toHaveBeenCalled();
});
test('unmounting ignores an in-flight response', async () => {
  let resolve!: (value: HandwritingResult) => void;
  jest.mocked(handwritingService.recognize).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await draw();
  await pause();
  await act(async () => tree.unmount());
  await act(async () => {
    resolve(result);
  });
  expect(onSelect).not.toHaveBeenCalled();
  expect(handwritingService.recognize).toHaveBeenCalledTimes(1);
});

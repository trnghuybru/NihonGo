import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { LearningSetupScreen } from '../src/screens/LearningSetupScreen';
import { AuthButton } from '../src/components/AuthForm';
import { LearningChoice } from '../src/components/LearningChoice';
import { ApiError } from '../src/services/apiClient';
import { options, profile } from '../test-support/learning';

let tree: Renderer.ReactTestRenderer;
const onSave = jest.fn();
const onCancel = jest.fn();
const onReload = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  onSave.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});

async function render(edit = false) {
  await act(async () => {
    tree = Renderer.create(
      <LearningSetupScreen
        profile={edit ? profile : null}
        options={options}
        onSave={onSave}
        onCancel={onCancel}
        onReload={onReload}
      />,
    );
  });
}
function button(label: string) {
  return tree.root
    .findAllByType(AuthButton)
    .find(node => node.props.label === label)!;
}
async function press(label: string) {
  await act(async () => {
    await button(label).props.onPress();
  });
}
async function choose(label: string) {
  await act(async () => {
    tree.root
      .findAllByType(LearningChoice)
      .find(node => node.props.label === label)!
      .props.onPress();
  });
}

test('requires explicit choices and confirmation, and preserves choices going back', async () => {
  await render();
  expect(button('Tiếp tục').props.disabled).toBe(true);
  await choose('N5 · Sơ cấp');
  await press('Tiếp tục');
  expect(button('Tiếp tục').props.disabled).toBe(true);
  await choose('Ôn thi JLPT');
  expect(button('Tiếp tục').props.disabled).toBe(true);
  await choose('30 phút');
  await press('Quay lại');
  expect(
    tree.root
      .findAllByType(LearningChoice)
      .find(node => node.props.label === 'N5 · Sơ cấp')?.props.selected,
  ).toBe(true);
  await press('Tiếp tục');
  await press('Tiếp tục');
  expect(onSave).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('30 phút');
  await press('Xác nhận và bắt đầu');
  expect(onSave).toHaveBeenCalledWith({
    level: 'N5',
    goal: 'jlpt',
    daily_minutes: 30,
  });
});

test('pre-fills edits and cancellation never saves them', async () => {
  await render(true);
  await choose('N4 · Cơ bản');
  await press('Hủy chỉnh sửa');
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
});

test('keeps the draft after a save failure and lets the user retry', async () => {
  onSave.mockRejectedValueOnce(new Error('Mất kết nối'));
  await render(true);
  await press('Tiếp tục');
  await press('Tiếp tục');
  await press('Xác nhận thay đổi');
  expect(JSON.stringify(tree.toJSON())).toContain('Mất kết nối');
  expect(JSON.stringify(tree.toJSON())).toContain('15 phút');
  await press('Xác nhận thay đổi');
  expect(onSave).toHaveBeenCalledTimes(2);
});

test('asks to reload on version conflict instead of silently overwriting', async () => {
  onSave.mockRejectedValueOnce(
    new ApiError('Thiết lập đã thay đổi', 409, 'preferences_conflict'),
  );
  await render(true);
  await press('Tiếp tục');
  await press('Tiếp tục');
  await press('Xác nhận thay đổi');
  expect(button('Xác nhận thay đổi')).toBeUndefined();
  await press('Tải lại thiết lập mới nhất');
  expect(onReload).toHaveBeenCalledTimes(1);
});

test('ignores repeated confirmation while the save is pending', async () => {
  let resolve!: () => void;
  onSave.mockImplementationOnce(
    () =>
      new Promise<void>(done => {
        resolve = done;
      }),
  );
  await render(true);
  await press('Tiếp tục');
  await press('Tiếp tục');
  await act(async () => {
    button('Xác nhận thay đổi').props.onPress();
    button('Xác nhận thay đổi').props.onPress();
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(button('Xác nhận thay đổi').props.busy).toBe(true);
  await act(async () => resolve());
});

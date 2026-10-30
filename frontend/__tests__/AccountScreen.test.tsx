import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { AccountScreen } from '../src/screens/AccountScreen';
import { authService } from '../src/services/authService';
import { options, profile } from '../test-support/learning';

jest.mock('../src/services/authService', () => ({
  authService: {
    logout: jest.fn(),
    requestContact: jest.fn(),
    verifyContact: jest.fn(),
    resend: jest.fn(),
  },
}));
const user = {
  id: 'u',
  name: 'Minh',
  email: 'minh@example.com',
  phone: '+84912345678',
  email_verified: true,
  phone_verified: false,
};
let tree: Renderer.ReactTestRenderer;
const edit = jest.fn();
function button(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
function texts() {
  return tree.root
    .findAllByType(Text)
    .map(node => React.Children.toArray(node.props.children).join(''))
    .join('\n');
}
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(authService.logout).mockResolvedValue(undefined);
  await act(async () => {
    tree = Renderer.create(
      <AccountScreen
        user={user}
        learningProfile={profile}
        learningOptions={options}
        onEditLearning={edit}
      />,
    );
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});
test('keeps learning settings and verification actions available', async () => {
  await act(async () =>
    button('Chỉnh sửa trình độ và mục tiêu').props.onPress(),
  );
  expect(edit).toHaveBeenCalledTimes(1);
  expect(button('Xác thực email')).toBeUndefined();
  expect(button('Xác thực số điện thoại')).toBeDefined();
  jest
    .mocked(authService.requestContact)
    .mockResolvedValue({
      challenge_id: 'c',
      channel: 'sms',
      destination: '+84912345678',
      expires_in: 600,
      resend_after: 60,
    });
  await act(async () => {
    await button('Xác thực số điện thoại').props.onPress();
  });
  expect(authService.requestContact).toHaveBeenCalledWith('sms');
  expect(texts()).toContain('Nhập mã gửi đến');
  await act(async () => button('Hủy xác thực').props.onPress());
  expect(button('Xác thực số điện thoại')).toBeDefined();
});
test('blocks duplicate logout and displays failures inside the session section', async () => {
  let reject!: (error: Error) => void;
  jest.mocked(authService.logout).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = button('Đăng xuất').props.onPress();
    button('Đăng xuất').props.onPress();
  });
  expect(authService.logout).toHaveBeenCalledTimes(1);
  expect(button('Đăng xuất').props.accessibilityState.busy).toBe(true);
  expect(button('Xác thực số điện thoại').props.disabled).toBe(true);
  await act(async () => {
    reject(new Error('Không kết nối được máy chủ.'));
    await pending;
  });
  const settings = tree.root.findAll(
    node => node.props.testID === 'account-settings',
  )[0];
  expect(
    settings
      .findAllByType(Text)
      .some(node => node.props.children === 'Không kết nối được máy chủ.'),
  ).toBe(true);
  expect(button('Đăng xuất').props.disabled).toBe(false);
  await act(async () => {
    await button('Đăng xuất').props.onPress();
  });
  expect(authService.logout).toHaveBeenCalledTimes(2);
});

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { LoginScreen } from '../src/screens/LoginScreen';
import { AuthButton, AuthField } from '../src/components/AuthForm';
import { authService } from '../src/services/authService';

jest.mock('../src/services/authService', () => ({
  authService: {
    config: jest.fn().mockResolvedValue({
      channels: ['email'],
      providers: [],
      password_min_length: 15,
    }),
    resumeSocial: jest.fn().mockResolvedValue(null),
    register: jest.fn(),
    verify: jest.fn(),
    login: jest.fn(),
  },
}));
let tree: ReactTestRenderer.ReactTestRenderer;
async function click(label: string) {
  await ReactTestRenderer.act(async () => {
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
}
async function fill(label: string, value: string) {
  await ReactTestRenderer.act(async () => {
    tree.root
      .findAllByType(AuthField)
      .find(node => node.props.label === label)!
      .props.onChangeText(value);
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<LoginScreen />);
  });
});
afterEach(async () => {
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('registers all required fields and waits for OTP before signing in', async () => {
  jest.mocked(authService.register).mockResolvedValue({
    challenge_id: 'challenge',
    channel: 'email',
    destination: 'm***@example.com',
    expires_in: 600,
    resend_after: 60,
  });
  await click('Đăng ký ngay');
  await fill('Họ và tên', 'Nguyễn Minh');
  await fill('Email', 'minh@example.com');
  await fill('Số điện thoại', '0912345678');
  await fill('Mật khẩu', 'A long secret phrase!');
  await fill('Xác nhận mật khẩu', 'A long secret phrase!');
  await click('Tiếp tục');
  expect(authService.register).toHaveBeenCalledWith({
    name: 'Nguyễn Minh',
    email: 'minh@example.com',
    phone: '0912345678',
    password: 'A long secret phrase!',
  });
  expect(authService.verify).not.toHaveBeenCalled();
  await fill('Mã xác thực', '123456');
  await click('Xác thực và đăng nhập');
  expect(authService.verify).toHaveBeenCalledWith('challenge', '123456');
});

test('shows API login failure and hides providers that are not configured', async () => {
  jest
    .mocked(authService.login)
    .mockRejectedValue(new Error('Thông tin đăng nhập không đúng'));
  await fill('Email hoặc số điện thoại', 'minh@example.com');
  await fill('Mật khẩu', 'wrong password');
  await click('Đăng nhập');
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Thông tin đăng nhập không đúng',
  );
  expect(
    tree.root
      .findAllByType(AuthButton)
      .some(node => node.props.label === 'Google'),
  ).toBe(false);
});

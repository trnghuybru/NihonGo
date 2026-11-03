import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { InstallAppHint } from '../src/components/InstallAppHint.web';

let tree: Renderer.ReactTestRenderer;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator',
);
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
);
const listeners = new Map<string, () => void>();
const media = {
  matches: false,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};
const storage = { getItem: jest.fn(), setItem: jest.fn() };
function device(values = {}) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: false,
      ...values,
    },
  });
}
async function render() {
  await act(async () => {
    tree = Renderer.create(<InstallAppHint />);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  media.matches = false;
  storage.getItem.mockReturnValue(null);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: jest.fn(() => media),
      addEventListener: jest.fn((name, callback) =>
        listeners.set(name, callback),
      ),
      removeEventListener: jest.fn(),
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  device();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
afterAll(() => {
  for (const [key, descriptor] of [
    ['window', originalWindow],
    ['navigator', originalNavigator],
    ['localStorage', originalStorage],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
test('iPhone guidance can be dismissed and stays hidden after remount', async () => {
  await render();
  expect(JSON.stringify(tree.toJSON())).toContain('Thêm vào màn hình chính');
  const button = tree.root.findAll(
    node =>
      node.props.accessibilityLabel ===
        'Ẩn hướng dẫn thêm vào màn hình chính' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => button.props.onPress());
  expect(tree.toJSON()).toBeNull();
  expect(storage.setItem).toHaveBeenCalledWith(
    'nihongo:pwa:install-hint:v1',
    'dismissed',
  );
  await act(async () => tree.unmount());
  storage.getItem.mockReturnValue('dismissed');
  await render();
  expect(tree.toJSON()).toBeNull();
});
test.each(['legacy', 'manifest'])(
  'installed web app hides guidance via %s detection',
  async mode => {
    if (mode === 'legacy') device({ standalone: true });
    else media.matches = true;
    await render();
    expect(tree.toJSON()).toBeNull();
  },
);
test('iPad desktop user agent is recognized and desktop Mac stays hidden', async () => {
  device({
    userAgent: 'Macintosh Safari',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  });
  await render();
  expect(tree.toJSON()).not.toBeNull();
  await act(async () => tree.unmount());
  device({
    userAgent: 'Macintosh Safari',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  });
  await render();
  expect(tree.toJSON()).toBeNull();
});
test('installation event hides the hint and listeners are cleaned up', async () => {
  await render();
  await act(async () => listeners.get('appinstalled')?.());
  expect(tree.toJSON()).toBeNull();
  await act(async () => tree.unmount());
  expect(media.removeEventListener).toHaveBeenCalledWith(
    'change',
    expect.any(Function),
  );
  expect(window.removeEventListener).toHaveBeenCalledWith(
    'appinstalled',
    expect.any(Function),
  );
});
test('unavailable browser storage does not block the page or dismiss action', async () => {
  storage.getItem.mockImplementationOnce(() => {
    throw new Error('blocked');
  });
  storage.setItem.mockImplementationOnce(() => {
    throw new Error('blocked');
  });
  await render();
  const button = tree.root.findAll(
    node =>
      node.props.accessibilityLabel ===
        'Ẩn hướng dẫn thêm vào màn hình chính' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => button.props.onPress());
  expect(tree.toJSON()).toBeNull();
});

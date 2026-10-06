/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { authService } from '../src/services/authService';
import { LoginScreen } from '../src/screens/LoginScreen';
import { AccountScreen } from '../src/screens/AccountScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { learningService } from '../src/services/learningService';
import { options, profile } from '../test-support/learning';
import { StartupSplash } from '../src/components/StartupSplash';

jest.mock('../src/services/learningService', () => ({
  learningService: { load: jest.fn(), save: jest.fn() },
}));
jest.mock('../src/screens/VoiceChatScreen', () => ({
  VoiceChatScreen: () => null,
}));
beforeEach(() => {
  jest.mocked(learningService.load).mockResolvedValue({ profile, options });
});

jest.mock('../src/services/authService', () => ({
  authService: {
    subscribe: jest.fn(() => jest.fn()),
    restore: jest.fn(),
    config: jest.fn().mockResolvedValue({
      channels: ['email'],
      providers: [],
      password_min_length: 15,
    }),
    resumeSocial: jest.fn().mockResolvedValue(null),
  },
}));

let tree: ReactTestRenderer.ReactTestRenderer;
afterEach(async () => {
  await ReactTestRenderer.act(async () => tree?.unmount());
});

async function renderPastStartup() {
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  const splash = tree.root.findByType(StartupSplash);
  expect(splash.props.ready).toBe(true);
  await ReactTestRenderer.act(async () => splash.props.onFinished());
}

test('opens login for an unauthenticated user', async () => {
  jest.mocked(authService.restore).mockResolvedValue(null);
  await renderPastStartup();
  expect(tree.root.findAllByType(LoginScreen)).toHaveLength(1);
  expect(tree.root.findAllByType(AccountScreen)).toHaveLength(0);
});

test('restores the authenticated home only after session validation', async () => {
  jest.mocked(authService.restore).mockResolvedValue({
    id: 'user',
    name: 'Minh',
    email: 'minh@example.com',
    phone: '+84912345678',
    email_verified: true,
    phone_verified: false,
  });
  await renderPastStartup();
  expect(tree.root.findAllByType(HomeScreen)).toHaveLength(1);
});

test('does not enter the app or discard session on network failure', async () => {
  jest
    .mocked(authService.restore)
    .mockRejectedValue(new Error('Network unavailable'));
  await renderPastStartup();
  expect(tree.root.findAllByType(AccountScreen)).toHaveLength(0);
  expect(tree.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Network unavailable');
});

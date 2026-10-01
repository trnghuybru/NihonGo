import * as Keychain from 'react-native-keychain';

const user = {
  id: 'u1',
  name: 'Minh',
  email: 'minh@example.com',
  phone: '+84912345678',
  email_verified: true,
  phone_verified: false,
};
const tokens = {
  user,
  access_token: 'access1',
  refresh_token: 'refresh1',
  expires_in: 900,
};
const rotated = {
  ...tokens,
  access_token: 'access2',
  refresh_token: 'refresh2',
};
let service: typeof import('../src/services/authService').authService;
let keychain: typeof Keychain;
let storage: Map<string, string>;
const reply = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
  } as Response);

beforeEach(() => {
  jest.resetModules();
  keychain = require('react-native-keychain');
  storage = new Map();
  jest.mocked(keychain.getGenericPassword).mockImplementation(async options => {
    const password = storage.get(options?.service || '');
    return password
      ? ({
          username: 'auth',
          password,
          service: options?.service || '',
          storage: 'KeystoreAESGCM_NoAuth' as Keychain.STORAGE_TYPE,
        } as Keychain.UserCredentials)
      : false;
  });
  jest
    .mocked(keychain.setGenericPassword)
    .mockImplementation(async (_name, password, options) => {
      storage.set(options?.service || '', password);
      return {
        service: options?.service || '',
        storage: 'KeystoreAESGCM_NoAuth' as Keychain.STORAGE_TYPE,
      } as Keychain.Result;
    });
  jest
    .mocked(keychain.resetGenericPassword)
    .mockImplementation(async options => {
      storage.delete(options?.service || '');
      return true;
    });
  globalThis.fetch = jest.fn();
  service = require('../src/services/authService').authService;
});

test('stores tokens in Keychain and revokes the server session on logout', async () => {
  jest
    .mocked(fetch)
    .mockImplementationOnce(() => reply(tokens))
    .mockImplementationOnce(() => reply(null, 204));
  await service.login(user.email, 'a long password here');
  expect([...storage.values()][0]).toContain('refresh1');
  expect(
    jest.mocked(keychain.setGenericPassword).mock.calls.at(-1)?.[2]?.accessible,
  ).toBe('WhenUnlockedThisDeviceOnly');
  await service.logout();
  expect(storage.size).toBe(0);
  expect(jest.mocked(fetch).mock.calls[1][1]?.body).toContain('refresh1');
});

test('restores an expired session using refresh rotation', async () => {
  storage.set('com.nihongoflow.auth.session', JSON.stringify(tokens));
  jest
    .mocked(fetch)
    .mockImplementationOnce(() => reply({ code: 'unauthorized' }, 401))
    .mockImplementationOnce(() => reply(rotated))
    .mockImplementationOnce(() => reply({ user }));
  expect(await service.restore()).toEqual(user);
  expect([...storage.values()][0]).toContain('refresh2');
});

test('preserves stored credentials when the network is unavailable', async () => {
  storage.set('com.nihongoflow.auth.session', JSON.stringify(tokens));
  jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
  await expect(service.restore()).rejects.toThrow('Không kết nối');
  expect(storage.size).toBe(1);
});

test('clears a revoked refresh token', async () => {
  storage.set('com.nihongoflow.auth.session', JSON.stringify(tokens));
  jest
    .mocked(fetch)
    .mockImplementation(() => reply({ code: 'unauthorized' }, 401));
  expect(await service.restore()).toBeNull();
  expect(storage.size).toBe(0);
});

test('coalesces parallel refresh requests to avoid token reuse', async () => {
  jest.mocked(fetch).mockImplementationOnce(() => reply(tokens));
  await service.login(user.email, 'a long password here');
  let refreshCount = 0;
  jest.mocked(fetch).mockImplementation((url, options) => {
    if (String(url).endsWith('/refresh')) {
      refreshCount++;
      return reply(rotated);
    }
    if (
      (options?.headers as Record<string, string>).Authorization ===
      'Bearer access1'
    ) {
      return reply({ code: 'unauthorized' }, 401);
    }
    return reply({
      challenge_id: 'c',
      channel: 'sms',
      destination: '***5678',
      expires_in: 600,
      resend_after: 60,
    });
  });
  const result = await Promise.all([
    service.requestContact('sms'),
    service.requestContact('sms'),
  ]);
  expect(result).toHaveLength(2);
  expect(refreshCount).toBe(1);
});

test('learning saves reuse secure auth and preserve the PUT payload through refresh', async () => {
  jest.mocked(fetch).mockImplementationOnce(() => reply(tokens));
  await service.login(user.email, 'a long password here');
  jest
    .mocked(fetch)
    .mockImplementationOnce(() => reply({ code: 'unauthorized' }, 401))
    .mockImplementationOnce(() => reply(rotated))
    .mockImplementationOnce(() => reply({ profile: { version: 1 } }));
  const learning = require('../src/services/learningService').learningService;
  await expect(
    learning.save({ level: 'N5', goal: 'jlpt', daily_minutes: 15 }, 0),
  ).resolves.toEqual({ version: 1 });
  const calls = jest
    .mocked(fetch)
    .mock.calls.filter(([url]) =>
      String(url).endsWith('/learning/preferences'),
    );
  expect(calls).toHaveLength(2);
  expect(calls[0][1]?.method).toBe('PUT');
  expect(calls[1][1]?.method).toBe('PUT');
  expect(calls[1][1]?.body).toBe(calls[0][1]?.body);
  expect(JSON.parse(String(calls[1][1]?.body))).toEqual({
    level: 'N5',
    goal: 'jlpt',
    daily_minutes: 15,
    version: 0,
    level_confirmed: true,
  });
  expect((calls[1][1]?.headers as Record<string, string>).Authorization).toBe(
    'Bearer access2',
  );
});

test('a late unauthorized response reuses the token already refreshed by another request', async () => {
  jest.mocked(fetch).mockImplementationOnce(() => reply(tokens));
  await service.login(user.email, 'a long password here');
  const { authenticatedRequest } = require('../src/services/authService');
  let lateResponse!: (response: Response) => void;
  jest
    .mocked(fetch)
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          lateResponse = resolve;
        }),
    )
    .mockImplementationOnce(() => reply({ code: 'unauthorized' }, 401))
    .mockImplementationOnce(() => reply(rotated))
    .mockImplementationOnce(() => reply({ ok: true }))
    .mockImplementationOnce(() => reply({ ok: true }));
  const late = authenticatedRequest('/learning/preferences');
  await authenticatedRequest('/learning/preferences');
  lateResponse(await reply({ code: 'unauthorized' }, 401));
  await late;
  expect(
    jest
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith('/refresh')),
  ).toHaveLength(1);
});

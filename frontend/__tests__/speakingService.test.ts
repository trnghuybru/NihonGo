import type { speakingService as SpeakingService } from '../src/services/speakingService';
import type { authService as AuthService } from '../src/services/authService';

const user = {
  id: 'user-1',
  name: 'Minh',
  email: 'minh@example.com',
  phone: '+84912345678',
  email_verified: true,
  phone_verified: false,
};
const tokens = {
  user,
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
};
let speaking: typeof SpeakingService;
let auth: typeof AuthService;
function reply(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
  } as Response);
}
beforeEach(async () => {
  jest.resetModules();
  globalThis.fetch = jest.fn().mockImplementationOnce(() => reply(tokens));
  auth = require('../src/services/authService').authService;
  speaking = require('../src/services/speakingService').speakingService;
  await auth.login(user.email, 'a sufficiently long password');
  jest.mocked(fetch).mockClear();
});

test('requests protected scenario endpoints with the API contract and encoded filters', async () => {
  jest
    .mocked(fetch)
    .mockImplementationOnce(() =>
      reply({
        items: [{ id: 'category-1', name: 'Đời sống', description: null }],
      }),
    )
    .mockImplementationOnce(() =>
      reply({
        items: [],
        pagination: { page: 2, page_size: 20, total: 0, total_pages: 0 },
      }),
    )
    .mockImplementationOnce(() =>
      reply({ scenario: { id: 'scenario-1', roles: [] } }),
    )
    .mockImplementationOnce(() => reply({ session: { id: 'session-1' } }, 201));
  expect(await speaking.categories()).toEqual([
    { id: 'category-1', name: 'Đời sống', description: null },
  ]);
  await speaking.list(
    { category_id: 'category-1', level: 'N5', q: 'cà phê & trà' },
    2,
  );
  expect(jest.mocked(fetch).mock.calls[1][0]).toContain(
    'q=c%C3%A0%20ph%C3%AA%20%26%20tr%C3%A0',
  );
  expect(jest.mocked(fetch).mock.calls[1][0]).toContain('page=2&page_size=20');
  expect(await speaking.detail('scenario-1')).toEqual({
    id: 'scenario-1',
    roles: [],
  });
  const input = {
    role_id: 'role-1',
    input_mode: 'text' as const,
    audio_storage_enabled: false,
  };
  await speaking.start('scenario-1', input);
  for (const [, options] of jest.mocked(fetch).mock.calls) {
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer access-1',
    });
  }
  const [url, options] = jest.mocked(fetch).mock.calls[3];
  expect(url).toContain('/api/speaking/scenarios/scenario-1/sessions');
  expect(options?.method).toBe('POST');
  expect(JSON.parse(options?.body as string)).toEqual(input);
});

test('uses the shared refresh rotation when scenario loading gets a 401', async () => {
  jest
    .mocked(fetch)
    .mockImplementationOnce(() =>
      reply({ error: 'Expired', code: 'unauthorized' }, 401),
    )
    .mockImplementationOnce(() =>
      reply({
        ...tokens,
        access_token: 'access-2',
        refresh_token: 'refresh-2',
      }),
    )
    .mockImplementationOnce(() => reply({ items: [] }));
  expect(await speaking.categories()).toEqual([]);
  expect(jest.mocked(fetch).mock.calls[1][0]).toContain('/api/auth/refresh');
  expect(jest.mocked(fetch).mock.calls[2][1]?.headers).toMatchObject({
    Authorization: 'Bearer access-2',
  });
});

test('does not automatically repeat session creation after a network failure', async () => {
  jest
    .mocked(fetch)
    .mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(
    speaking.start('scenario-1', {
      role_id: 'role-1',
      input_mode: 'voice',
      audio_storage_enabled: false,
    }),
  ).rejects.toThrow('Không kết nối');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('loads persisted transcript and sends text or voice turns with authentication', async () => {
  jest.mocked(fetch).mockImplementation(() => reply({ items: [] }));
  await speaking.messages('session-1', 12);
  expect(jest.mocked(fetch).mock.calls[0][0]).toContain(
    '/sessions/session-1/messages?after_sequence=12&limit=100',
  );
  for (const input_mode of ['text', 'voice'] as const) {
    const input = {
      request_id: '33a1b34a-5396-4442-8c83-3a4f171ee3f4',
      content: 'こんにちは',
      input_mode,
    };
    await speaking.send('session-1', input);
    const [url, options] = jest.mocked(fetch).mock.calls.at(-1)!;
    expect(url).toContain('/sessions/session-1/messages');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer access-1',
    });
    expect(JSON.parse(options?.body as string)).toEqual(input);
  }
});

test('requests authenticated history and saved session endpoints', async () => {
  jest
    .mocked(fetch)
    .mockImplementationOnce(() =>
      reply({
        items: [],
        pagination: { page: 2, page_size: 20, total: 0, total_pages: 0 },
      }),
    )
    .mockImplementationOnce(() => reply({ session: { id: 'saved-session' } }));
  await speaking.history(2);
  await speaking.session('saved-session');
  expect(jest.mocked(fetch).mock.calls[0][0]).toContain(
    '/api/speaking/sessions?page=2&page_size=20',
  );
  expect(jest.mocked(fetch).mock.calls[1][0]).toContain(
    '/api/speaking/sessions/saved-session',
  );
  for (const [, options] of jest.mocked(fetch).mock.calls) {
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer access-1',
    });
    expect(options?.method).toBe('GET');
  }
});

test('requests an authenticated ephemeral token and saves a Live transcript', async () => {
  jest.mocked(fetch).mockImplementation(() => reply({}));
  await speaking.liveToken('saved-session');
  const turn = {
    lease: 'signed',
    request_id: 'uuid',
    after_sequence: 1,
    input_mode: 'voice' as const,
    user_text: 'こんにちは',
    assistant_text: 'こんにちは！',
  };
  await speaking.saveLiveTurn('saved-session', turn);
  expect(jest.mocked(fetch).mock.calls[0][0]).toContain(
    '/sessions/saved-session/live-token',
  );
  const [url, options] = jest.mocked(fetch).mock.calls[1];
  expect(url).toContain('/sessions/saved-session/live-turns');
  expect(options?.headers).toMatchObject({ Authorization: 'Bearer access-1' });
  expect(JSON.parse(options?.body as string)).toEqual(turn);
});

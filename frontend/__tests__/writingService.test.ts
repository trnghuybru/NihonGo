import { authService } from '../src/services/authService';
import { writingService } from '../src/services/writingService';

const result = {
  submission: {
    id: 's1',
    score: 80,
    feedback: 'Nhận xét',
    corrected_text: '日本語です。',
  },
};
const response = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => data,
  } as Response);
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  jest.useFakeTimers();
  globalThis.fetch = jest.fn().mockResolvedValue(
    response({
      user: { id: 'writer', name: 'Writer', email: 'writer@example.test' },
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      expires_in: 3600,
    }),
  );
  await authService.login('writer@example.test', 'test-password');
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
});

test.each(['submit', 'reevaluate'] as const)(
  '%s receives grading that takes longer than the default request timeout',
  async action => {
    jest
      .mocked(fetch)
      .mockClear()
      .mockImplementation(
        (_url, options) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve(response(result)), 35000);
            options?.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('aborted'));
            });
          }),
      );
    const request =
      action === 'submit'
        ? writingService.submitWriting({ text: '日本語を勉強します。' })
        : writingService.evaluateSubmission('s1');
    const completed = request.then(
      value => ({ value }),
      error => ({ error }),
    );
    await jest.advanceTimersByTimeAsync(35000);
    expect(await completed).toEqual({ value: result });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

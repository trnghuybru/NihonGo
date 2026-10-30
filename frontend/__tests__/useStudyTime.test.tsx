import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { useStudyTime } from '../src/hooks/useStudyTime';
import {
  studyTimeService,
  StudyProgress,
} from '../src/services/studyTimeService';
import {
  mergeStudyIntervals,
  studyDate,
  StudyInterval,
  studySeconds,
} from '../src/utils/studyTime';

jest.mock('../src/services/studyTimeService', () => ({
  studyTimeService: { load: jest.fn(), record: jest.fn() },
}));
let tree: Renderer.ReactTestRenderer;
let tracker: ReturnType<typeof useStudyTime>;
let server: StudyInterval[];
function status(): StudyProgress {
  const day = studyDate(Date.now());
  const start = Date.parse(`${day}T00:00:00+07:00`);
  const intervals = mergeStudyIntervals(server)
    .map(
      ([a, b]): StudyInterval => [
        Math.max(a, start),
        Math.min(b, start + 86400000),
      ],
    )
    .filter(([a, b]) => b > a);
  return {
    date: day,
    timezone: 'Asia/Ho_Chi_Minh',
    seconds: studySeconds(intervals, day),
    goal_seconds: 900,
    completed: false,
    server_time_ms: Date.now(),
    intervals,
  };
}
function Probe({ account = 'alice' }: { account?: string }) {
  tracker = useStudyTime(account, 15);
  return null;
}
async function render(account = 'alice') {
  await act(async () => {
    tree = Renderer.create(<Probe account={account} />);
  });
}
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
async function studying(value: boolean) {
  await act(async () => tracker.setStudying(value));
}
async function appState(state: 'active' | 'background') {
  const calls = jest.mocked(AppState.addEventListener).mock.calls;
  await act(async () => calls[calls.length - 1][1](state));
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse('2026-10-18T10:00:00+07:00'));
  server = [];
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue(false);
  jest.mocked(studyTimeService.load).mockImplementation(async () => status());
  jest
    .mocked(studyTimeService.record)
    .mockImplementation(async (_account, intervals) => {
      server = mergeStudyIntervals([...server, ...intervals]);
      return status();
    });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.clearAllMocks();
  jest.useRealTimers();
});

test('counts only study screens and foreground time, saving when leaving', async () => {
  await render();
  await advance(10000);
  expect(tracker.seconds).toBe(0);
  await studying(true);
  await advance(7000);
  expect(tracker.seconds).toBe(7);
  await appState('background');
  await advance(60000);
  expect(tracker.seconds).toBe(7);
  await appState('active');
  await advance(4000);
  expect(tracker.seconds).toBe(11);
  await studying(false);
  expect(status().seconds).toBe(11);
  await advance(10000);
  expect(tracker.seconds).toBe(11);
});

test('a failed response can retry accepted intervals without double-counting', async () => {
  await render();
  await studying(true);
  jest
    .mocked(studyTimeService.record)
    .mockImplementationOnce(async (_account, intervals) => {
      server.push(...intervals);
      throw Error('lost response');
    });
  await advance(15000);
  expect(tracker.seconds).toBe(15);
  expect(tracker.error).toBe('Chưa đồng bộ');
  await act(async () => tracker.retry());
  expect(tracker.seconds).toBe(15);
  expect(status().seconds).toBe(15);
  expect(tracker.error).toBe('');
});

test('resets the displayed day at Vietnamese midnight without losing the previous day', async () => {
  jest.setSystemTime(Date.parse('2026-10-18T23:59:57+07:00'));
  await render();
  await studying(true);
  await advance(6000);
  expect(tracker.seconds).toBe(3);
  await studying(false);
  expect(studySeconds(server, '2026-10-18')).toBe(3);
  expect(studySeconds(server, '2026-10-19')).toBe(3);
});

test('restores progress and pending time after reopening, scoped to the account', async () => {
  const now = Date.now();
  const progress = status();
  jest
    .mocked(Keychain.getGenericPassword)
    .mockResolvedValue({
      service: 'test',
      storage: 'KeystoreAESGCM' as Keychain.STORAGE_TYPE,
      username: 'study',
      password: JSON.stringify({
        progress,
        offset: 0,
        pending: [[now - 10000, now]],
      }),
    });
  await render();
  expect(tracker.seconds).toBe(10);
  expect(studyTimeService.record).toHaveBeenCalledWith('alice', [
    [now - 10000, now],
  ]);
  expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
    service: 'com.nihongoflow.study.alice',
  });
});

test('device clock changes do not become elapsed study time', async () => {
  await render();
  await studying(true);
  await advance(2000);
  jest.setSystemTime(Date.now() + 3600000);
  await advance(1000);
  expect(tracker.seconds).toBe(3);
});

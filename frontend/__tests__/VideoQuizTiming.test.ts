/// <reference types="node" />
import { runInNewContext } from 'vm';
import { videoPlayerHtml } from '../src/components/VideoExamplePlayer';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

function playerClock() {
  const example = {
    id: 'clip-1',
    text: '日本語です。',
    search_text: '日本語です。',
    start_seconds: 0,
    end_seconds: 30,
    video: { youtube_id: 'cjtmDEG-B7U', title: 'Test', channel: 'Test' },
    watch_url: '',
  };
  const script = videoPlayerHtml(example, 1, false, [example], true).match(
    /<script>([\s\S]*?)<\/script>/,
  )![1];
  const messages: { type: string; code?: { id: string } }[] = [];
  let time = 0;
  let tick = () => {};
  const player = {
    getCurrentTime: () => time,
    getPlayerState: () => 2,
    pauseVideo: jest.fn(),
    seekTo: jest.fn(),
  };
  const bridge = {
    player,
    ReactNativeWebView: {
      postMessage: (data: string) => messages.push(JSON.parse(data)),
    },
    addEventListener: jest.fn(),
  };
  const api = runInNewContext(
    script +
      `;({
    configure: window.configureQuiz, jump: window.jumpToQuiz,
    state: onPlaybackState, check: checkQuiz
  })`,
    {
      window: bridge,
      YT: { PlayerState: { PLAYING: 1 } },
      setInterval: (callback: () => void) => {
        tick = callback;
        return 1;
      },
      clearInterval: () => {},
    },
  );
  const questions = () =>
    messages
      .filter(message => message.type === 'quiz-question')
      .map(message => message.code?.id);
  api.state({ target: player, data: 2 });
  return {
    api,
    player,
    questions,
    seek: (seconds: number) => {
      time = seconds;
      tick();
    },
  };
}

test('seeking a paused video to a checkpoint opens its question exactly once', () => {
  const clock = playerClock();
  clock.api.configure([{ id: 'q1', seconds: 10 }], false);
  clock.seek(9);
  expect(clock.questions()).toEqual([]);
  clock.seek(10);
  clock.seek(10.1);
  expect(clock.questions()).toEqual(['q1']);
  expect(clock.player.pauseVideo).toHaveBeenCalled();
});

test.each([9.8, 10.2])(
  'explicit question jump tolerates YouTube settling at %s seconds',
  settled => {
    const clock = playerClock();
    clock.seek(25);
    clock.api.configure([{ id: 'q1', seconds: 10 }], false);
    clock.api.jump('q1');
    clock.seek(25); // The old position must not reveal the question before seeking finishes.
    expect(clock.questions()).toEqual([]);
    expect(clock.player.seekTo).toHaveBeenCalledWith(10, true);
    clock.seek(settled);
    clock.seek(settled);
    expect(clock.questions()).toEqual(['q1']);
  },
);

test('setup hold suppresses questions, then remaining checkpoints work after an answer', () => {
  const clock = playerClock();
  const checkpoints = [
    { id: 'q1', seconds: 10 },
    { id: 'q2', seconds: 20 },
  ];
  clock.api.configure(checkpoints, true);
  clock.seek(10);
  expect(clock.questions()).toEqual([]);
  clock.api.configure(checkpoints, false);
  clock.seek(10);
  expect(clock.questions()).toEqual(['q1']);
  clock.api.configure([checkpoints[1]], false);
  clock.seek(5);
  clock.seek(10);
  expect(clock.questions()).toEqual(['q1']);
  clock.seek(20);
  expect(clock.questions()).toEqual(['q1', 'q2']);
});

test('normal playback still triggers questions when crossing their timestamp', () => {
  const clock = playerClock();
  clock.api.configure([{ id: 'q1', seconds: 10 }], false);
  clock.seek(9);
  clock.api.state({ target: clock.player, data: 1 });
  clock.seek(10.1);
  expect(clock.questions()).toEqual(['q1']);
});

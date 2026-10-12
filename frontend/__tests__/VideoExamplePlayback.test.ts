import { videoPlayerHtml } from '../src/components/VideoExamplePlayer';
import { VideoExample } from '../src/services/videoExamplesService';

// Jest runs in Node; keep its VM types local rather than adding Node globals to the app.
const { runInNewContext } = require('vm') as {
  runInNewContext: (code: string, sandbox: object) => void;
};

const example: VideoExample = {
  id: 'example',
  text: '日本語の例文。',
  search_text: '日本語の例文。',
  start_seconds: 42.5,
  end_seconds: 46.2,
  video: { youtube_id: 'cjtmDEG-B7U', title: 'Example', channel: 'TEDx Talks' },
  watch_url: 'https://www.youtube.com/watch?v=cjtmDEG-B7U&t=42s',
};

function createPlayer(
  rate = 1,
  loop = false,
  timeline?: VideoExample[],
  continuous = false,
) {
  let currentTime = example.start_seconds;
  let currentState = 1;
  const player = {
    cueVideoById: jest.fn(),
    playVideo: jest.fn(),
    pauseVideo: jest.fn(),
    getPlayerState: jest.fn(() => currentState),
    getCurrentTime: jest.fn(() => currentTime),
    getAvailablePlaybackRates: jest.fn(() => [0.5, 0.75, 1, 1.25]),
    setPlaybackRate: jest.fn(),
    seekTo: jest.fn((value: number) => {
      currentTime = value;
    }),
  };
  let events!: {
    onReady: (event: { target: typeof player }) => void;
    onStateChange: (event: { target: typeof player; data: number }) => void;
    onError: (event: { data: number }) => void;
  };
  const pageEvents: Record<string, () => void> = {};
  const postMessage = jest.fn();
  const sandbox = {
    setInterval,
    clearInterval,
    Date,
    window: {
      updateShadowing: (_next: object) => undefined,
      ReactNativeWebView: { postMessage },
      addEventListener: (name: string, callback: () => void) => {
        pageEvents[name] = callback;
      },
    },
    YT: {
      PlayerState: { PLAYING: 1 },
      Player: function (_id: string, options: { events: typeof events }) {
        events = options.events;
        return player;
      },
    },
    onYouTubeIframeAPIReady: () => undefined,
  };
  const script = videoPlayerHtml(
    example,
    rate,
    loop,
    timeline,
    continuous,
  ).match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(script, sandbox);
  sandbox.onYouTubeIframeAPIReady();
  events.onReady({ target: player });
  return {
    player,
    events,
    pageEvents,
    postMessage,
    setTime: (seconds: number) => {
      currentTime = seconds;
    },
    update: (next: object) => sandbox.window.updateShadowing(next),
    state: (data: number) => {
      currentState = data;
      events.onStateChange({ target: player, data });
    },
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('pauses once at the caption end and lets the user resume the rest of the video', () => {
  const clip = createPlayer();
  expect(clip.player.cueVideoById).toHaveBeenCalledWith({
    videoId: 'cjtmDEG-B7U',
    startSeconds: 42.5,
  });
  clip.state(1);
  clip.setTime(46.19);
  jest.advanceTimersByTime(100);
  expect(clip.player.pauseVideo).not.toHaveBeenCalled();
  clip.setTime(46.2);
  jest.advanceTimersByTime(100);
  expect(clip.player.pauseVideo).toHaveBeenCalledTimes(1);
  expect(clip.postMessage).toHaveBeenCalledWith('{"type":"clip-ended"}');
  jest.advanceTimersByTime(10000);
  expect(clip.player.pauseVideo).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  clip.state(2);
  clip.state(1); // User presses Play after the automatic sentence pause.
  clip.setTime(70);
  jest.advanceTimersByTime(10000);
  expect(clip.player.pauseVideo).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('replaying with a fresh player arms the sentence pause again', () => {
  const original = createPlayer();
  original.state(1);
  original.setTime(example.end_seconds);
  jest.advanceTimersByTime(100);
  original.state(1);
  expect(jest.getTimerCount()).toBe(0);
  // The Nghe lại button remounts the WebView with this same HTML.
  const replay = createPlayer();
  replay.state(1);
  expect(replay.player.pauseVideo).not.toHaveBeenCalled();
  replay.setTime(example.end_seconds);
  jest.advanceTimersByTime(100);
  expect(replay.player.pauseVideo).toHaveBeenCalledTimes(1);
});

test('uses playback time so buffering and manual pause do not consume the sentence', () => {
  const clip = createPlayer();
  clip.state(1);
  clip.setTime(44);
  clip.state(3); // Buffering.
  jest.advanceTimersByTime(30000);
  expect(jest.getTimerCount()).toBe(0);
  expect(clip.player.pauseVideo).not.toHaveBeenCalled();
  clip.state(1);
  jest.advanceTimersByTime(5000);
  expect(clip.player.pauseVideo).not.toHaveBeenCalled();
  clip.state(2); // User paused.
  jest.advanceTimersByTime(30000);
  expect(jest.getTimerCount()).toBe(0);
  clip.state(1);
  clip.setTime(46.3);
  jest.advanceTimersByTime(100);
  expect(clip.player.pauseVideo).toHaveBeenCalledTimes(1);
});

test('clears monitoring when the player errors or the page closes', () => {
  const clip = createPlayer();
  clip.state(1);
  clip.state(1);
  expect(jest.getTimerCount()).toBe(1);
  clip.events.onError({ data: 100 });
  expect(jest.getTimerCount()).toBe(0);
  clip.state(1);
  clip.pageEvents.pagehide();
  expect(jest.getTimerCount()).toBe(0);
});

test('shadowing loops the selected phrase and applies playback speed', () => {
  const clip = createPlayer(0.75, true);
  expect(clip.player.setPlaybackRate).toHaveBeenCalledWith(0.75);
  clip.state(1);
  clip.setTime(example.end_seconds);
  jest.advanceTimersByTime(1000);
  expect(clip.player.seekTo).toHaveBeenCalledWith(example.start_seconds, true);
  expect(clip.player.pauseVideo).not.toHaveBeenCalled();
  clip.setTime(example.end_seconds);
  jest.advanceTimersByTime(1000);
  expect(clip.player.seekTo).toHaveBeenCalledTimes(2);
});

const timeline = [
  example,
  { ...example, id: 'next', start_seconds: 48, end_seconds: 51 },
];
function captionIndices(clip: ReturnType<typeof createPlayer>) {
  return clip.postMessage.mock.calls
    .map(([message]) => JSON.parse(message))
    .filter(message => message.type === 'caption')
    .map(message => message.code.index);
}

test('continuous subtitles follow the video clock, gaps and backward seeks without stopping playback', () => {
  const clip = createPlayer(1, false, timeline, true);
  expect(captionIndices(clip)).toEqual([0]);
  clip.setTime(47);
  jest.advanceTimersByTime(100);
  expect(captionIndices(clip)).toEqual([0, -1]);
  clip.setTime(49);
  jest.advanceTimersByTime(100);
  expect(captionIndices(clip)).toEqual([0, -1, 1]);
  jest.advanceTimersByTime(1000);
  expect(captionIndices(clip)).toEqual([0, -1, 1]); // No bridge updates for every tick.
  clip.setTime(43);
  jest.advanceTimersByTime(100);
  expect(captionIndices(clip)).toEqual([0, -1, 1, 0]);
  expect(clip.player.pauseVideo).not.toHaveBeenCalled();
});

test('subtitle time never advances during buffering or pause and a paused seek updates the caption', () => {
  const clip = createPlayer(1, false, timeline, true);
  clip.state(3);
  jest.advanceTimersByTime(30000);
  clip.state(2);
  jest.advanceTimersByTime(30000);
  expect(captionIndices(clip)).toEqual([0]);
  clip.setTime(49);
  jest.advanceTimersByTime(100);
  expect(captionIndices(clip)).toEqual([0, 1]);
  expect(clip.player.playVideo).toHaveBeenCalledTimes(1);
});

test('timeline controls change speed without seeking and replay or selecting a phrase seeks on the same player', () => {
  const clip = createPlayer(1, false, timeline, true);
  const settings = {
    id: example.id,
    start: example.start_seconds,
    end: example.end_seconds,
    rate: 0.75,
    continuous: true,
    loop: false,
  };
  clip.setTime(44);
  clip.update(settings);
  expect(clip.player.setPlaybackRate).toHaveBeenLastCalledWith(0.75);
  expect(clip.player.seekTo).not.toHaveBeenCalled();
  clip.update({ ...settings, replay: true });
  expect(clip.player.seekTo).toHaveBeenLastCalledWith(42.5, true);
  clip.update({
    ...settings,
    id: 'next',
    start: 48,
    end: 51,
    continuous: false,
  });
  expect(clip.player.seekTo).toHaveBeenLastCalledWith(48, true);
  clip.setTime(51);
  jest.advanceTimersByTime(100);
  expect(clip.player.pauseVideo).toHaveBeenCalledTimes(1);
  clip.state(2);
  clip.state(1);
  clip.setTime(53);
  jest.advanceTimersByTime(100);
  expect(clip.player.pauseVideo).toHaveBeenCalledTimes(1);
  expect(captionIndices(clip).at(-1)).toBe(-1);
});

test('looping a timeline phrase does not resume a manual pause', () => {
  const clip = createPlayer(1, true, timeline, false);
  clip.state(2);
  clip.setTime(example.end_seconds);
  jest.advanceTimersByTime(1000);
  expect(clip.player.seekTo).not.toHaveBeenCalled();
  clip.state(1);
  expect(clip.player.seekTo).toHaveBeenCalledWith(example.start_seconds, true);
});

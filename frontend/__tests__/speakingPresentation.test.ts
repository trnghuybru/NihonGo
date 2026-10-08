import {
  initialPresentation,
  speakingPresentationReducer as reduce,
  SpeakingPresentation,
} from '../src/hooks/useSpeakingPresentation';
function active() {
  return reduce(initialPresentation, { type: 'transport', value: 'ready' });
}
function response() {
  let state = reduce(active(), { type: 'transport', value: 'processing' });
  state = reduce(state, {
    type: 'transcript',
    user: 'Hello',
    assistant: 'こんにちは',
  });
  return reduce(state, { type: 'playback', value: true });
}
test('initial connection enables user turn without a fake AI greeting playback', () => {
  expect(active().phase).toBe('user_turn');
});
test.each(['audio_first', 'save_first'])(
  'hand-off waits for audio AND ready (%s)',
  order => {
    let state = response();
    const stop = { type: 'playback', value: false } as const;
    const ready = { type: 'transport', value: 'ready' } as const;
    state = reduce(state, order === 'audio_first' ? stop : ready);
    expect(state.phase).toBe('ai_speaking');
    state = reduce(state, order === 'audio_first' ? ready : stop);
    expect(state.phase).toBe('transition_to_user');
    expect(reduce(state, { type: 'transition_finished' }).phase).toBe(
      'user_turn',
    );
  },
);
test('chunk gaps do not enable user input or reveal unread text', () => {
  const state = response();
  const gap = reduce(state, { type: 'playback', value: false });
  expect(gap.phase).toBe('ai_speaking');
  expect(gap.revealed).toBe(state.revealed);
});
test('saved cleanup retains the displayed answer and a new user turn resets it', () => {
  const state = response();
  expect(
    reduce(state, { type: 'transcript', user: '', assistant: '' }).assistant,
  ).toBe(state.assistant);
  const recording = reduce(state, { type: 'transport', value: 'listening' });
  expect(recording.phase).toBe('user_speaking');
  expect(recording.assistant).toBe('');
});
test('estimated reveal is unicode-safe and bounded by currently streamed text', () => {
  let state: SpeakingPresentation = {
    ...response(),
    assistant: 'あ😀',
    revealed: 0,
  };
  for (let i = 0; i < 10; i++) state = reduce(state, { type: 'tick' });
  expect(state.revealed).toBe(2);
});
test('an error ignores subsequent playback and stale transition timers', () => {
  const error = reduce(response(), {
    type: 'error',
    message: 'Không có quyền micro',
  });
  expect(reduce(error, { type: 'playback', value: true }).phase).toBe('error');
  expect(reduce(error, { type: 'transition_finished' }).phase).toBe('error');
  expect(reduce(error, { type: 'transport', value: 'connecting' }).error).toBe(
    '',
  );
});

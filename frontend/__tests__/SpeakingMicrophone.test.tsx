import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { SpeakingMicrophone } from '../src/components/SpeakingMicrophone';
import {
  initialPresentation,
  SpeakingPresentation,
} from '../src/hooks/useSpeakingPresentation';
let tree: Renderer.ReactTestRenderer;
const presentation: SpeakingPresentation = {
  ...initialPresentation,
  phase: 'user_speaking',
  motion: 'full',
};
const start = jest.fn();
const stop = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Animated, 'loop').mockReturnValue({
    start,
    stop,
    reset: jest.fn(),
  } as unknown as Animated.CompositeAnimation);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
});
async function render(value: SpeakingPresentation) {
  await act(async () => {
    const node = (
      <SpeakingMicrophone
        presentation={value}
        ready={false}
        label="Thả để gửi"
        onPressIn={jest.fn()}
        onPressOut={jest.fn()}
      />
    );
    if (tree) tree.update(node);
    else tree = Renderer.create(node);
  });
}
test('starts shaking only when the captured audio exceeds the noise threshold, then stops for silence', async () => {
  tree = undefined as unknown as Renderer.ReactTestRenderer;
  await render(presentation);
  expect(start).not.toHaveBeenCalled();
  await render({ ...presentation, micLevel: 0.7 });
  expect(start).toHaveBeenCalledTimes(1);
  await render({ ...presentation, micLevel: 0 });
  expect(stop).toHaveBeenCalled();
});
test('reduced motion never starts the vibration animation even for loud speech', async () => {
  tree = undefined as unknown as Renderer.ReactTestRenderer;
  await render({ ...presentation, micLevel: 1, motion: 'reduced' });
  expect(start).not.toHaveBeenCalled();
});

test('retracts during AI response, expands for the learner and stays expanded while recording', async () => {
  tree = undefined as unknown as Renderer.ReactTestRenderer;
  const timing = jest.spyOn(Animated, 'timing');
  const expansionTargets = () =>
    timing.mock.calls
      .filter(([, config]) => config.duration === 280)
      .map(([, config]) => config.toValue);
  await render({ ...presentation, phase: 'ai_speaking' });
  expect(expansionTargets()).toEqual([0]);
  const reveal = tree.root.findAll(
    node => node.props.testID === 'mic-reveal',
  )[0];
  expect(StyleSheet.flatten(reveal.props.style).height.__getValue()).toBe(0);
  expect(reveal.props.pointerEvents).toBe('none');
  await render({ ...presentation, phase: 'transition_to_user' });
  expect(expansionTargets()).toEqual([0, 1]);
  expect(reveal.props.pointerEvents).toBe('auto');
  await render({ ...presentation, phase: 'user_turn' });
  await render(presentation);
  expect(expansionTargets()).toEqual([0, 1]);
  const mic = tree.root.findAll(
    node => node.props.testID === 'speaking-mic',
  )[0];
  expect(mic.props.disabled).toBe(false);
  await render({ ...presentation, phase: 'processing' });
  expect(expansionTargets()).toEqual([0, 1, 0]);
});

import React from 'react';
import { Animated } from 'react-native';
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
  jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({
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

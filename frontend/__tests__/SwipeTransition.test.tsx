import React from 'react';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { SwipeTransition } from '../src/components/SwipeTransition';

afterEach(() => jest.restoreAllMocks());

test.each([false, true])(
  'changes direction for tab navigation and respects reduced motion=%s',
  async reduced => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(reduced);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() });
    const timing = jest
      .spyOn(Animated, 'timing')
      .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    let tree!: Renderer.ReactTestRenderer;
    try {
      await act(async () => {
        tree = Renderer.create(
          <SwipeTransition index={0}>
            <Text>Words</Text>
          </SwipeTransition>,
        );
      });
      expect(timing).not.toHaveBeenCalled();
      await act(async () =>
        tree.update(
          <SwipeTransition index={1}>
            <Text>Kanji</Text>
          </SwipeTransition>,
        ),
      );
      if (reduced) expect(timing).not.toHaveBeenCalled();
      else expect(setValue).toHaveBeenLastCalledWith(20);
      await act(async () =>
        tree.update(
          <SwipeTransition index={0}>
            <Text>Words</Text>
          </SwipeTransition>,
        ),
      );
      if (reduced) expect(timing).not.toHaveBeenCalled();
      else expect(setValue).toHaveBeenLastCalledWith(-20);
      const count = timing.mock.calls.length;
      await act(async () =>
        tree.update(
          <SwipeTransition index={0}>
            <Text>New results</Text>
          </SwipeTransition>,
        ),
      );
      expect(timing).toHaveBeenCalledTimes(count);
    } finally {
      await act(async () => tree?.unmount());
    }
  },
);

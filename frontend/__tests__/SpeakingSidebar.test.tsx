import React from 'react';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { SpeakingSidebar } from '../src/components/SpeakingSidebar';

afterEach(() => jest.restoreAllMocks());

test.each([false, true])(
  'slides between history and chat with reduced motion=%s',
  async reduced => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(reduced);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() });
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    let tree!: Renderer.ReactTestRenderer;
    const panel = (active: boolean) => (
      <SpeakingSidebar
        active={active}
        history={<Text>Hội thoại gần đây</Text>}
        chat={<Text>Nội dung hội thoại</Text>}
      />
    );
    try {
      await act(async () => {
        tree = Renderer.create(panel(false));
      });
      await act(async () => {
        tree.update(panel(true));
      });
      expect(timing).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          toValue: 1,
          duration: reduced ? 0 : 280,
          useNativeDriver: true,
        }),
      );
      expect(
        tree.root.findByProps({ testID: 'speaking-history-panel' }).props
          .accessibilityElementsHidden,
      ).toBe(true);
      expect(
        tree.root.findByProps({ testID: 'speaking-chat-panel' }).props
          .pointerEvents,
      ).toBe('auto');
      await act(async () => {
        tree.update(panel(false));
      });
      expect(timing).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          toValue: 0,
          duration: reduced ? 0 : 280,
        }),
      );
      expect(
        tree.root.findByProps({ testID: 'speaking-history-panel' }).props
          .pointerEvents,
      ).toBe('auto');
      expect(
        tree.root.findByProps({ testID: 'speaking-chat-panel' }).props
          .accessibilityElementsHidden,
      ).toBe(true);
    } finally {
      await act(async () => tree?.unmount());
    }
  },
);

import React, { useState } from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
import FlipCard from 'react-native-flip-card';
import { FlashcardFlip } from '../src/components/FlashcardFlip';

jest.mock('react-native-flip-card', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { children: React.ReactNode[]; flip: boolean }) =>
      ReactModule.createElement(View, null, props.children[props.flip ? 1 : 0]),
  };
});
let tree: Renderer.ReactTestRenderer;
const onFlip = jest.fn();
const onAnimating = jest.fn();
function Probe({ disabled = false }: { disabled?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <FlashcardFlip
      flipped={flipped}
      disabled={disabled}
      onFlip={next => {
        onFlip(next);
        setFlipped(next);
      }}
      onAnimatingChange={onAnimating}
    >
      {(face, flip) => (
        <Pressable accessibilityLabel="Đổi mặt" onPress={flip}>
          <Text>{face ? 'Mặt sau' : 'Mặt trước'}</Text>
        </Pressable>
      )}
    </FlashcardFlip>
  );
}
async function press() {
  await act(async () =>
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === 'Đổi mặt' &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress(),
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
});

test('delegates the vertical flip to the library and waits until it finishes before updating study state', async () => {
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  expect(tree.root.findByType(FlipCard).props).toMatchObject({
    flipVertical: true,
    flipHorizontal: false,
    clickable: false,
  });
  await press();
  await press();
  expect(tree.root.findByType(FlipCard).props.flip).toBe(true);
  expect(onFlip).not.toHaveBeenCalled();
  expect(onAnimating).toHaveBeenCalledTimes(1);
  expect(onAnimating).toHaveBeenLastCalledWith(true);
  await act(async () => tree.root.findByType(FlipCard).props.onFlipEnd(true));
  expect(onFlip).toHaveBeenCalledWith(true);
  expect(onAnimating).toHaveBeenLastCalledWith(false);
  await press();
  expect(tree.root.findByType(FlipCard).props.flip).toBe(false);
});

test('reduced motion skips the library animation and disabled cards ignore taps', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  await act(async () => {
    tree = Renderer.create(<Probe disabled />);
  });
  await press();
  expect(onFlip).not.toHaveBeenCalled();
  await act(async () => tree.update(<Probe />));
  await press();
  expect(onFlip).toHaveBeenCalledWith(true);
  expect(tree.root.findAllByType(FlipCard)).toHaveLength(0);
});

test('ignores late library completion callbacks after unmount', async () => {
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  await press();
  const finish = tree.root.findByType(FlipCard).props.onFlipEnd;
  await act(async () => tree.unmount());
  await act(async () => finish(true));
  expect(onFlip).not.toHaveBeenCalled();
});

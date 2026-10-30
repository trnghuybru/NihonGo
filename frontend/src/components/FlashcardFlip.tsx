import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import FlipCard from 'react-native-flip-card';

export type FlashcardFlipHandle = { flip: () => void };

/** Keep study state and accessibility outside the library's visual animation. */
export function FlashcardFlip({
  flipped,
  active = true,
  disabled,
  onFlip,
  onAnimatingChange,
  children,
  ref,
}: {
  ref?: Ref<FlashcardFlipHandle>;
  flipped: boolean;
  active?: boolean;
  disabled: boolean;
  onFlip: (next: boolean) => void;
  onAnimatingChange: (animating: boolean) => void;
  children: (face: boolean, flip: () => void) => ReactNode;
}) {
  const turning = useRef(false);
  const alive = useRef(true);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [library, setLibrary] = useState({ target: flipped, key: 0 });
  useEffect(() => {
    let current = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (current) setReduceMotion(value);
      })
      .catch(() => {
        if (current) setReduceMotion(false);
      });
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      current = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!active || reduceMotion) {
      if (turning.current) {
        turning.current = false;
        if (active) onFlip(library.target);
        onAnimatingChange(false);
      }
    }
    if (!turning.current && library.target !== flipped) {
      setLibrary(previous => ({ target: flipped, key: previous.key + 1 }));
    }
  }, [
    active,
    reduceMotion,
    flipped,
    library.target,
    onFlip,
    onAnimatingChange,
  ]);
  const flip = () => {
    if (disabled || !active || turning.current) return;
    if (reduceMotion) {
      onFlip(!flipped);
      return;
    }
    turning.current = true;
    onAnimatingChange(true);
    setLibrary(previous => ({ ...previous, target: !flipped }));
  };
  useImperativeHandle(ref, () => ({ flip }));
  if (reduceMotion || !active)
    return (
      <View testID="flashcard-flip-motion">{children(flipped, flip)}</View>
    );
  return (
    <FlipCard
      key={library.key}
      testID="flashcard-flip-motion"
      flip={library.target}
      clickable={false}
      flipHorizontal={false}
      flipVertical
      friction={8}
      perspective={1000}
      useNativeDriver={Platform.OS !== 'web'}
      onFlipEnd={() => {
        if (!alive.current || !turning.current) return;
        turning.current = false;
        onFlip(library.target);
        onAnimatingChange(false);
      }}
    >
      {children(false, flip)}
      {children(true, flip)}
    </FlipCard>
  );
}

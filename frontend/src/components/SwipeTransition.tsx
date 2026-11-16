import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';

/** Slides the current results without retaining or mounting duplicate media players. */
export function SwipeTransition({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  const previous = useRef(index);
  const offset = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) setReducedMotion(value);
      })
      .catch(() => {
        if (mounted) setReducedMotion(false);
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  useLayoutEffect(() => {
    if (index === previous.current) return;
    const direction = index > previous.current ? 1 : -1;
    previous.current = index;
    offset.stopAnimation();
    if (reducedMotion !== false) {
      offset.setValue(0);
      return;
    }
    offset.setValue(direction * 20);
    const animation = Animated.timing(offset, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [index, offset, reducedMotion]);
  useEffect(() => {
    if (reducedMotion) {
      offset.stopAnimation();
      offset.setValue(0);
    }
  }, [offset, reducedMotion]);
  return (
    <View testID="swipe-transition" style={styles.viewport}>
      <Animated.View
        style={[styles.content, { transform: [{ translateX: offset }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  content: { flex: 1, minHeight: 0 },
});

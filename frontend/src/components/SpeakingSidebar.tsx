import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';

export function SpeakingSidebar({
  active,
  history,
  chat,
}: {
  active: boolean;
  history: ReactNode;
  chat?: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(360);
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
  useEffect(() => {
    if (reducedMotion === null) return;
    const animation = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: reducedMotion ? 0 : 280,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, progress, reducedMotion]);
  return (
    <View
      testID="speaking-sidebar"
      style={styles.viewport}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        testID="speaking-history-panel"
        pointerEvents={active ? 'none' : 'auto'}
        accessibilityElementsHidden={active}
        importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}
        style={[
          styles.panel,
          {
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -width],
                }),
              },
            ],
          },
        ]}
      >
        {history}
      </Animated.View>
      <Animated.View
        testID="speaking-chat-panel"
        pointerEvents={active ? 'auto' : 'none'}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.panel,
          {
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width, 0],
                }),
              },
            ],
          },
        ]}
      >
        {chat}
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 0,
  },
});

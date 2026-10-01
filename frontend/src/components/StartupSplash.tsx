import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLogo } from './BrandLogo';
import { NihongoMascot } from './NihongoMascot';
import { colors, spacing, typography } from '../theme/theme';

interface Props {
  ready: boolean;
  onFinished: () => void;
}

export function StartupSplash({ ready, onFinished }: Props) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [introFinished, setIntroFinished] = useState(false);
  const bounce = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      enabled => {
        if (active) {
          setReduceMotion(enabled);
        }
      },
      () => {
        if (active) {
          setReduceMotion(true);
        }
      },
    );
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) {
      return;
    }
    if (reduceMotion) {
      bounce.setValue(0);
      tilt.setValue(0);
      setIntroFinished(true);
      return;
    }

    const motion = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, {
        toValue,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      });

    const greeting = Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.sequence([
          motion(bounce, -18, 240),
          motion(bounce, 0, 240),
          motion(bounce, -8, 200),
          motion(bounce, 0, 200),
        ]),
        Animated.sequence([
          motion(tilt, -1, 220),
          motion(tilt, 1, 300),
          motion(tilt, 0, 300),
        ]),
      ]),
      Animated.delay(300),
    ]);
    greeting.start(({ finished }) => {
      if (finished) {
        setIntroFinished(true);
      }
    });
    return () => greeting.stop();
  }, [bounce, reduceMotion, tilt]);

  useEffect(() => {
    if (!ready || !introFinished) {
      return;
    }
    const exit = Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: true,
      isInteraction: false,
    });
    exit.start(({ finished }) => {
      if (finished) {
        onFinished();
      }
    });
    return () => exit.stop();
  }, [introFinished, onFinished, opacity, ready, reduceMotion]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <Animated.View style={[styles.content, { opacity }]}>
        <View style={styles.center}>
          <Animated.View
            style={{
              transform: [
                { translateY: bounce },
                {
                  rotate: tilt.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ['-5deg', '0deg', '5deg'],
                  }),
                },
              ],
            }}
          >
            <NihongoMascot size={200} decorative />
          </Animated.View>
          <BrandLogo large />
          <Text style={styles.tagline}>Học tiếng Nhật cùng Momo</Text>
        </View>
        <View style={styles.status} accessibilityLiveRegion="polite">
          {!ready ? (
            <ActivityIndicator size="small" color={colors.badgeText} />
          ) : null}
          <Text style={styles.statusText}>
            {ready ? 'Cùng bắt đầu nhé!' : 'Momo đang chuẩn bị…'}
          </Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xxl },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  tagline: { ...typography.label, color: colors.body, textAlign: 'center' },
  status: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: { ...typography.body, color: colors.muted, flexShrink: 1 },
});

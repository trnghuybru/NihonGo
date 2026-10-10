import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { HomeFeatureIcon } from './HomeFeatureIcon';
import type { SpeakingPresentation } from '../hooks/useSpeakingPresentation';
import { colors, radius } from '../theme/theme';

export function SpeakingMicrophone({
  presentation,
  ready,
  label,
  onPressIn,
  onPressOut,
}: {
  presentation: SpeakingPresentation;
  ready: boolean;
  label: string;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const level = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const listening = presentation.phase === 'user_speaking';
  const reduced = presentation.motion === 'reduced';
  const expanded =
    listening ||
    ['transition_to_user', 'user_turn'].includes(presentation.phase);
  const expansion = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const disabled = !ready && !listening;
  const active = listening && presentation.micLevel > 0.03;
  useEffect(() => {
    const animation = Animated.timing(expansion, {
      toValue: expanded ? 1 : 0,
      duration: reduced ? 0 : 280,
      easing: Easing.inOut(Easing.cubic),
      // Height must participate in layout so the message list gains this space.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, expansion, reduced]);
  useEffect(() => {
    const animation = Animated.timing(level, {
      toValue: listening ? presentation.micLevel : 0,
      duration: reduced ? 150 : 100,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [level, listening, presentation.micLevel, reduced]);
  useEffect(() => {
    shake.setValue(0);
    if (!active || reduced) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, {
          toValue: 1,
          duration: 70,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: -1,
          duration: 140,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: 0,
          duration: 70,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, reduced, shake]);
  return (
    <Animated.View
      testID="mic-reveal"
      style={[
        styles.stage,
        {
          height: expansion.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 104],
          }),
        },
      ]}
      pointerEvents={expanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View
        testID="mic-retractable"
        style={[
          styles.retractable,
          {
            transform: [
              {
                translateY: expansion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [104, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          testID="mic-sound-ring"
          style={[
            styles.ring,
            {
              opacity: level,
              transform: [
                {
                  scale: reduced
                    ? 1
                    : Animated.add(1, Animated.multiply(level, 0.35)),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={{
            transform: [
              {
                scale: reduced
                  ? 1
                  : Animated.add(1, Animated.multiply(level, 0.15)),
              },
              {
                translateX: reduced
                  ? 0
                  : Animated.multiply(Animated.multiply(shake, level), 2),
              },
              {
                rotate: reduced
                  ? '0deg'
                  : Animated.multiply(shake, level).interpolate({
                      inputRange: [-1, 1],
                      outputRange: ['-3deg', '3deg'],
                    }),
              },
            ],
          }}
        >
          <Pressable
            testID="speaking-mic"
            accessibilityRole="button"
            accessibilityLabel={label}
            aria-label={label}
            accessibilityHint="Giữ micro để nói, thả tay để gửi."
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={({ pressed }) => [
              styles.button,
              disabled ? styles.disabled : null,
              pressed && !disabled ? styles.pressed : null,
            ]}
          >
            <HomeFeatureIcon
              name="microphone"
              color={disabled ? colors.disabledText : colors.onPrimary}
              size={36}
            />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  stage: {
    width: 104,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retractable: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.badgeBg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.primaryPressed },
  disabled: { backgroundColor: colors.disabled },
});

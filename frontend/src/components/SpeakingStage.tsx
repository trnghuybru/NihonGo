import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { CharacterView3D } from './CharacterView3D';
import type { SpeakingPresentation } from '../hooks/useSpeakingPresentation';
import { colors, layout, radius, shadowMd } from '../theme/theme';

export const phaseLabels = {
  idle: 'Đang kết nối với Aoi…',
  ai_speaking: 'AI đang nói...',
  transition_to_user: 'Đến lượt bạn',
  user_turn: 'Đến lượt bạn',
  user_speaking: 'Đang nghe… Thả tay để gửi',
  processing: 'Aoi đang chuẩn bị trả lời…',
  error: 'Hội thoại đang tạm dừng',
};
export function useSpeakingAnimation(presentation: SpeakingPresentation) {
  const handoff = useRef(new Animated.Value(0)).current;
  const userSide = [
    'transition_to_user',
    'user_turn',
    'user_speaking',
  ].includes(presentation.phase);
  useEffect(() => {
    const animation = Animated.timing(handoff, {
      toValue: userSide ? 1 : 0,
      duration: presentation.motion === 'reduced' ? 150 : 380,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [handoff, userSide, presentation.motion]);
  return { handoff };
}
export function SpeakingAvatar({
  presentation,
  height,
  handoff,
  toolbar,
}: {
  presentation: SpeakingPresentation;
  height: number;
  handoff: Animated.Value;
  toolbar?: ReactNode;
}) {
  return (
    <View
      testID="speaking-avatar-stage"
      style={[
        styles.avatarStage,
        { height },
        presentation.phase === 'ai_speaking' ? styles.speakingGlow : null,
      ]}
    >
      <Animated.View
        style={[
          styles.avatar,
          {
            opacity: handoff.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.96],
            }),
          },
        ]}
      >
        <CharacterView3D
          isSpeaking={presentation.phase === 'ai_speaking'}
          portrait
        />
      </Animated.View>
      {toolbar ? (
        <View pointerEvents="box-none" style={styles.toolbarOverlay}>
          {toolbar}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  toolbarOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 2,
  },
  avatarStage: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 0,
  },
  avatar: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
  speakingGlow: {
    boxShadow: '0px 0px 28px rgba(252,160,75,0.25)',
  },
});

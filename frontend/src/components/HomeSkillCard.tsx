import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useWebLayout } from '../hooks/useWebLayout';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { HomeFeatureIcon } from './HomeFeatureIcon';
import type { MascotPose } from './NihongoMascot';

const skillHeads = {
  listening: require('../assets/mascot/momo-skill-listening-head-v1.png'),
  speaking: require('../assets/mascot/momo-skill-speaking-head-v1.png'),
  reading: require('../assets/mascot/momo-skill-reading-head-v1.png'),
  writing: require('../assets/mascot/momo-skill-writing-head-v1.png'),
  wave: require('../assets/mascot/momo-head.png'),
};

interface Props {
  title: string;
  description: string;
  action: string;
  pose: MascotPose;
  onPress: () => void;
}

export function HomeSkillCard({
  title,
  description,
  action,
  pose,
  onPress,
}: Props) {
  const { desktop } = useWebLayout();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}. ${action}`}
      onPress={onPress}
      testID={`home-skill-${pose}`}
      style={({ pressed }) => [
        styles.card,
        desktop && styles.desktopCard,
        pressed ? styles.pressed : null,
      ]}
    >
      <View
        style={styles.illustration}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.portrait} testID={`skill-momo-head-${pose}`}>
          <Image
            source={skillHeads[pose]}
            resizeMode="contain"
            accessible={false}
            style={styles.head}
          />
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.copy}>
          <Text style={styles.description}>{description}</Text>
        </View>
        <View style={styles.actionRow}>
          <Text style={styles.action}>{action}</Text>
          <HomeFeatureIcon name="arrow" size={17} color={colors.primaryText} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 216,
    flex: 1,
    minWidth: 0,
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  desktopCard: { flexDirection: 'row', alignItems: 'center', minHeight: 144 },
  content: { flex: 1, minWidth: 0, gap: spacing.md },
  illustration: { alignItems: 'center' },
  portrait: { width: 96, height: 96, position: 'relative' },
  head: { width: '100%', height: '100%' },
  pressed: { backgroundColor: colors.surfaceTint },
  copy: { flex: 1, gap: spacing.xs },
  title: { ...typography.title, color: colors.dark },
  description: { ...typography.body, color: colors.body },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  action: { ...typography.button, flexShrink: 1, color: colors.primaryText },
});

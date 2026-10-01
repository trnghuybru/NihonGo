import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { HomeFeatureIcon } from './HomeFeatureIcon';
import { MascotPose, NihongoMascot } from './NihongoMascot';

interface Props {
  title: string;
  description: string;
  action: string;
  pose: MascotPose;
  japaneseLabel: string;
  onPress: () => void;
}

export function HomeSkillCard({
  title,
  description,
  action,
  pose,
  japaneseLabel,
  onPress,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}. ${action}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View
        style={styles.illustration}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <NihongoMascot pose={pose} size={112} decorative />
      </View>
      <View style={styles.headingRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.japaneseLabel}>{japaneseLabel}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.actionRow}>
        <Text style={styles.action}>{action}</Text>
        <HomeFeatureIcon name="arrow" size={17} color={colors.primaryText} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 236,
    flex: 1,
    minWidth: 0,
    padding: spacing.xl,
    gap: spacing.lg,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  illustration: { alignItems: 'center' },
  pressed: { backgroundColor: colors.surfaceTint },
  headingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  japaneseLabel: { ...typography.caption, color: colors.muted },
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

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { HomeFeatureIcon } from './HomeFeatureIcon';
import { NihongoMascot } from './NihongoMascot';
import { MISSING_DATA } from '../config/content';

export function PromotionPanel({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lộ trình học: ${MISSING_DATA}`}
      accessibilityState={{ disabled: true }}
      disabled
      onPress={onPress}
      style={({ pressed }) => [styles.panel, pressed ? styles.pressed : null]}
    >
      <View style={styles.mascot}>
        <NihongoMascot size={76} decorative />
        <Text style={styles.mascotName}>MOMO</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{MISSING_DATA}</Text>
        <Text style={styles.title}>{MISSING_DATA}</Text>
        <Text style={styles.description}>{MISSING_DATA}</Text>
        <View style={styles.actionRow}>
          <Text style={styles.action}>Khám phá lộ trình</Text>
          <HomeFeatureIcon name="arrow" color={colors.primaryText} size={18} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#FFD8B4',
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceTint,
    boxShadow: shadowMd,
  },
  pressed: { backgroundColor: colors.badgeBg },
  mascot: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotName: {
    ...typography.caption,
    color: colors.badgeText,
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.sm },
  eyebrow: {
    ...typography.caption,
    color: colors.badgeText,
  },
  title: { ...typography.title, color: colors.dark },
  description: { ...typography.body, color: colors.body },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  action: { ...typography.button, color: colors.primaryText, flexShrink: 1 },
});

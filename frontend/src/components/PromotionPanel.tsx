import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadowSm, spacing, typography } from '../theme/theme';
import { HomeFeatureIcon } from './HomeFeatureIcon';
import { NihongoMascot } from './NihongoMascot';
import { useWebLayout } from '../hooks/useWebLayout';

export function PromotionPanel({ onPress }: { onPress: () => void }) {
  const { desktop } = useWebLayout();
  const description = (
    <Text style={styles.description}>
      Khám phá kế hoạch học dựa trên trình độ, mục tiêu và thời gian mỗi ngày.
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Khám phá lộ trình"
      onPress={onPress}
      testID="home-promotion-panel"
      style={({ pressed }) => [
        styles.panel,
        desktop && styles.desktopPanel,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.identity}>
        <NihongoMascot size={76} decorative />
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>HỌC CÙNG MOMO</Text>
          <Text style={styles.title}>Một lộ trình vừa sức dành cho bạn</Text>
          {desktop ? description : null}
        </View>
      </View>
      {!desktop ? description : null}
      <View style={styles.actionRow}>
        <Text style={styles.action}>Khám phá lộ trình</Text>
        <HomeFeatureIcon name="arrow" color={colors.primaryText} size={18} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  panel: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#FFD8B4',
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceTint,
    boxShadow: shadowSm,
  },
  desktopPanel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    flex: 1,
    minWidth: 0,
  },
  pressed: { backgroundColor: colors.badgeBg },
  copy: { flex: 1, minWidth: 0, gap: spacing.sm },
  eyebrow: { ...typography.caption, color: colors.badgeText },
  title: { ...typography.title, color: colors.dark },
  description: { ...typography.body, color: colors.body },
  actionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexShrink: 1,
  },
  action: { ...typography.button, color: colors.primaryText, flexShrink: 1 },
});

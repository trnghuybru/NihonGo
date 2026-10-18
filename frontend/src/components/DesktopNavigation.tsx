import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_TABS, AppTab } from './BottomNavigation';
import { BottomNavigationIcon } from './BottomNavigationIcon';
import { BrandLogo } from './BrandLogo';
import { colors, layout, radius, spacing, typography } from '../theme/theme';
import { DESKTOP_SIDEBAR_WIDTH } from '../hooks/useWebLayout';
import type { LearningSkill } from './SkillPicker';
import type { User } from '../services/authService';

export function DesktopNavigation({
  selectedTab,
  onSelectTab,
  activeSkill,
  onOpenSkill,
  user,
}: {
  selectedTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  activeSkill: LearningSkill | null;
  onOpenSkill: (skill: LearningSkill) => void;
  user: User;
}) {
  return (
    <View style={styles.sidebar} testID="desktop-navigation">
      <View style={styles.brand}>
        <BrandLogo />
      </View>
      <Text style={styles.sectionLabel}>KHÔNG GIAN HỌC TẬP</Text>
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Điều hướng chính"
        style={styles.links}
      >
        {APP_TABS.map(tab => {
          const selected = selectedTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => onSelectTab(tab.id)}
              style={({ pressed }) => [
                styles.link,
                selected && styles.selected,
                pressed && styles.pressed,
              ]}
            >
              <BottomNavigationIcon
                name={tab.icon}
                size={24}
                color={selected ? colors.primary : colors.dark}
              />
              <Text
                style={[styles.linkLabel, selected && styles.selectedLabel]}
              >
                {tab.label}
              </Text>
              {selected && <View style={styles.dot} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.sectionLabel}>LUYỆN NHANH</Text>
      {(
        [
          { id: 'listening', label: 'Nghe & shadowing' },
          { id: 'speaking', label: 'Hội thoại AI' },
        ] as const
      ).map(skill => (
        <Pressable
          key={skill.id}
          accessibilityRole="button"
          accessibilityLabel={skill.label}
          onPress={() => onOpenSkill(skill.id)}
          style={({ pressed }) => [
            styles.quickLink,
            selectedTab === 'practice' &&
              activeSkill === skill.id &&
              styles.selected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.quickLabel}>{skill.label}</Text>
        </Pressable>
      ))}
      <View style={styles.spacer} />
      <View style={styles.note}>
        <Text style={styles.noteTitle}>Một chút mỗi ngày</Text>
        <Text style={styles.noteText}>
          Chọn một kỹ năng và bắt đầu buổi học của bạn.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mở tài khoản của bạn"
        onPress={() => onSelectTab('profile')}
        style={styles.account}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountName}>{user.name}</Text>
          <Text style={styles.accountHint}>Tài khoản của bạn</Text>
        </View>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  sidebar: {
    width: DESKTOP_SIDEBAR_WIDTH,
    flexShrink: 0,
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  brand: { paddingTop: spacing.sm, paddingBottom: spacing.section },
  sectionLabel: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  links: { gap: spacing.xs },
  link: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.small,
    borderCurve: 'continuous',
  },
  linkLabel: { ...typography.label, color: colors.body, flex: 1 },
  selected: { backgroundColor: colors.badgeBg },
  selectedLabel: { color: colors.primaryText },
  pressed: { backgroundColor: colors.surfaceTint },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  quickLink: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.small,
    borderCurve: 'continuous',
  },
  quickLabel: { ...typography.body, color: colors.body },
  spacer: { flex: 1 },
  note: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    borderCurve: 'continuous',
  },
  noteTitle: { ...typography.label, color: colors.primaryText },
  noteText: { ...typography.body, color: colors.muted },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  avatar: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.label, color: colors.badgeText },
  accountCopy: { flex: 1, gap: spacing.xs },
  accountName: { ...typography.label, color: colors.dark },
  accountHint: { ...typography.caption, color: colors.muted },
});

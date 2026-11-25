import { HomeFeatureIcon } from './HomeFeatureIcon';
import {
  navigationLink,
  tabPaths,
  useWebNavigation,
} from '../navigation/webNavigation';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_TABS, AppTab } from './BottomNavigation';
import { BottomNavigationIcon } from './BottomNavigationIcon';
import { BrandLogo } from './BrandLogo';
import { colors, layout, radius, spacing, typography } from '../theme/theme';
import { DESKTOP_SIDEBAR_WIDTH } from '../hooks/useWebLayout';
import type { LearningSkill } from './SkillPicker';

export function DesktopNavigation({
  selectedTab,
  onSelectTab,
  activeSkill,
  activeActivity,
  onOpenFlashcards,
  onOpenGames,
  showGames = true,
  onOpenSkill,
}: {
  selectedTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  activeSkill: LearningSkill | null;
  activeActivity: 'flashcards' | 'games' | null;
  onOpenFlashcards: () => void;
  onOpenGames: () => void;
  showGames?: boolean;
  onOpenSkill: (skill: LearningSkill) => void;
}) {
  const web = useWebNavigation();
  return (
    <View style={styles.sidebar} testID="desktop-navigation">
      <View style={styles.brand}>
        <BrandLogo />
      </View>

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
              {...navigationLink(web, tabPaths[tab.id], () =>
                onSelectTab(tab.id),
              )}
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

            </Pressable>
          );
        })}
      </View>
      <Text style={styles.sectionLabel}>TỪ VỰNG</Text>
      {(
        [
          { id: 'flashcards', label: 'Flashcard', onPress: onOpenFlashcards },
          ...(showGames
            ? [
                {
                  id: 'games' as const,
                  label: 'Game từ vựng',
                  onPress: onOpenGames,
                },
              ]
            : []),
        ] as const
      ).map(item => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{
            selected: selectedTab === 'practice' && activeActivity === item.id,
          }}
          {...navigationLink(
            web,
            item.id === 'flashcards' ? '/flashcards' : '/games',
            item.onPress,
          )}
          style={({ pressed }) => [
            styles.quickLink,
            selectedTab === 'practice' &&
              activeActivity === item.id &&
              styles.selected,
            pressed && styles.pressed,
          ]}
        >
          <HomeFeatureIcon name={item.id === 'games' ? 'gamepad' : 'flashcards'} size={22} color={colors.dark} />
          <Text
            style={[
              styles.quickLabel,
              selectedTab === 'practice' &&
                activeActivity === item.id &&
                styles.selectedLabel,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
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
          {...navigationLink(web, '/practice/' + skill.id, () =>
            onOpenSkill(skill.id),
          )}
          style={({ pressed }) => [
            styles.quickLink,
            selectedTab === 'practice' &&
              activeSkill === skill.id &&
              styles.selected,
            pressed && styles.pressed,
          ]}
        >
          <HomeFeatureIcon name={skill.id === 'listening' ? 'headphones' : 'microphone'} size={22} color={colors.dark} />
          <Text style={styles.quickLabel}>{skill.label}</Text>
        </Pressable>
      ))}
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
  brand: {
    height: layout.desktopHeaderHeight,
    marginTop: -spacing.xl,
    justifyContent: 'center',
  },
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
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    justifyContent: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.small,
    borderCurve: 'continuous',
  },
  quickLabel: { ...typography.body, color: colors.body },
});

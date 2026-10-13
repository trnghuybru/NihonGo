import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, radius, spacing, typography } from '../theme/theme';
import {
  BottomNavigationIcon,
  BottomNavigationIconName,
} from './BottomNavigationIcon';

export type AppTab = 'home' | 'practice' | 'lookup' | 'vocabulary' | 'profile';

interface TabDefinition {
  id: AppTab;
  label: string;
  icon: BottomNavigationIconName;
}

export const APP_TABS: readonly TabDefinition[] = [
  { id: 'home', label: 'Trang chủ', icon: 'home' },
  { id: 'practice', label: 'Luyện tập', icon: 'practice' },
  { id: 'lookup', label: 'Tra cứu', icon: 'search' },
  { id: 'vocabulary', label: 'Bài học', icon: 'vocabulary' },
  { id: 'profile', label: 'Cá nhân', icon: 'profile' },
];

interface Props {
  selectedTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  floating?: boolean;
}

function BottomNavigationComponent({
  selectedTab,
  onSelectTab,
  floating = false,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.safeArea,
        floating && styles.floating,
        { paddingBottom: Math.max(12, insets.bottom + 8) },
      ]}
    >
      <View style={styles.container}>
        <View
          style={styles.tabRow}
          accessibilityRole="tablist"
          accessibilityLabel="Điều hướng chính"
        >
          {APP_TABS.map(tab => {
            const selected = tab.id === selectedTab;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected }}
                onPress={() => onSelectTab(tab.id)}
                style={({ pressed }) => [
                  styles.tab,
                  pressed ? styles.tabPressed : null,
                ]}
              >
                <BottomNavigationIcon
                  name={tab.icon}
                  size={24}
                  color={selected ? colors.primary : colors.dark}
                />
                <Text
                  style={[styles.tabLabel, selected && styles.selectedLabel]}
                >
                  {tab.label}
                </Text>
                <View
                  accessible={false}
                  style={[
                    styles.indicator,
                    selected ? styles.indicatorActive : null,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export const BottomNavigation = memo(BottomNavigationComponent);

const styles = StyleSheet.create({
  tabLabel: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 14,
    color: colors.body,
    textAlign: 'center',
  },
  selectedLabel: { color: colors.focus },
  safeArea: {
    paddingTop: 4,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  floating: { backgroundColor: 'transparent' },
  container: {
    minHeight: 72,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 44,
    borderCurve: 'continuous',
    boxShadow: '0 -2px 12px rgba(231, 142, 58, 0.10)',
    zIndex: 10,
  },
  tabRow: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tab: {
    flex: 1,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.small,
    borderCurve: 'continuous',
  },
  tabPressed: { backgroundColor: colors.surfaceTint },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: 'transparent',
  },
  indicatorActive: { backgroundColor: colors.primary },
});

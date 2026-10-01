import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, radius, spacing } from '../theme/theme';
import {
  BottomNavigationIcon,
  BottomNavigationIconName,
} from './BottomNavigationIcon';

export type AppTab = 'home' | 'practice' | 'vocabulary' | 'profile';

interface TabDefinition {
  id: AppTab;
  label: string;
  icon: BottomNavigationIconName;
}

export const APP_TABS: readonly TabDefinition[] = [
  { id: 'home', label: 'Trang chủ', icon: 'home' },
  { id: 'practice', label: 'Luyện tập', icon: 'practice' },
  { id: 'vocabulary', label: 'Từ vựng', icon: 'vocabulary' },
  { id: 'profile', label: 'Cá nhân', icon: 'profile' },
];

interface Props {
  selectedTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

function BottomNavigationComponent({ selectedTab, onSelectTab }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.safeArea,
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
                  color={selected ? colors.primary : colors.dark}
                />
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
  safeArea: {
    paddingTop: 4,
    paddingHorizontal: 28,
    backgroundColor: colors.background,
  },
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
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tab: {
    width: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 7,
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

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '../theme/theme';
import { BrandLogo } from './BrandLogo';

// Outside the page scroller: the logo stays visible without overlapping content.
export function MobileTopBar({ accessory }: { accessory?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="mobile-top-bar"
      style={[styles.bar, { paddingTop: insets.top + spacing.lg }]}
    >
      <BrandLogo />
      {accessory}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
});

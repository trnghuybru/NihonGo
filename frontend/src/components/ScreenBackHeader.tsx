import { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';
import { ChevronLeftIcon } from './icons';

// Desktop places the same header in the app bar; mobile renders it in place.
export const ScreenBackHeaderContext = createContext<Dispatch<
  SetStateAction<ReactNode>
> | null>(null);

export function ScreenBackHeader({
  title,
  backLabel,
  onBack,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
}) {
  const setHeader = useContext(ScreenBackHeaderContext);
  const header = useMemo(
    () => (
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          hitSlop={6}
          style={styles.back}
        >
          <ChevronLeftIcon size={18} color={colors.dark} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>
    ),
    [backLabel, onBack, title],
  );
  useLayoutEffect(() => {
    if (!setHeader) return;
    setHeader(header);
    return () => setHeader(null);
  }, [header, setHeader]);
  return setHeader ? null : header;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  title: { ...typography.heading, color: colors.dark, flexShrink: 1 },
});

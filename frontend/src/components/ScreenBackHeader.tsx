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
  disabled = false,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  disabled?: boolean;
}) {
  const setHeader = useContext(ScreenBackHeaderContext);
  const header = useMemo(
    () => (
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          disabled={disabled}
          accessibilityState={{ disabled }}
          hitSlop={8}
          style={[styles.back, disabled && styles.disabled]}
        >
          <ChevronLeftIcon size={16} color={colors.dark} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>
    ),
    [backLabel, onBack, title, disabled],
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  title: { ...typography.heading, color: colors.dark, flexShrink: 1 },
  disabled: { opacity: 0.5 },
});

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ReadingAnchor } from '../services/readingService';
import { colors, radius, spacing, typography } from '../theme/theme';

export function ReadingFold({
  title,
  children,
  initialOpen = false,
}: {
  title: string;
  children: ReactNode;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <View style={styles.fold}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(value => !value)}
        style={styles.foldHeader}
      >
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.muted}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}
export function ReadingSourceLink({
  location,
  onFocus,
  label,
}: {
  location: ReadingAnchor;
  onFocus: (anchor: ReadingAnchor) => void;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? `Xem trong bài: ${location.quote}`}
      onPress={() => onFocus(location)}
      style={styles.source}
    >
      <Text style={styles.sourceText}>{location.quote}</Text>
      <Text style={styles.link}>↗</Text>
    </Pressable>
  );
}
export { ReadingSentenceDetail } from './ReadingSentenceDetail';
export const readingStudyStyles = StyleSheet.create({
  fill: { flex: 1 },
  text: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 23,
    color: colors.body,
  },
  japanese: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 26,
    color: colors.dark,
  },
  label: { ...typography.label, color: colors.dark },
  muted: { ...typography.caption, color: colors.muted },
  link: { ...typography.button, color: colors.focus },
  heading: { ...typography.heading, color: colors.dark },
  body: { gap: spacing.sm },
  card: {
    padding: 20,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    gap: spacing.lg,
  },
  fold: { gap: spacing.md, paddingVertical: spacing.sm },
  foldHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  source: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sourceText: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 25,
    color: colors.focus,
    flex: 1,
    minWidth: 0,
  },
  core: {
    gap: spacing.md,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    padding: spacing.md,
  },
  caution: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 21,
    color: colors.danger,
  },
});
const styles = readingStudyStyles;

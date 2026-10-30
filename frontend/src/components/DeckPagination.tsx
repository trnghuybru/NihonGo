import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { colors, radius, spacing, typography } from '../theme/theme';

export function DeckPagination({
  page,
  totalPages,
  onChange,
  itemLabel = 'bộ thẻ',
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  itemLabel?: string;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 500;
  const start = Math.max(1, Math.min(page - 1, totalPages - 2));
  const visible = Array.from(
    { length: Math.min(3, totalPages) },
    (_, index) => start + index,
  );
  const pages = compact
    ? visible
    : [...new Set([1, ...visible, totalPages])].sort((a, b) => a - b);
  return (
    <View
      style={styles.container}
      accessibilityLabel={`Phân trang ${itemLabel}`}
    >
      <Text style={styles.caption}>
        Trang {page} / {totalPages}
      </Text>
      <View style={styles.pages}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Trang ${itemLabel} trước`}
          accessibilityState={{ disabled: page <= 1 }}
          disabled={page <= 1}
          onPress={() => onChange(page - 1)}
          style={[styles.button, page <= 1 && styles.disabled]}
        >
          <ChevronLeftIcon
            size={18}
            color={page <= 1 ? colors.disabledText : colors.body}
          />
        </Pressable>
        {pages.map((item, index) => (
          <View key={item} style={styles.pages}>
            {index > 0 && item - pages[index - 1] > 1 ? (
              <Text style={styles.ellipsis}>…</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Trang ${itemLabel} ${item}`}
              accessibilityState={{ selected: item === page }}
              aria-selected={item === page}
              onPress={() => onChange(item)}
              style={({ pressed }) => [
                styles.button,
                item === page && styles.selected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.number, item === page && styles.selectedText]}
              >
                {item}
              </Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Trang ${itemLabel} sau`}
          accessibilityState={{ disabled: page >= totalPages }}
          disabled={page >= totalPages}
          onPress={() => onChange(page + 1)}
          style={[styles.button, page >= totalPages && styles.disabled]}
        >
          <ChevronRightIcon
            size={18}
            color={page >= totalPages ? colors.disabledText : colors.body}
          />
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  caption: { ...typography.caption, color: colors.muted },
  pages: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  button: {
    minWidth: 40,
    height: 48,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedText: { color: colors.dark },
  number: { ...typography.label, color: colors.body },
  disabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  pressed: { opacity: 0.7 },
  ellipsis: {
    ...typography.caption,
    color: colors.muted,
    width: 16,
    textAlign: 'center',
  },
});

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EvaluationResult } from '../services/speakingService';
import { colors, radius, spacing, typography } from '../theme/theme';

export const criterionNames = {
  grammar: 'Ngữ pháp',
  vocabulary: 'Từ vựng',
  naturalness: 'Độ tự nhiên',
};

export const MessageFeedback = memo(function MessageFeedbackCard({
  messageId,
  items,
  expanded,
  onToggle,
}: {
  messageId: string;
  items: EvaluationResult['items'];
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const hasError = items.some(item => item.kind === 'error');
  const label = hasError ? 'Chỗ cần chỉnh sửa' : 'Gợi ý cách nói tự nhiên hơn';
  return (
    <View style={styles.card} testID={`feedback-${messageId}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${items[0].original}`}
        accessibilityState={{ expanded }}
        onPress={() => onToggle(messageId)}
        style={styles.toggle}
      >
        <View style={styles.copy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.caption}>
            {[
              ...new Set(items.map(item => criterionNames[item.criterion])),
            ].join(' · ')}
          </Text>
        </View>
        <Text style={styles.label}>{expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded
        ? items.map((item, index) => (
            <View key={index} style={styles.detail}>
              <Text style={styles.label}>
                {criterionNames[item.criterion]} ·{' '}
                {item.kind === 'error' ? 'Cần chỉnh' : 'Gợi ý diễn đạt'}
              </Text>
              <Text style={styles.caption}>
                {item.kind === 'error' ? 'Chỗ cần sửa' : 'Cách nói hiện tại'}
              </Text>
              <Text selectable style={styles.original}>
                {item.original}
              </Text>
              <Text style={styles.caption}>Vì sao?</Text>
              <Text style={styles.body}>{item.explanation}</Text>
              <Text style={styles.caption}>
                {item.kind === 'error' ? 'Câu sau khi sửa' : 'Cách nói gợi ý'}
              </Text>
              <Text selectable style={styles.improved}>
                {item.improved}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: '85%',
    alignSelf: 'flex-end',
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  toggle: {
    minHeight: 48,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  copy: { flex: 1, gap: spacing.xs },
  label: { ...typography.label, color: colors.badgeText },
  caption: { ...typography.caption, color: colors.muted },
  detail: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  body: { ...typography.input, color: colors.body },
  original: { ...typography.input, color: colors.badgeText },
  improved: {
    ...typography.input,
    color: colors.success,
    backgroundColor: colors.successBg,
    padding: spacing.md,
    borderRadius: radius.small,
  },
});

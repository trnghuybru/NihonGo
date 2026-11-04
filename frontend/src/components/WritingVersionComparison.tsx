import { StyleSheet, Text, View } from 'react-native';
import type { WritingSubmissionApi } from '../services/writingService';
import { colors, radius, spacing, typography } from '../theme/theme';
import { useWebLayout } from '../hooks/useWebLayout';

export function WritingVersionComparison({
  items,
}: {
  items: WritingSubmissionApi[];
}) {
  const { desktop } = useWebLayout();
  if (items.length !== 2) return null;
  const [older, newer] = [...items].sort(
    (a, b) => Number(a.submitted_at) - Number(b.submitted_at),
  );
  const sentences = (text: string) =>
    text
      .split(/[。.!?！？\n]+/)
      .map(item => item.trim())
      .filter(Boolean);
  const before = sentences(older.text);
  const after = sentences(newer.text);
  const added = after.filter(item => !before.includes(item));
  const removed = before.filter(item => !after.includes(item));
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Kết quả so sánh</Text>
      <View style={[styles.section, desktop && styles.row]}>
        {[older, newer].map((item, index) => (
          <View key={item.id} style={[styles.card, desktop && styles.flex]}>
            <Text style={styles.title}>
              {index ? 'Bài mới' : 'Bài trước'} · {item.score} điểm
            </Text>
            <Text style={styles.meta}>
              Nộp ngày{' '}
              {new Date(item.submitted_at * 1000).toLocaleDateString('vi-VN')}
            </Text>
            <Text selectable style={styles.essay}>
              {item.text}
            </Text>
            <Text style={styles.title}>Nhận xét AI</Text>
            <Text style={styles.body}>{item.feedback}</Text>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Nội dung thay đổi</Text>
        {added.map((item, index) => (
          <Text key={`a${index}`} style={styles.added}>
            + {item}
          </Text>
        ))}
        {removed.map((item, index) => (
          <Text key={`r${index}`} style={styles.removed}>
            − {item}
          </Text>
        ))}
        {!added.length && !removed.length ? (
          <Text style={styles.body}>Các câu không thay đổi.</Text>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  flex: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.dark },
  meta: { ...typography.caption, color: colors.muted },
  essay: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 28,
    color: colors.dark,
  },
  body: { ...typography.body, color: colors.body, lineHeight: 21 },
  added: { ...typography.body, color: colors.success, lineHeight: 22 },
  removed: { ...typography.body, color: colors.danger, lineHeight: 22 },
});

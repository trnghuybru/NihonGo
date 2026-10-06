import { StyleSheet, Text, View } from 'react-native';
import {
  LearningOptions,
  LearningSelection,
} from '../services/learningService';
import { colors, spacing, typography } from '../theme/theme';
import { MISSING_DATA } from '../config/content';

export function LearningSummary({
  selection,
  options,
}: {
  selection: LearningSelection;
  options: LearningOptions;
}) {
  const rows = [
    [
      'Trình độ hiện tại',
      options.levels.find(item => item.id === selection.level)?.label ||
        selection.level ||
        MISSING_DATA,
    ],
    [
      'Mục tiêu chính',
      options.goals.find(item => item.id === selection.goal)?.label ||
        selection.goal ||
        MISSING_DATA,
    ],
    ['Thời gian mỗi ngày', `${selection.daily_minutes} phút`],
  ];
  return (
    <View style={styles.rows}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      <Text style={styles.note}>
        Trình độ do bạn tự đánh giá. Có thể điều chỉnh bất cứ lúc nào.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.lg },
  row: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.muted },
  value: { ...typography.label, color: colors.dark },
  note: { ...typography.body, color: colors.body },
});

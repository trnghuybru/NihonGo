import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { FlashcardSession } from '../services/flashcardService';
import { colors, radius, spacing, typography } from '../theme/theme';

const levels = [
  { label: 'Chưa nhớ', color: colors.danger },
  { label: 'Mơ hồ', color: colors.primary },
  { label: 'Nhớ', color: colors.focus },
  { label: 'Rất nhớ', color: colors.success },
];
const size = 112;
const ringRadius = 46;
const circumference = 2 * Math.PI * ringRadius;

export function FlashcardSummaryChart({
  summary,
}: {
  summary: FlashcardSession['summary'];
}) {
  let offset = 0;
  return (
    <View style={styles.row}>
      <View
        style={styles.chart}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Biểu đồ mức nhớ: ${
          summary.remembered_percent
        }% nhớ. ${levels
          .map((level, index) => `${level.label}: ${summary.counts[index]} thẻ`)
          .join('. ')}`}
      >
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          accessible={false}
        >
          <Circle
            cx={56}
            cy={56}
            r={ringRadius}
            fill="none"
            stroke={colors.track}
            strokeWidth={12}
          />
          {levels.map((level, index) => {
            const count = summary.counts[index];
            if (!summary.studied || !count) return null;
            const length = (count / summary.studied) * circumference;
            const start = offset;
            offset += length;
            return (
              <Circle
                key={level.label}
                cx={56}
                cy={56}
                r={ringRadius}
                fill="none"
                stroke={level.color}
                strokeWidth={12}
                strokeDasharray={[length, circumference - length]}
                strokeDashoffset={-start}
                rotation={-90}
                origin="56, 56"
              />
            );
          })}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.percent}>{summary.remembered_percent}% nhớ</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {levels.map((level, index) => (
          <View key={level.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: level.color }]} />
            <Text style={styles.label}>{level.label}</Text>
            <Text style={styles.count}>{summary.counts[index]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  chart: { width: size, height: size },
  center: {
    ...StyleSheet.absoluteFill,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: { ...typography.label, color: colors.dark, textAlign: 'center' },
  legend: { flexGrow: 1, flexBasis: 120, gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  label: { ...typography.body, color: colors.body, flex: 1 },
  count: { ...typography.caption, color: colors.dark },
});

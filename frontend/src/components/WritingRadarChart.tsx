import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Line,
  Polygon,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';
import type { WritingAssessment } from '../services/writingService';
import { colors, typography } from '../theme/theme';

const axes = [
  { id: 'task', lines: ['Đáp ứng đề'], x: 160, y: 18 },
  { id: 'organization', lines: ['Tổ chức', 'và liên kết'], x: 274, y: 116 },
  { id: 'grammar', lines: ['Ngữ pháp'], x: 160, y: 250 },
  { id: 'vocabulary', lines: ['Từ vựng', 'và chính tả'], x: 46, y: 116 },
];
const center = { x: 160, y: 140 };
const radius = 76;
const point = (index: number, ratio: number) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 2;
  return {
    x: center.x + Math.cos(angle) * radius * ratio,
    y: center.y + Math.sin(angle) * radius * ratio,
  };
};
const polygon = (ratios: number[]) =>
  ratios
    .map((ratio, index) => {
      const p = point(index, ratio);
      return `${p.x},${p.y}`;
    })
    .join(' ');

export function WritingRadarChart({
  criteria,
}: Pick<WritingAssessment, 'criteria'>) {
  // Keep axes and the 0–25 scale stable across submissions and API ordering.
  const scores = axes.map(
    axis => criteria.find(item => item.id === axis.id)?.score ?? 0,
  );
  const ratios = scores.map(score =>
    Number.isFinite(score) ? Math.max(0, Math.min(25, score)) / 25 : 0,
  );
  return (
    <View
      style={styles.chart}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Biểu đồ điểm theo tiêu chí. ${axes
        .map((axis, index) => `${axis.lines.join(' ')}: ${scores[index]}/25`)
        .join('. ')}`}
    >
      <Svg width="100%" height="100%" viewBox="0 0 320 290" accessible={false}>
        {[0.2, 0.4, 0.6, 0.8, 1]
          .map(ratio => (
            <Polygon
              key={ratio}
              points={polygon(axes.map(() => ratio))}
              fill={ratio === 1 ? colors.surfaceTint : 'none'}
              stroke={colors.border}
              strokeWidth={1}
            />
          ))
          .reverse()}
        {axes.map((axis, index) => {
          const end = point(index, 1);
          return (
            <Line
              key={axis.id}
              x1={center.x}
              y1={center.y}
              x2={end.x}
              y2={end.y}
              stroke={colors.divider}
            />
          );
        })}
        <Polygon
          points={polygon(ratios)}
          fill={colors.primary}
          fillOpacity={0.2}
          stroke={colors.primary}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {axes.map((axis, index) => {
          const p = point(index, ratios[index]);
          return (
            <Circle
              key={axis.id}
              cx={p.x}
              cy={p.y}
              r={4}
              fill={colors.primary}
              stroke={colors.surface}
              strokeWidth={1.5}
            />
          );
        })}
        {axes.map((axis, index) => (
          <SvgText
            key={axis.id}
            x={axis.x}
            y={axis.y}
            textAnchor="middle"
            fill={colors.body}
            fontFamily={typography.body.fontFamily}
            fontSize={11}
          >
            {axis.lines.map((line, lineIndex) => (
              <TSpan key={line} x={axis.x} dy={lineIndex ? 15 : 0}>
                {line}
              </TSpan>
            ))}
            <TSpan x={axis.x} dy={19} fill={colors.dark} fontWeight="600">
              {scores[index]}/25
            </TSpan>
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
const styles = StyleSheet.create({
  chart: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: 320 / 290,
    alignSelf: 'center',
  },
});

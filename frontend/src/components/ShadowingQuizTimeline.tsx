import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { ShadowingQuestion } from '../services/shadowingService';
import { colors, radius, spacing, typography } from '../theme/theme';
import { videoTimestamp } from './VideoExampleCard';

export function quizTimelineLayout(
  times: number[],
  duration: number,
  width: number,
) {
  const span = Math.max(1, width);
  const markers = times
    .map((seconds, index) => ({
      index,
      ratio: Math.max(0, Math.min(1, seconds / Math.max(1, duration))),
    }))
    .sort((a, b) => a.ratio - b.ratio);
  // Keep all labels in one row, shifting only labels that would overlap.
  const gap = Math.min(64, span / Math.max(1, markers.length - 1));
  const positions = markers.map(marker => marker.ratio * span);
  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + gap);
  }
  if (positions.length && positions[positions.length - 1] > span) {
    positions[positions.length - 1] = span;
    for (let index = positions.length - 2; index >= 0; index -= 1) {
      positions[index] = Math.min(positions[index], positions[index + 1] - gap);
    }
  }
  return markers.map((marker, index) => ({
    ...marker,
    labelRatio: positions[index] / span,
  }));
}

export function ShadowingQuizTimeline({
  questions,
  answers,
  durationSeconds,
  disabled,
  onSelect,
  headerControl,
  emptyContent,
}: {
  questions: ShadowingQuestion[];
  answers: Record<string, number>;
  durationSeconds: number;
  disabled: boolean;
  onSelect: (id: string, answered: boolean) => void;
  headerControl?: ReactNode;
  emptyContent?: ReactNode;
}) {
  const [width, setWidth] = useState(280);
  const duration = Math.max(
    1,
    Number.isFinite(durationSeconds) ? durationSeconds : 0,
    ...questions.map(q => q.trigger_seconds),
  );
  const markers = quizTimelineLayout(
    questions.map(q => q.trigger_seconds),
    duration,
    Math.max(1, width),
  );
  const axis = 68;
  const completed = questions.filter(q => answers[q.id] !== undefined).length;
  return (
    <View style={styles.card} testID="shadowing-quiz-timeline">
      <View style={styles.header}>
        <Text style={styles.title}>Câu hỏi</Text>
        <View style={styles.headerActions}>
          {questions.length ? (
            <Text
              accessibilityLabel={`Đã trả lời ${completed} trên ${questions.length} câu hỏi`}
              style={styles.progress}
            >
              {completed}/{questions.length}
            </Text>
          ) : null}
          {headerControl}
        </View>
      </View>
      {questions.length ? (
        <>
          <View
            onLayout={event =>
              setWidth(Math.round(event.nativeEvent.layout.width))
            }
            style={[styles.plot, { height: axis + 30 }]}
          >
            <View style={[styles.rail, { top: axis }]} />
            <Svg
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              width="100%"
              height={axis + 30}
            >
              {markers.map(marker => (
                <Line
                  key={marker.index}
                  x1={marker.labelRatio * width}
                  y1={60}
                  x2={marker.ratio * width}
                  y2={axis + 2}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              ))}
            </Svg>
            {markers.map(({ index, ratio, labelRatio }) => {
              const question = questions[index];
              const answered = answers[question.id] !== undefined;
              const correct =
                answered && answers[question.id] === question.correct_index;
              const status = !answered
                ? 'Chưa trả lời'
                : correct
                ? 'Đúng'
                : 'Chưa đúng';
              return (
                <Fragment key={question.id}>
                  <View
                    style={[styles.marker, { left: `${labelRatio * 100}%` }]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        answered
                          ? `Mốc câu hỏi ${index + 1}: ${status}`
                          : `Tới câu hỏi ${index + 1}`
                      }
                      accessibilityHint={`${videoTimestamp(
                        question.trigger_seconds,
                      )} · ${status}`}
                      accessibilityState={{ disabled }}
                      disabled={disabled}
                      onPress={() => onSelect(question.id, answered)}
                      style={({ pressed }) => [
                        styles.point,
                        answered &&
                          (correct ? styles.correct : styles.incorrect),
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.pointText}>{index + 1}</Text>
                      {answered ? (
                        <Text
                          style={[
                            styles.status,
                            { color: correct ? colors.success : colors.danger },
                          ]}
                        >
                          {correct ? '✓' : '×'}
                        </Text>
                      ) : null}
                    </Pressable>
                    <Text style={styles.timestamp}>
                      {videoTimestamp(question.trigger_seconds)}
                    </Text>
                  </View>
                  <View
                    pointerEvents="none"
                    style={[
                      styles.anchor,
                      {
                        top: axis - 3,
                        left: `${ratio * 100}%`,
                        backgroundColor: answered
                          ? correct
                            ? colors.success
                            : colors.danger
                          : colors.primary,
                      },
                    ]}
                  />
                </Fragment>
              );
            })}
            <Text style={[styles.edge, styles.edgeStart, { top: axis + 10 }]}>
              0:00
            </Text>
            <Text style={[styles.edge, styles.edgeEnd, { top: axis + 10 }]}>
              {videoTimestamp(duration)}
            </Text>
          </View>
          <View style={styles.legend}>
            <Text style={[styles.legendText, { color: colors.primaryText }]}>
              ● Chưa trả lời
            </Text>
            <Text style={[styles.legendText, { color: colors.success }]}>
              ✓ Đúng
            </Text>
            <Text style={[styles.legendText, { color: colors.danger }]}>
              × Chưa đúng
            </Text>
          </View>
        </>
      ) : (
        emptyContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  title: { ...typography.heading, color: colors.dark },
  progress: { ...typography.caption, color: colors.body },
  hint: { ...typography.body, color: colors.muted },
  plot: { marginHorizontal: 28, marginTop: spacing.md },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  marker: {
    position: 'absolute',
    top: 0,
    width: 56,
    marginLeft: -28,
    alignItems: 'center',
  },
  point: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { ...typography.button, color: colors.onPrimary },
  status: {
    position: 'absolute',
    right: -4,
    top: -5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    width: 20,
    height: 20,
    textAlign: 'center',
    ...typography.caption,
  },
  correct: { backgroundColor: colors.success },
  incorrect: { backgroundColor: colors.danger },
  pressed: { opacity: 0.8 },
  timestamp: {
    ...typography.caption,
    fontSize: 10,
    color: colors.body,
    marginTop: 3,
  },
  anchor: {
    position: 'absolute',
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  edgeStart: { left: 0 },
  edgeEnd: { right: 0 },
  edge: {
    position: 'absolute',
    ...typography.caption,
    fontSize: 10,
    color: colors.muted,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  legendText: { ...typography.caption, fontSize: 10 },
});

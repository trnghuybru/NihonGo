import { createContext, useContext, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useStudyTime } from '../hooks/useStudyTime';
import { formatStudyTime } from '../utils/studyTime';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';
import { AuthIcon } from './AuthIcon';

type Progress = ReturnType<typeof useStudyTime>;
const ProgressContext = createContext<Progress | null>(null);
const ActivityContext = createContext<(active: boolean) => void>(() => {});

export function StudyTimeProvider({
  accountId,
  goalMinutes,
  children,
}: {
  accountId: string;
  goalMinutes: number;
  children: React.ReactNode;
}) {
  const progress = useStudyTime(accountId, goalMinutes);
  return (
    <ActivityContext.Provider value={progress.setStudying}>
      <ProgressContext.Provider value={progress}>
        {children}
      </ProgressContext.Provider>
    </ActivityContext.Provider>
  );
}

export function useStudyActivity(active: boolean) {
  const setStudying = useContext(ActivityContext);
  useEffect(() => {
    setStudying(active);
    return () => setStudying(false);
  }, [active, setStudying]);
}

export function StudyTimerBadge() {
  const progress = useContext(ProgressContext);
  if (!progress) return null;
  const completed = progress.seconds >= progress.goalSeconds;
  return (
    <View
      style={[styles.badge, completed && styles.completeBadge]}
      testID="study-timer-badge"
    >
      <View
        style={[
          styles.dot,
          (progress.running || completed) && styles.activeDot,
        ]}
      />
      <Text
        style={styles.badgeText}
        accessibilityLabel={
          progress.ready
            ? `Hôm nay đã học ${Math.floor(progress.seconds / 60)} phút ${
                progress.seconds % 60
              } giây, mục tiêu ${progress.goalSeconds / 60} phút`
            : 'Đang tải thời gian học'
        }
      >
        {progress.ready ? formatStudyTime(progress.seconds) : '--:--'} /{' '}
        {progress.goalSeconds / 60} phút{completed ? ' ✓' : ''}
      </Text>
    </View>
  );
}

export function DailyGoalProgress() {
  const progress = useContext(ProgressContext);
  if (!progress) return null;
  const completed = progress.ready && progress.seconds >= progress.goalSeconds;
  const percent = Math.min(
    100,
    Math.floor((progress.seconds / progress.goalSeconds) * 100),
  );
  return (
    <View style={styles.card} testID="daily-goal-progress">
      <View style={styles.row}>
        <Text style={styles.heading} accessibilityRole="header">
          Mục tiêu hôm nay
        </Text>
        <View style={[styles.status, completed && styles.completeStatus]}>
          {completed ? (
            <AuthIcon name="check" size={12} color={colors.success} />
          ) : null}
          <Text style={[styles.statusText, completed && styles.success]}>
            {!progress.ready
              ? 'Đang tải'
              : completed
              ? 'Đã hoàn thành'
              : `${percent}%`}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <Text style={[styles.time, completed && styles.success]}>
          {progress.ready ? formatStudyTime(progress.seconds) : '--:--'}
          <Text style={styles.target}> / {progress.goalSeconds / 60} phút</Text>
        </Text>
        {!progress.ready && !progress.error ? (
          <ActivityIndicator
            color={colors.focus}
            accessibilityLabel="Đang tải tiến độ học"
          />
        ) : null}
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel="Tiến độ mục tiêu học hôm nay"
        accessibilityValue={{
          min: 0,
          max: progress.goalSeconds,
          now: Math.min(progress.seconds, progress.goalSeconds),
        }}
      >
        <View
          style={[
            styles.bar,
            { width: `${percent}%` },
            completed && styles.completeBar,
          ]}
        />
      </View>
      {progress.error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thử đồng bộ thời gian học"
          onPress={() => {
            progress.retry();
          }}
          style={({ pressed }) => [
            styles.retry,
            pressed && styles.retryPressed,
          ]}
        >
          <Text style={styles.retryText}>Chưa đồng bộ · Thử lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    boxShadow: shadowMd,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heading: { ...typography.heading, color: colors.dark },
  time: {
    ...typography.title,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
  },
  target: { ...typography.label, color: colors.muted },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.badgeBg,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
  },
  statusText: { ...typography.caption, color: colors.badgeText },
  completeStatus: { backgroundColor: colors.successBg },
  track: {
    height: 6,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.primary,
  },
  completeBar: { backgroundColor: colors.success },
  success: { color: colors.success },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...typography.caption,
    color: colors.focus,
    fontVariant: ['tabular-nums'],
  },
  completeBadge: { backgroundColor: colors.successBg },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  activeDot: { backgroundColor: colors.success },
  retry: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
  },
  retryPressed: { backgroundColor: colors.surfaceTint },
  retryText: { ...typography.link, color: colors.primaryText },
});

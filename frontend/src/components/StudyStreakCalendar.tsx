import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { useStudyProgress } from './StudyTime';
import { studyTimeService } from '../services/studyTimeService';
import type { StudyCalendar } from '../services/studyTimeService';
import { studyDate } from '../utils/studyTime';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';

const DAY_MS = 86400000;
const ACTIVE_SECONDS = 60;

function yearWeeks(year: number) {
  const first = Date.UTC(year, 0, 1);
  const last = Date.UTC(year, 11, 31);
  const firstMonday = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY_MS;
  const lastSunday = last + (7 - new Date(last).getUTCDay()) % 7 * DAY_MS;
  const weeks: (string | null)[][] = [];
  for (let week = firstMonday; week <= lastSunday; week += 7 * DAY_MS) {
    weeks.push(
      Array.from({ length: 7 }, (_, day) => {
        const stamp = week + day * DAY_MS;
        return new Date(stamp).getUTCFullYear() === year
          ? new Date(stamp).toISOString().slice(0, 10)
          : null;
      }),
    );
  }
  return weeks;
}

function intensity(seconds: number, goalSeconds: number) {
  if (seconds < ACTIVE_SECONDS) return 0;
  const ratio = seconds / goalSeconds;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export function StudyStreakCalendar({ accountId }: { accountId: string }) {
  const progress = useStudyProgress();
  const today = studyDate(Date.now());
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<StudyCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const gridRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrolledYear = useRef<number | null>(null);
  const weeks = useMemo(() => yearWeeks(year), [year]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    studyTimeService
      .calendar(accountId, year)
      .then(result => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (alive) setError('Chưa tải được lịch học.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [accountId, year, reload]);

  useEffect(() => {
    let previousDay = studyDate(Date.now());
    const timer = setInterval(() => {
      const nextDay = studyDate(Date.now());
      if (nextDay === previousDay) return;
      const previousYear = Number(previousDay.slice(0, 4));
      const nextYear = Number(nextDay.slice(0, 4));
      setYear(value => value === previousYear ? nextYear : value);
      setReload(value => value + 1);
      previousDay = nextDay;
    }, 60000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setReload(value => value + 1);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const secondsByDay = useMemo(
    () => new Map(data?.days.map(day => [day.date, day.seconds]) ?? []),
    [data],
  );
  const serverTodaySeconds = secondsByDay.get(today) ?? 0;
  const localTodaySeconds = progress?.ready ? progress.seconds : 0;
  const todayStudiedLocally =
    localTodaySeconds >= ACTIVE_SECONDS && serverTodaySeconds < ACTIVE_SECONDS;
  const currentStreak = (data?.current_streak ?? 0) + (todayStudiedLocally ? 1 : 0);
  const longestStreak = Math.max(data?.longest_streak ?? 0, currentStreak);
  const studyDays =
    (data?.study_days ?? 0) +
    (year === currentYear && todayStudiedLocally ? 1 : 0);
  const goalSeconds = data?.goal_seconds ?? progress?.goalSeconds ?? 900;
  const firstYear = data?.first_year ?? currentYear;

  const changeYear = (next: number) => {
    scrolledYear.current = null;
    setData(null);
    setYear(next);
    gridRef.current?.scrollTo({ x: 0, animated: false });
  };

  return (
    <View style={styles.card} testID="study-streak-calendar">
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.heading}>
            Lịch học
          </Text>
          <Text style={styles.subheading}>Hoạt động trong năm</Text>
        </View>
        <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Năm trước"
          accessibilityState={{ disabled: year <= firstYear }}
          disabled={year <= firstYear}
          hitSlop={8}
          onPress={() => changeYear(year - 1)}
          style={[styles.control, year <= firstYear && styles.disabled]}
        >
          <ChevronLeftIcon
            size={16}
            color={year <= firstYear ? colors.disabledText : colors.body}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Về năm hiện tại"
          hitSlop={8}
          onPress={() => changeYear(currentYear)}
          style={styles.currentYearButton}
        >
          <Text style={styles.currentYearText}>{year}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Năm sau"
          accessibilityState={{ disabled: year >= currentYear }}
          disabled={year >= currentYear}
          hitSlop={8}
          onPress={() => changeYear(year + 1)}
          style={[styles.control, year >= currentYear && styles.disabled]}
        >
          <ChevronRightIcon
            size={16}
            color={year >= currentYear ? colors.disabledText : colors.body}
          />
        </Pressable>
        </View>
      </View>
      {loading && !data ? (
        <ActivityIndicator color={colors.success} accessibilityLabel="Đang tải lịch học" />
      ) : error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thử tải lại lịch học"
          onPress={() => setReload(value => value + 1)}
          style={styles.retry}
        >
          <Text style={styles.retryText}>{error} Thử lại</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{currentStreak}</Text>
              <Text style={styles.metricLabel}>Ngày liên tiếp</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{studyDays}</Text>
              <Text style={styles.metricLabel}>Ngày đã học</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{longestStreak}</Text>
              <Text style={styles.metricLabel}>Chuỗi dài nhất</Text>
            </View>
          </View>
          <View style={styles.heatmapRow}>
            <View style={styles.weekdayLabels}>
              {['T2', '', 'T4', '', 'T6', '', 'CN'].map((label, index) => (
                <Text key={index} style={styles.weekdayLabel}>{label}</Text>
              ))}
            </View>
            <ScrollView
              ref={gridRef}
              horizontal
              style={styles.scroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              onContentSizeChange={() => {
                if (year === currentYear && scrolledYear.current !== year) {
                  scrolledYear.current = year;
                  gridRef.current?.scrollToEnd({ animated: false });
                }
              }}
              accessible
              accessibilityLabel={`Lịch học năm ${year}, ${studyDays} ngày học, chuỗi hiện tại ${currentStreak} ngày, chuỗi dài nhất ${longestStreak} ngày`}
            >
              <View>
                <View style={[styles.monthRow, { width: weeks.length * 12 - 2 }]}>
                  {weeks.map((week, index) => {
                    const first = week.find(date => date?.endsWith('-01'));
                    return first ? (
                      <Text key={first} style={[styles.monthLabel, { left: index * 12 }]}>
                        Th{Number(first.slice(5, 7))}
                      </Text>
                    ) : null;
                  })}
                </View>
                <View style={styles.grid}>
                  {weeks.map((week, index) => (
                    <View key={index} style={styles.week}>
                      {week.map((date, day) => {
                        const seconds = date
                          ? date === today
                            ? Math.max(secondsByDay.get(date) ?? 0, localTodaySeconds)
                            : secondsByDay.get(date) ?? 0
                          : 0;
                        const level = intensity(seconds, goalSeconds);
                        return (
                          <View
                            key={day}
                            style={[
                              styles.day,
                              date === null || date > today ? styles.outside : null,
                              level === 1 ? styles.levelOne : null,
                              level === 2 ? styles.levelTwo : null,
                              level === 3 ? styles.levelThree : null,
                              level === 4 ? styles.levelFour : null,
                              date === today ? styles.today : null,
                            ]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    boxShadow: shadowMd,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headingCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  heading: { ...typography.heading, color: colors.dark },
  subheading: { ...typography.caption, color: colors.muted },
  controls: { flexDirection: 'row', gap: spacing.sm },
  control: {
    width: 32,
    height: 32,
    borderRadius: radius.small,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentYearButton: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.small,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  currentYearText: { ...typography.caption, color: colors.body },
  disabled: { backgroundColor: colors.disabled },
  heatmapRow: { flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  weekdayLabels: { paddingTop: 20, gap: 2 },
  weekdayLabel: { width: 18, height: 10, fontSize: 9, lineHeight: 10, color: colors.muted },
  scroll: { flex: 1, minWidth: 0 },
  scrollContent: { paddingRight: 2 },
  monthRow: { height: 16 },
  monthLabel: { position: 'absolute', top: 0, fontSize: 10, lineHeight: 14, color: colors.muted },
  grid: { flexDirection: 'row', gap: 2, paddingVertical: spacing.xs },
  week: { gap: 2 },
  day: { width: 10, height: 10, borderRadius: 2, backgroundColor: '#E8E8E8' },
  outside: { opacity: 0 },
  levelOne: { backgroundColor: '#D3EB9A' },
  levelTwo: { backgroundColor: '#91D36C' },
  levelThree: { backgroundColor: '#51BD52' },
  levelFour: { backgroundColor: colors.success },
  today: { borderWidth: 1, borderColor: colors.dark },
  summary: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    padding: spacing.sm,
    borderRadius: radius.small,
    backgroundColor: colors.successBg,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  metricValue: { ...typography.title, color: colors.success },
  metricLabel: { ...typography.caption, color: colors.body, fontSize: 11 },
  retry: { minHeight: 48, justifyContent: 'center' },
  retryText: { ...typography.link, color: colors.primaryText },
});

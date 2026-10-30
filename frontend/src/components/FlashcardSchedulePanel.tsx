import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFlashcardStudy } from './FlashcardStudyProvider';
import { AuthButton, AuthNotice } from './AuthForm';
import { reminderSupported } from '../services/flashcardNotifications';
import { flashcardDueTime } from '../utils/flashcardDue';
import {
  colors,
  radius,
  readexFont,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';

export function FlashcardSchedulePanel({
  onReview,
  busy,
}: {
  onReview: () => void;
  busy: boolean;
}) {
  const study = useFlashcardStudy();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [reminderTime, setReminderTime] = useState('19:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const preference = study?.data?.reminder;
  const hour = preference?.hour;
  const minute = preference?.minute;
  useEffect(() => {
    if (hour !== undefined && minute !== undefined)
      setReminderTime(
        `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      );
  }, [hour, minute]);
  if (!study) return null;
  const { data } = study;
  const save = async (enabled: boolean) => {
    if (saving) return;
    const match = /^(\d{2}):(\d{2})$/.exec(reminderTime.trim());
    if (enabled && (!match || +match[1] > 23 || +match[2] > 59)) {
      setError('Nhập giờ theo dạng HH:mm, ví dụ 19:00.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await study.saveReminder({
        enabled,
        hour: enabled ? +match![1] : hour ?? 19,
        minute: enabled ? +match![2] : minute ?? 0,
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Chưa lưu được giờ nhắc.',
      );
    } finally {
      setSaving(false);
    }
  };
  const weekdays = [
    'Chủ nhật',
    'Thứ Hai',
    'Thứ Ba',
    'Thứ Tư',
    'Thứ Năm',
    'Thứ Sáu',
    'Thứ Bảy',
  ];
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.heading} accessibilityRole="header">
          Hôm nay
        </Text>
        {data ? (
          <Text style={styles.caption}>
            {data.today.slice(8)}/{data.today.slice(5, 7)}
          </Text>
        ) : null}
      </View>
      {study.error ? (
        <>
          <AuthNotice error message={study.error} />
          <AuthButton
            label="Tải lại lịch ôn"
            variant="text"
            onPress={study.reload}
          />
        </>
      ) : !data ? (
        <ActivityIndicator
          accessibilityLabel="Đang tải lịch ôn"
          color={colors.focus}
        />
      ) : null}
      {data ? (
        <>
          <View style={styles.stats}>
            <View
              style={[styles.stat, styles.dueStat]}
              accessible
              accessibilityLabel={`${data.today_count} thẻ đến hạn hôm nay`}
            >
              <Text style={styles.statLabel}>Đến hạn hôm nay</Text>
              <Text style={[styles.statValue, styles.dueValue]}>
                {data.today_count}
              </Text>
              {data.overdue_count > 0 ? (
                <Text style={styles.caption}>
                  {data.overdue_count} thẻ quá hạn
                </Text>
              ) : null}
            </View>
            <View
              style={[styles.stat, styles.doneStat]}
              accessible
              accessibilityLabel={`${
                data.reviewed_today_count ?? 0
              } thẻ đã ôn hôm nay`}
            >
              <Text style={styles.statLabel}>Đã ôn hôm nay</Text>
              <Text style={[styles.statValue, styles.doneValue]}>
                {data.reviewed_today_count ?? 0}
              </Text>
            </View>
          </View>
          {data.today_count > data.due_count ? (
            <Text style={styles.caption}>
              {data.due_count === 0 && data.next_due_at
                ? `Ôn tiếp lúc ${flashcardDueTime(data.next_due_at)}`
                : `${data.due_count} thẻ có thể ôn ngay · ${
                    data.today_count - data.due_count
                  } thẻ chưa đến giờ`}
            </Text>
          ) : null}
          {!data.scheduled_count ? (
            <Text style={styles.body}>
              Học bộ thẻ đầu tiên để bắt đầu lịch ôn.
            </Text>
          ) : null}
          <AuthButton
            label="Ôn thẻ đến hạn"
            disabled={!data.due_count || busy}
            busy={busy}
            onPress={onReview}
          />
          <View style={styles.row}>
            <Text style={styles.heading} accessibilityRole="header">
              Lịch ôn tập
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                expanded ? 'Thu gọn lịch ôn' : 'Xem lịch ôn 30 ngày'
              }
              accessibilityState={{ expanded }}
              onPress={() => setExpanded(value => !value)}
              style={styles.expand}
            >
              <Text style={styles.link}>
                {expanded ? 'Thu gọn' : '30 ngày'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.calendar}>
            <View style={styles.calendarHeader}>
              <Text style={styles.caption}>Ngày ôn</Text>
              <Text style={styles.caption}>Số thẻ</Text>
            </View>
            <ScrollView
              nestedScrollEnabled
              style={expanded ? styles.expandedCalendar : undefined}
              accessibilityLabel="Danh sách lịch ôn"
              showsVerticalScrollIndicator={expanded}
            >
              {data.days.slice(0, expanded ? 30 : 3).map((day, index) => (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.date}: ${day.count} thẻ cần ôn`}
                  accessibilityState={{ selected: selected === day.date }}
                  onPress={() => setSelected(day.date)}
                  style={[
                    styles.day,
                    index > 0 && styles.dayDivider,
                    day.date === data.today && styles.today,
                    selected === day.date && styles.selected,
                  ]}
                >
                  <View style={styles.dayIdentity}>
                    <Text
                      style={[
                        styles.dayLabel,
                        day.date === data.today && styles.todayLabel,
                      ]}
                    >
                      {day.date === data.today
                        ? 'Hôm nay'
                        : weekdays[
                            new Date(`${day.date}T00:00:00Z`).getUTCDay()
                          ]}
                    </Text>
                    <Text style={styles.caption}>
                      {day.date.slice(8)}/{day.date.slice(5, 7)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.countBadge,
                      day.count > 0 && styles.hasCards,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayCount,
                        day.count > 0 ? styles.countActive : styles.countEmpty,
                      ]}
                    >
                      {day.count}
                    </Text>
                    <Text
                      style={[
                        styles.caption,
                        day.count > 0 && styles.countActive,
                      ]}
                    >
                      thẻ
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {reminderSupported ? (
            <View style={styles.reminder}>
              <Text style={styles.heading}>Nhắc ôn</Text>
              <>
                <View style={styles.row}>
                  <TextInput
                    accessibilityLabel="Giờ nhắc ôn"
                    value={reminderTime}
                    onChangeText={setReminderTime}
                    placeholder="19:00"
                    maxLength={5}
                    editable={!saving}
                    style={styles.time}
                  />
                  <AuthButton
                    label={preference?.enabled ? 'Tắt nhắc ôn' : 'Bật nhắc ôn'}
                    variant="outline"
                    busy={saving}
                    disabled={busy}
                    onPress={() => save(!preference?.enabled)}
                  />
                  {preference?.enabled ? (
                    <AuthButton
                      label="Lưu giờ nhắc"
                      variant="text"
                      disabled={saving || busy}
                      onPress={() => save(true)}
                    />
                  ) : null}
                </View>
                <AuthNotice error message={study.notificationError} />
                {study.notificationError ? (
                  <AuthButton
                    label="Thử hẹn lại thông báo"
                    variant="text"
                    onPress={study.reload}
                  />
                ) : null}
              </>
              <AuthNotice error message={error} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.xl,
    gap: spacing.lg,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
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
  stats: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  stat: {
    flex: 1,
    minWidth: 0,
    padding: spacing.lg,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    gap: spacing.sm,
  },
  dueStat: { backgroundColor: colors.surfaceTint },
  doneStat: { backgroundColor: colors.successBg },
  statLabel: { ...typography.body, color: colors.body },
  statValue: {
    ...readexFont('600'),
    fontSize: 32,
    lineHeight: 40,
    fontVariant: ['tabular-nums'],
  },
  dueValue: { color: colors.focus },
  doneValue: { color: colors.success },
  body: { ...typography.body, color: colors.body },
  caption: { ...typography.body, color: colors.muted },
  link: { ...typography.link, color: colors.primaryText },
  expand: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  calendar: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
    overflow: 'hidden',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceTint,
  },
  expandedCalendar: { maxHeight: 240 },
  day: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  dayDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  dayIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayLabel: { ...typography.caption, color: colors.dark },
  todayLabel: { color: colors.focus },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    minWidth: 60,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  hasCards: { backgroundColor: colors.badgeBg },
  today: { backgroundColor: colors.surfaceTint },
  selected: { backgroundColor: colors.badgeBg },
  dayCount: { ...typography.label, fontVariant: ['tabular-nums'] },
  countActive: { color: colors.focus },
  countEmpty: { color: colors.muted },
  reminder: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  time: {
    ...typography.input,
    minWidth: 84,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.dark,
  },
});

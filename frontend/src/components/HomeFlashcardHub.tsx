import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthIcon } from './AuthIcon';
import { AuthButton, AuthNotice } from './AuthForm';
import { NihongoMascot } from './NihongoMascot';
import { dailyFlashcardService } from '../services/dailyFlashcardService';
import type { HomeFlashcards } from '../services/dailyFlashcardService';
import { flashcardService } from '../services/flashcardService';
import type { FlashcardSession } from '../services/flashcardService';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { useWebLayout } from '../hooks/useWebLayout';
import { studyDate } from '../utils/studyTime';
import { flashcardDueTime } from '../utils/flashcardDue';
import { useFlashcardStudy } from './FlashcardStudyProvider';
import {
  flashcardSrsService,
  subscribeFlashcardSchedule,
} from '../services/flashcardSrsService';

export function HomeFlashcardHub({
  onOpenFlashcards,
  onOpenQuiz,
}: {
  onOpenFlashcards: (session?: FlashcardSession) => void;
  onOpenQuiz: () => void;
}) {
  const load = useCallback(async () => dailyFlashcardService.home(), []);
  const study = useFlashcardStudy();
  const { state, reload } = useRemoteResource(load);
  useEffect(() => subscribeFlashcardSchedule(reload), [reload]);
  useEffect(() => {
    let date = studyDate(Date.now());
    const refresh = () => {
      date = studyDate(Date.now());
      reload();
    };
    const timer = setInterval(() => {
      if (date !== studyDate(Date.now())) refresh();
    }, 60000);
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') refresh();
    });
    if (Platform.OS === 'web') window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      listener.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', refresh);
    };
  }, [reload]);
  const { desktop } = useWebLayout();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const data: HomeFlashcards | null =
    state.status === 'ready' ? state.data : null;
  const active = data?.active_session;
  const dueCount = study?.data?.due_count ?? data?.due_count ?? 0;
  const todayCount = study?.data?.today_count ?? data?.today_count ?? dueCount;
  const nextDueAt = study?.data?.next_due_at ?? data?.next_due_at;
  const review = async () => {
    if (!data || pending.current) return;
    if (!active && !dueCount && todayCount) {
      onOpenFlashcards();
      return;
    }
    if (!active && !dueCount && !data.weak_count) {
      onOpenFlashcards();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const session = active
        ? await flashcardService.session(active.id)
        : dueCount
        ? await flashcardSrsService.dueReview()
        : await dailyFlashcardService.review();
      if (alive.current) onOpenFlashcards(session);
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không mở được phiên học. Thử lại.',
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  if (!data)
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>Ôn tập hôm nay</Text>
        {state.status === 'loading' ? (
          <ActivityIndicator
            color={colors.focus}
            accessibilityLabel="Đang tải nội dung ôn tập"
          />
        ) : (
          <>
            <AuthNotice
              error
              message={
                state.status === 'error'
                  ? state.message
                  : 'Không tải được nội dung ôn tập.'
              }
            />
            <AuthButton
              label="Tải lại nội dung ôn tập"
              variant="text"
              onPress={reload}
            />
          </>
        )}
      </View>
    );
  const quiz = data.quiz;
  return (
    <View style={[styles.grid, desktop && styles.desktopGrid]}>
      <View
        style={[styles.card, desktop && styles.desktopCard]}
        testID="home-review-card"
      >
        <Text style={styles.heading} accessibilityRole="header">
          Ôn tập hôm nay
        </Text>
        <View style={styles.scene}>
          <View style={styles.copy}>
            <Text style={styles.title}>
              {active
                ? `Bạn còn ${active.remaining} thẻ chưa học`
                : todayCount
                ? `${todayCount} thẻ đến hạn hôm nay`
                : data.weak_count
                ? `Ôn lại ${Math.min(data.weak_count, 50)} từ chưa nhớ`
                : data.learned_count
                ? 'Sẵn sàng cho bộ thẻ tiếp theo?'
                : 'Chọn bộ thẻ đầu tiên'}
            </Text>
            <Text style={styles.body}>
              {active
                ? active.title
                : dueCount
                ? `${dueCount} thẻ có thể ôn ngay.`
                : todayCount && nextDueAt
                ? `Ôn tiếp lúc ${flashcardDueTime(nextDueAt)}`
                : data.weak_count
                ? 'Từ bạn đánh dấu Chưa nhớ hoặc Mơ hồ.'
                : 'Học từ bộ có sẵn, bộ tự tạo hoặc yêu thích.'}
            </Text>
          </View>
          <NihongoMascot pose="reading" size={80} decorative />
        </View>
        <AuthNotice error message={error} />
        <View style={styles.spacer} />
        <AuthButton
          label={
            active
              ? 'Tiếp tục flashcard'
              : dueCount
              ? 'Ôn thẻ đến hạn'
              : todayCount
              ? 'Xem lịch ôn'
              : data.weak_count
              ? 'Ôn ngay'
              : 'Chọn bộ thẻ'
          }
          busy={busy}
          onPress={review}
        />
      </View>
      <View
        style={[styles.card, desktop && styles.desktopCard]}
        testID="home-quiz-card"
      >
        <View style={styles.row}>
          <Text style={styles.heading} accessibilityRole="header">
            Thử thách hôm nay
          </Text>
          {quiz || data.quiz_available ? (
            <View
              style={[styles.badge, quiz?.finished && styles.completedBadge]}
            >
              {quiz?.finished ? (
                <AuthIcon name="check" size={12} color={colors.success} />
              ) : null}
              <Text
                style={[styles.badgeText, quiz?.finished && styles.success]}
              >
                {quiz?.finished
                  ? 'Đã hoàn thành'
                  : quiz
                  ? `${quiz.answered}/${quiz.total} câu`
                  : `${data.quiz_available} câu`}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title}>
          {quiz?.finished
            ? `${quiz.correct}/${quiz.total} câu đúng`
            : quiz?.answered
            ? `Bạn đã trả lời ${quiz.answered}/${quiz.total} câu`
            : quiz || data.quiz_available
            ? 'Thử xem bạn nhớ được bao nhiêu'
            : 'Học flashcard để mở thử thách'}
        </Text>
        <Text style={styles.body}>
          {quiz || data.quiz_available
            ? 'Chọn nghĩa đúng từ các bộ thẻ gần đây. Ưu tiên những từ bạn chưa nhớ.'
            : 'Học bộ có ít nhất 4 nghĩa khác nhau. Mỗi ngày có tối đa 5 câu hỏi.'}
        </Text>
        <View style={styles.spacer} />
        <AuthButton
          label={
            quiz?.finished
              ? 'Xem kết quả thử thách'
              : quiz?.answered
              ? 'Tiếp tục thử thách'
              : 'Bắt đầu thử thách'
          }
          variant="outline"
          disabled={(!quiz && !data.quiz_available) || busy}
          onPress={onOpenQuiz}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xl },
  desktopGrid: { flexDirection: 'row', alignItems: 'stretch' },
  card: {
    minWidth: 0,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    boxShadow: shadowMd,
  },
  heading: { ...typography.heading, color: colors.dark },
  desktopCard: { flex: 1 },
  title: { ...typography.title, color: colors.dark },
  body: { ...typography.body, color: colors.body },
  scene: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  copy: { flex: 1, minWidth: 0, gap: spacing.sm },
  spacer: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.badgeBg,
  },
  badgeText: { ...typography.caption, color: colors.badgeText },
  completedBadge: { backgroundColor: colors.successBg },
  success: { color: colors.success },
});

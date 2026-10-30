import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { AuthIcon } from '../components/AuthIcon';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { dailyFlashcardService } from '../services/dailyFlashcardService';
import type { DailyQuiz } from '../services/dailyFlashcardService';
import type { FlashcardSession } from '../services/flashcardService';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';

export function DailyFlashcardQuizScreen({
  onExit,
  onReview,
}: {
  onExit: () => void;
  onReview: (session: FlashcardSession) => void;
}) {
  const insets = useSafeAreaInsets();
  const bottom = useBottomNavigationInset();
  const [quiz, setQuiz] = useState<DailyQuiz | null>(null);
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  const run = useCallback(async (task: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không tải được thử thách. Thử lại.',
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  const load = useCallback(
    () =>
      run(async () => {
        const result = await dailyFlashcardService.quiz();
        if (!alive.current) return;
        setQuiz(result);
        setIndex(
          Math.max(
            0,
            result.questions.findIndex(question => !question.answer),
          ),
        );
        setSummary(Boolean(result.finished_at));
      }),
    [run],
  );
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  const exit = useCallback(() => {
    if (!pending.current) onExit();
  }, [onExit]);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      exit();
      return true;
    });
    return () => handler.remove();
  }, [exit]);
  const question = quiz?.questions[index];
  const answer = question?.answer;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: bottom + spacing.section,
        },
      ]}
    >
      <ScreenBackHeader
        title="Thử thách hôm nay"
        backLabel="Quay lại trang chủ"
        onBack={exit}
      />
      <AuthNotice error message={error} />
      {error ? (
        <AuthButton
          label="Tải lại thử thách"
          variant="text"
          busy={busy}
          onPress={load}
        />
      ) : null}
      {!quiz && busy ? (
        <ActivityIndicator
          accessibilityLabel="Đang tải thử thách"
          color={colors.focus}
        />
      ) : null}
      {quiz ? (
        <>
          <Text style={styles.caption}>
            Ngày {quiz.date.split('-').reverse().join('/')} · {quiz.total} câu
            hỏi
          </Text>
          {summary ? (
            <>
              <View style={styles.card}>
                <Text style={styles.title} accessibilityRole="header">
                  Kết quả thử thách
                </Text>
                <View style={styles.result}>
                  <Text style={styles.score}>
                    {quiz.correct}/{quiz.total} câu đúng
                  </Text>
                </View>
                <Text style={styles.body}>
                  {quiz.correct === quiz.total
                    ? 'Bạn đã trả lời đúng tất cả. Hẹn gặp lại ở thử thách ngày mai!'
                    : 'Gặp lại những từ trả lời sai bằng một lượt flashcard ngắn nhé.'}
                </Text>
              </View>
              {quiz.questions.map(item => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.heading}>{item.front}</Text>
                    <Text
                      style={[
                        styles.caption,
                        item.answer?.correct ? styles.success : styles.danger,
                      ]}
                    >
                      {item.answer?.correct ? 'Đúng' : 'Chưa đúng'}
                    </Text>
                  </View>
                  {item.answer?.reading ? (
                    <Text style={styles.caption}>{item.answer.reading}</Text>
                  ) : null}
                  <Text style={styles.body}>{item.answer?.meaning}</Text>
                </View>
              ))}
              {quiz.correct < quiz.total ? (
                <AuthButton
                  label="Ôn câu sai bằng flashcard"
                  busy={busy}
                  onPress={() =>
                    run(async () => {
                      const session = await dailyFlashcardService.review(
                        'quiz',
                        quiz.id,
                      );
                      if (alive.current) onReview(session);
                    })
                  }
                />
              ) : null}
              <AuthButton
                label="Về trang chủ"
                variant="outline"
                disabled={busy}
                onPress={exit}
              />
            </>
          ) : question ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>
                  Câu {index + 1}/{quiz.total}
                </Text>
                <Text style={styles.caption}>
                  {quiz.answered} câu đã trả lời
                </Text>
              </View>
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityLabel="Tiến độ thử thách"
                accessibilityValue={{
                  min: 0,
                  max: quiz.total,
                  now: quiz.answered,
                }}
              >
                <View
                  style={[
                    styles.bar,
                    { width: `${(quiz.answered / quiz.total) * 100}%` },
                  ]}
                />
              </View>
              <View style={styles.card}>
                <Text style={styles.caption}>Chọn nghĩa đúng</Text>
                <Text style={styles.word}>{question.front}</Text>
                {question.options.map((option, optionIndex) => {
                  const correct = answer?.correct_id === option.id;
                  const wrong =
                    answer &&
                    !answer.correct &&
                    answer.selected_id === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${String.fromCharCode(
                        65 + optionIndex,
                      )}. ${option.text}${
                        answer && correct
                          ? '. Đáp án đúng'
                          : wrong
                          ? '. Bạn đã chọn sai'
                          : ''
                      }`}
                      accessibilityState={{
                        disabled: busy || Boolean(answer),
                        selected: answer?.selected_id === option.id,
                      }}
                      disabled={busy || Boolean(answer)}
                      onPress={() =>
                        run(async () => {
                          const result = await dailyFlashcardService.answer(
                            quiz.id,
                            question.id,
                            option.id,
                          );
                          if (alive.current) setQuiz(result);
                        })
                      }
                      style={({ pressed }) => [
                        styles.option,
                        pressed && styles.optionPressed,
                        correct && styles.correctOption,
                        wrong && styles.wrongOption,
                      ]}
                    >
                      <Text style={styles.optionLetter}>
                        {String.fromCharCode(65 + optionIndex)}
                      </Text>
                      <Text
                        style={[
                          styles.optionText,
                          correct && styles.success,
                          wrong && styles.danger,
                        ]}
                      >
                        {option.text}
                      </Text>
                      {correct ? (
                        <AuthIcon
                          name="check"
                          size={18}
                          color={colors.success}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
                {busy ? (
                  <ActivityIndicator
                    accessibilityLabel="Đang lưu đáp án"
                    color={colors.focus}
                  />
                ) : null}
                {answer ? (
                  <View
                    style={styles.feedback}
                    accessibilityLiveRegion="polite"
                  >
                    <Text
                      style={[
                        styles.label,
                        answer.correct ? styles.success : styles.danger,
                      ]}
                    >
                      {answer.correct
                        ? 'Chính xác!'
                        : 'Chưa đúng. Hãy ghi nhớ nghĩa này nhé.'}
                    </Text>
                    {answer.reading ? (
                      <Text style={styles.caption}>{answer.reading}</Text>
                    ) : null}
                    <Text style={styles.body}>{answer.meaning}</Text>
                  </View>
                ) : null}
              </View>
              {answer ? (
                <AuthButton
                  label={quiz.finished_at ? 'Xem kết quả' : 'Câu tiếp theo'}
                  onPress={() => {
                    if (quiz.finished_at) setSummary(true);
                    else setIndex(value => value + 1);
                  }}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: spacing.lg,
  },
  card: {
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
  title: { ...typography.title, color: colors.dark },
  heading: { ...typography.heading, color: colors.dark },
  label: { ...typography.label, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  body: { ...typography.body, color: colors.body },
  word: {
    ...typography.title,
    color: colors.dark,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  option: {
    minHeight: layout.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  optionPressed: {
    backgroundColor: colors.surfaceTint,
    borderColor: colors.focus,
  },
  correctOption: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  wrongOption: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  optionLetter: { ...typography.caption, color: colors.muted },
  optionText: { ...typography.label, color: colors.body, flex: 1, minWidth: 0 },
  feedback: { gap: spacing.sm },
  success: { color: colors.success },
  danger: { color: colors.danger },
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.track,
  },
  bar: { height: '100%', backgroundColor: colors.primary },
  result: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.badgeBg,
  },
  score: { ...typography.title, color: colors.badgeText },
});

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import {
  ReadingGrade,
  ReadingQuizData,
  ReadingSubmission,
  readingService,
} from '../services/readingService';
import { colors, radius, shadowSm, spacing, typography } from '../theme/theme';
import { AuthButton, AuthNotice } from './AuthForm';
import { ReadingAnswerExplanation } from './ReadingAnswerExplanation';
import type { ReadingAnchor } from '../services/readingService';

// Correlation only; the backend checks account ownership and grades all answers.
function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value % 4) + 8).toString(16);
  });
}

export function ReadingQuiz({
  passageId,
  quiz,
  onGraded,
  onFocusEvidence,
}: {
  passageId: string;
  quiz: ReadingQuizData;
  onGraded?: () => void;
  onFocusEvidence?: (anchor: ReadingAnchor) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ReadingGrade | null>(quiz.last_attempt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const pending = useRef<ReadingSubmission | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (!quiz.questions.length) return null;
  const answered = quiz.questions.filter(
    question => answers[question.id] !== undefined,
  ).length;
  const submit = async () => {
    if (sending.current || result || answered !== quiz.questions.length) return;
    sending.current = true;
    setBusy(true);
    setError('');
    const submission = pending.current ?? {
      request_id: requestId(),
      version: quiz.version,
      answers: { ...answers },
    };
    pending.current = submission;
    try {
      const grade = await readingService.submit(passageId, submission);
      if (mounted.current) {
        setResult(grade);
        onGraded?.();
      }
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View style={styles.section} testID="reading-quiz">
      <View style={styles.header}>
        <Text style={styles.caption}>
          {result
            ? `${result.correct}/${result.total} câu đúng`
            : `${answered}/${quiz.questions.length} câu đã trả lời`}
        </Text>
      </View>
      {result ? (
        <View style={styles.summary} accessibilityLiveRegion="polite">
          <Text accessibilityRole="header" style={styles.score}>
            Điểm: {result.score}/100
          </Text>
          <AuthButton
            label="Làm lại"
            variant="outline"
            onPress={() => {
              setResult(null);
              setAnswers({});
              setError('');
              pending.current = null;
            }}
          />
        </View>
      ) : null}
      {quiz.questions.map((question, index) => {
        const graded = result?.results.find(item => item.id === question.id);
        const selected = graded ? graded.selected_index : answers[question.id];
        return (
          <View key={question.id} style={styles.question}>
            <View style={styles.header}>
              <Text style={styles.label}>Câu {index + 1}</Text>
              {graded ? (
                <Text
                  style={[
                    styles.label,
                    graded.correct ? styles.correctText : styles.wrongText,
                  ]}
                >
                  {graded.correct ? '✓ Đúng' : '✕ Sai'}
                </Text>
              ) : null}
            </View>
            <Text selectable style={styles.questionText}>
              {question.text}
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={`Câu ${index + 1}`}
              style={styles.options}
            >
              {question.options.map((option, optionIndex) => {
                const optionKey = `${question.id}:${optionIndex}`;
                const chosen = selected === optionIndex;
                const correct = graded?.correct_index === optionIndex;
                const wrong = Boolean(graded && chosen && !correct);
                return (
                  <Pressable
                    key={optionIndex}
                    accessibilityRole="radio"
                    aria-checked={chosen}
                    accessibilityLabel={`Câu ${
                      index + 1
                    }, ${String.fromCharCode(65 + optionIndex)}: ${option}`}
                    accessibilityState={{
                      checked: chosen,
                      disabled: busy || Boolean(result),
                    }}
                    disabled={busy || Boolean(result)}
                    onFocus={() => setFocused(optionKey)}
                    onBlur={() => setFocused(null)}
                    onPress={() => {
                      setAnswers(current => ({
                        ...current,
                        [question.id]: optionIndex,
                      }));
                      pending.current = null;
                      setError('');
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      chosen && styles.selected,
                      correct && styles.correctOption,
                      wrong && styles.wrongOption,
                      focused === optionKey && styles.focused,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.optionLetter}>
                      {String.fromCharCode(65 + optionIndex)}
                    </Text>
                    <View style={styles.optionBody}>
                      <Text style={styles.optionText}>{option}</Text>
                      {correct || wrong ? (
                        <Text
                          style={[
                            styles.caption,
                            correct ? styles.correctText : styles.wrongText,
                          ]}
                        >
                          {correct
                            ? chosen
                              ? 'Đáp án đúng · Bạn đã chọn'
                              : 'Đáp án đúng'
                            : 'Bạn đã chọn'}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {graded && result && onFocusEvidence ? (
              <ReadingAnswerExplanation
                key={result.id + question.id}
                passageId={passageId}
                questionId={question.id}
                attemptId={result.id}
                onFocus={onFocusEvidence}
              />
            ) : null}
          </View>
        );
      })}
      {error ? <AuthNotice error message={error} /> : null}
      {!result ? (
        <AuthButton
          label={error ? 'Nộp lại bài' : 'Nộp bài'}
          busy={busy}
          disabled={answered !== quiz.questions.length}
          onPress={submit}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  section: {
    padding: 20,
    gap: spacing.xl,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadowSm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heading: { ...typography.heading, color: colors.dark },
  label: { ...typography.label, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  question: { gap: spacing.md },
  questionText: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 28,
    color: colors.dark,
  },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
  },
  optionLetter: { ...typography.label, color: colors.muted, width: 20 },
  optionBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  optionText: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 26,
    color: colors.dark,
  },
  selected: { backgroundColor: colors.badgeBg, borderColor: colors.primary },
  correctOption: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  wrongOption: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  correctText: { color: colors.success },
  wrongText: { color: colors.danger },
  focused: {
    outlineColor: colors.focus,
    outlineWidth: 2,
    outlineStyle: 'solid',
  },
  pressed: { opacity: 0.8 },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
  },
  score: { ...typography.heading, color: colors.focus },
});

import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from './AuthForm';
import { useShadowingQuiz } from '../hooks/useShadowingQuiz';
import type {
  ShadowingQuizLevel,
  ShadowingQuestion,
} from '../services/shadowingService';
import { colors, radius, spacing, typography } from '../theme/theme';
import { videoTimestamp } from './VideoExampleCard';
import { XIcon, ChevronDownIcon } from './icons';

export function ShadowingQuiz({
  quiz,
  maxCount,
  onStarted,
}: {
  quiz: ReturnType<typeof useShadowingQuiz>;
  maxCount: number;
  onStarted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const count = Math.min(quiz.count, maxCount);
  const question = quiz.activeQuestion;
  const answered = quiz.choice !== null;
  return (
    <>
      <Modal
        visible={quiz.setupOpen}
        transparent
        animationType="fade"
        onRequestClose={quiz.closeSetup}
      >
        <View style={styles.backdrop}>
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.header}>
              <Text style={styles.heading}>Câu hỏi AI</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng câu hỏi AI"
                onPress={quiz.closeSetup}
                style={styles.close}
              >
                <XIcon size={22} color={colors.body} />
              </Pressable>
            </View>
            {quiz.questions.length ? (
              <View style={styles.feedback}>
                <Text style={styles.label}>
                  Các mốc câu hỏi · {quiz.generatedLevel}
                </Text>
                <Text style={styles.body}>
                  Bấm để tua tới cuối đoạn nội dung liên quan và trả lời ngay.
                </Text>
                {quiz.questions.map((item, index) => {
                  const completed = quiz.completed.includes(item.id);
                  if (completed)
                    return (
                      <AnsweredQuestionCard
                        key={item.id}
                        question={item}
                        index={index}
                        answer={quiz.answers[item.id]}
                        onReview={() => quiz.reviewQuestion(item.id)}
                      />
                    );
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Tới câu hỏi ${index + 1}`}
                      accessibilityHint={`Tua tới ${videoTimestamp(
                        item.trigger_seconds,
                      )}`}
                      accessibilityState={{ disabled: quiz.loading }}
                      disabled={quiz.loading}
                      onPress={() => quiz.jumpToQuestion(item.id)}
                      style={styles.option}
                    >
                      <Text style={styles.label}>
                        Câu {index + 1} · {videoTimestamp(item.trigger_seconds)}
                      </Text>
                      <Text style={styles.body}>Tới câu hỏi →</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <Text style={styles.body}>
              Chọn số câu trắc nghiệm về những ý chính. Video sẽ dừng sau phần
              nội dung liên quan để bạn trả lời và xem giải thích.
            </Text>
            <Text style={styles.label}>Trình độ câu hỏi tiếng Nhật</Text>
            <View style={styles.counts}>
              {(['N5', 'N4', 'N3', 'N2', 'N1'] as ShadowingQuizLevel[]).map(
                value => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={`Trình độ ${value}`}
                    accessibilityState={{
                      checked: quiz.level === value,
                      disabled: quiz.loading,
                    }}
                    disabled={quiz.loading}
                    onPress={() => quiz.setLevel(value)}
                    style={[
                      styles.count,
                      quiz.level === value && styles.selected,
                    ]}
                  >
                    <Text style={styles.label}>{value}</Text>
                  </Pressable>
                ),
              )}
            </View>
            <Text style={styles.body}>
              Tạo xong sẽ xem lại từ đầu để gặp đủ câu hỏi. Câu hỏi chỉ dùng
              trong lượt xem này. Câu đã trả lời được giữ để xem lại cho đến khi
              rời bài.
            </Text>
            <Text style={styles.label}>Số câu hỏi: {count}</Text>
            <View style={styles.counts}>
              {Array.from({ length: maxCount }, (_, index) => index + 1).map(
                value => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={`${value} câu hỏi`}
                    accessibilityState={{
                      checked: count === value,
                      disabled: quiz.loading,
                    }}
                    disabled={quiz.loading}
                    onPress={() => quiz.setCount(value)}
                    style={[styles.count, count === value && styles.selected]}
                  >
                    <Text style={styles.label}>{value}</Text>
                  </Pressable>
                ),
              )}
            </View>
            <AuthNotice error message={quiz.error} />
            <AuthButton
              label="Tạo câu hỏi"
              busy={quiz.loading}
              disabled={maxCount === 0}
              onPress={() => quiz.generate(count, onStarted)}
            />
          </ScrollView>
        </View>
      </Modal>
      <Modal
        visible={Boolean(question)}
        transparent
        animationType="fade"
        onRequestClose={quiz.stop}
      >
        <View style={styles.backdrop}>
          {question ? (
            <ScrollView
              style={styles.sheet}
              contentContainerStyle={[
                styles.content,
                { paddingBottom: insets.bottom + spacing.xl },
              ]}
              accessibilityViewIsModal
            >
              <View style={styles.header}>
                <Text style={styles.heading}>
                  Câu{' '}
                  {quiz.questions.findIndex(item => item.id === question.id) +
                    1}
                  /{quiz.questions.length}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đóng câu hỏi"
                  onPress={quiz.stop}
                  style={styles.close}
                >
                  <XIcon size={22} color={colors.body} />
                </Pressable>
              </View>
              <Text style={styles.body}>{question.question}</Text>
              {question.choices.map((option, index) => (
                <Pressable
                  key={index}
                  accessibilityRole="radio"
                  accessibilityLabel={`Đáp án ${String.fromCharCode(
                    65 + index,
                  )}: ${option}`}
                  accessibilityState={{
                    checked: quiz.choice === index,
                    disabled: answered,
                  }}
                  disabled={answered}
                  onPress={() => quiz.answer(index)}
                  style={[
                    styles.option,
                    quiz.choice === index && styles.selected,
                    answered &&
                      index === question.correct_index &&
                      styles.correct,
                  ]}
                >
                  <Text style={styles.body}>
                    {String.fromCharCode(65 + index)}. {option}
                  </Text>
                </Pressable>
              ))}
              {answered ? (
                <View accessibilityLiveRegion="polite" style={styles.feedback}>
                  <Text style={styles.label}>
                    {quiz.choice === question.correct_index
                      ? 'Chính xác!'
                      : 'Chưa đúng.'}
                  </Text>
                  <Text style={styles.body}>
                    Đáp án đúng:{' '}
                    {String.fromCharCode(65 + question.correct_index)}.{' '}
                    {question.choices[question.correct_index]}
                  </Text>
                  <Text style={styles.body}>{question.explanation}</Text>
                  <Text style={styles.label}>
                    Đã đúng {quiz.score}/{quiz.completed.length} câu
                  </Text>
                </View>
              ) : null}
              <AuthButton
                label="Xem tiếp"
                disabled={!answered}
                onPress={quiz.continueVideo}
              />
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

function AnsweredQuestionCard({
  question,
  index,
  answer,
  onReview,
}: {
  question: ShadowingQuestion;
  index: number;
  answer: number;
  onReview: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.option}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Xem lại câu hỏi ${index + 1}`}
        accessibilityState={{ expanded, disabled: false }}
        onPress={() => setExpanded(value => !value)}
        style={styles.header}
      >
        <View>
          <Text style={styles.label}>
            Câu {index + 1} · {videoTimestamp(question.trigger_seconds)}
          </Text>
          <Text style={styles.body}>
            Đã trả lời · {expanded ? 'Thu gọn' : 'Xem lại'}
          </Text>
        </View>
        <View style={expanded ? styles.chevronExpanded : undefined}>
          <ChevronDownIcon size={20} color={colors.body} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.result}>
          <Text style={styles.body}>{question.question}</Text>
          {question.choices.map((option, optionIndex) => (
            <Text key={optionIndex} style={styles.body}>
              {String.fromCharCode(65 + optionIndex)}. {option}
            </Text>
          ))}
          <Text style={styles.label}>
            Bạn chọn: {String.fromCharCode(65 + answer)}.{' '}
            {question.choices[answer]} ·{' '}
            {answer === question.correct_index ? 'Đúng' : 'Chưa đúng'}
          </Text>
          <Text style={styles.body}>
            Đáp án đúng: {String.fromCharCode(65 + question.correct_index)}.{' '}
            {question.choices[question.correct_index]}
          </Text>
          <Text style={styles.body}>{question.explanation}</Text>
          <AuthButton
            label={`Xem lại câu ${index + 1}`}
            variant="text"
            onPress={onReview}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  result: { gap: spacing.sm, paddingTop: spacing.md },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    flexGrow: 0,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
  },
  content: { padding: spacing.xl, gap: spacing.md },
  heading: { ...typography.heading, color: colors.dark },
  body: { ...typography.body, color: colors.body },
  label: { ...typography.label, color: colors.primaryText },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  count: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
  },
  selected: {
    backgroundColor: colors.surfaceTint,
    borderColor: colors.primary,
  },
  option: {
    padding: spacing.md,
    minHeight: 48,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  correct: { borderColor: colors.success },
  feedback: { gap: spacing.sm },
});

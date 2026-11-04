import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckIcon } from './icons';
import { useWebLayout } from '../hooks/useWebLayout';
import type { ShadowingToken } from '../services/shadowingService';
import { colors, radius, spacing, typography } from '../theme/theme';

export function normalizeDictation(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[\p{P}\p{Z}\s]/gu, '')
    .toLowerCase();
}

export type DictationGap = { before: string; hidden: string; after: string };
export type DictationAnswer = { value: string; correct: boolean | null };
const wordPattern =
  /[\p{Script=Han}々]+[\p{Script=Hiragana}]*|[\p{Script=Katakana}ー]+|[\p{Script=Hiragana}]{1,4}|[A-Za-z0-9]+|./gu;

// Reuse the lesson's word boundaries when available; no AI request is needed.
export function createDictationGap(
  text: string,
  tokens?: ShadowingToken[],
  random = Math.random,
): DictationGap | null {
  const candidates: { start: number; text: string }[] = [];
  if (tokens?.map(token => token.text).join('') === text) {
    let start = 0;
    for (const token of tokens) {
      if (token.key && /[\p{L}\p{N}]/u.test(token.text))
        candidates.push({ start, text: token.text });
      start += token.text.length;
    }
  }
  if (!candidates.length) {
    for (const match of text.matchAll(wordPattern)) {
      if (/[\p{L}\p{N}]/u.test(match[0]))
        candidates.push({ start: match.index!, text: match[0] });
    }
  }
  if (!candidates.length) return null;
  const words = candidates.filter(item => Array.from(item.text).length > 1);
  const pool = words.length ? words : candidates;
  const selected =
    pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return {
    before: text.slice(0, selected.start),
    hidden: selected.text,
    after: text.slice(selected.start + selected.text.length),
  };
}

export function ShadowingDictation({
  gap,
  answer,
  position,
  onChange,
  onFocus,
  onBlur,
  prominent = false,
}: {
  gap: DictationGap;
  answer: DictationAnswer;
  position: number;
  onChange: (value: DictationAnswer) => void;
  onFocus: () => void;
  onBlur?: () => void;
  prominent?: boolean;
}) {
  const { desktop } = useWebLayout();
  const canCheck =
    Boolean(normalizeDictation(answer.value)) && answer.correct !== true;
  const check = () => {
    if (normalizeDictation(answer.value))
      onChange({
        ...answer,
        correct:
          normalizeDictation(answer.value) === normalizeDictation(gap.hidden),
      });
  };
  return (
    <View style={styles.content}>
      <View style={[styles.sentence, prominent && styles.prominentSentence]}>
        {(gap.before.match(wordPattern) ?? []).map((part, index) => (
          <Text
            key={`before-${index}`}
            style={[
              styles.text,
              prominent && styles.prominentText,
              prominent && !desktop && styles.mobileProminentText,
            ]}
          >
            {part}
          </Text>
        ))}
        <TextInput
          accessibilityLabel={
            prominent
              ? 'Từ còn thiếu câu đang phát'
              : `Từ còn thiếu câu ${position + 1}`
          }
          accessibilityHint={
            desktop
              ? 'Nghe rồi điền từ còn thiếu. Nhấn Enter để kiểm tra.'
              : 'Nghe rồi điền từ còn thiếu, sau đó bấm Kiểm tra.'
          }
          placeholder="…"
          value={answer.value}
          onChangeText={value => onChange({ value, correct: null })}
          onSubmitEditing={check}
          onFocus={onFocus}
          onBlur={onBlur}
          submitBehavior="submit"
          returnKeyType="done"
          autoCorrect={false}
          autoCapitalize="none"
          style={[
            styles.input,
            prominent && styles.prominentInput,
            prominent && !desktop && styles.mobileProminentText,
            {
              width: Math.min(
                180,
                Math.max(
                  prominent ? 110 : 80,
                  Array.from(answer.value).length * (prominent ? 24 : 16) + 24,
                ),
              ),
            },
            answer.correct !== null &&
              (answer.correct ? styles.correct : styles.incorrect),
          ]}
        />
        {(gap.after.match(wordPattern) ?? []).map((part, index) => (
          <Text
            key={`after-${index}`}
            style={[
              styles.text,
              prominent && styles.prominentText,
              prominent && !desktop && styles.mobileProminentText,
            ]}
          >
            {part}
          </Text>
        ))}
      </View>
      {!desktop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            prominent
              ? 'Kiểm tra câu đang phát'
              : `Kiểm tra câu ${position + 1}`
          }
          accessibilityState={{ disabled: !canCheck }}
          disabled={!canCheck}
          hitSlop={6}
          onPress={check}
          style={({ pressed }) => [
            styles.checkButton,
            !canCheck && styles.checkDisabled,
            pressed && canCheck && styles.checkPressed,
          ]}
        >
          <CheckIcon
            size={14}
            color={canCheck ? colors.onPrimary : colors.disabledText}
          />
          <Text style={[styles.checkLabel, !canCheck && styles.disabledLabel]}>
            Kiểm tra
          </Text>
        </Pressable>
      ) : null}
      {answer.correct !== null ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.result,
            { color: answer.correct ? colors.success : colors.danger },
          ]}
        >
          {answer.correct ? '✓ Đúng' : `✗ Chưa đúng · Đáp án: ${gap.hidden}`}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  checkButton: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  checkLabel: {
    ...typography.label,
    fontSize: 11,
    lineHeight: 16,
    color: colors.onPrimary,
  },
  checkDisabled: { backgroundColor: colors.disabled },
  checkPressed: { backgroundColor: colors.primaryPressed },
  disabledLabel: { color: colors.disabledText },
  prominentSentence: { justifyContent: 'center', columnGap: spacing.xs },
  prominentText: { fontSize: 22, lineHeight: 34 },
  mobileProminentText: { fontSize: 18, lineHeight: 28 },
  prominentInput: { fontSize: 22, minHeight: 44 },
  content: { gap: spacing.xs },
  sentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.xs,
  },
  text: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 24,
    color: colors.body,
  },
  input: {
    ...typography.body,
    fontSize: 14,
    color: colors.body,
    borderBottomWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.small / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginHorizontal: 3,
    backgroundColor: colors.surfaceTint,
    minHeight: 36,
  },
  correct: {
    borderColor: colors.success,
    backgroundColor: colors.successBg,
    color: colors.success,
  },
  incorrect: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
    color: colors.danger,
  },
  result: { ...typography.caption },
});

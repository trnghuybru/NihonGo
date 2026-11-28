import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ExamExplanation,
  ExamQuestion,
  ExamReview,
  jlptService,
} from '../services/jlptService';
import type { ShadowingLookupWord } from '../services/shadowingService';
import { colors, spacing, typography } from '../theme/theme';
import { AuthButton, AuthNotice } from './AuthForm';
import { NihongoMascot } from './NihongoMascot';
import { ShadowingWordPopup } from './ShadowingWordLookup';
import { XIcon } from './icons';

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Momo chưa giải thích được. Hãy thử lại.';
export function useJlptReview(
  examId: string,
  question: ExamQuestion,
  token?: string,
) {
  const [review, setReview] = useState<{ id: string; data: ExamReview } | null>(
    null,
  );
  const [reviewError, setReviewError] = useState('');
  const [reload, setReload] = useState(0);
  const [word, setWord] = useState<ShadowingLookupWord | null>(null);
  const [anchorY, setAnchorY] = useState(0);
  const [option, setOption] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<ExamExplanation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current += 1;
  }, []);
  const cache = useRef(new Map<string, ExamExplanation>());
  useEffect(() => {
    let live = true;
    invalidate();
    setReview(null);
    setReviewError('');
    setWord(null);
    setOption(null);
    setExplanation(null);
    setError('');
    setBusy(false);
    if (token)
      jlptService
        .review(examId, question.id, token)
        .then(data => {
          if (live) setReview({ id: question.id, data });
        })
        .catch(failure => {
          if (live) setReviewError(errorText(failure));
        });
    return () => {
      live = false;
      invalidate();
    };
  }, [examId, question.id, token, reload, invalidate]);
  const data = token && review?.id === question.id ? review.data : null;
  const explain = async (index: number) => {
    if (!token) return;
    const request = ++generation.current;
    setOption(index);
    setError('');
    setExplanation(null);
    const key = `${examId}:${question.id}:${index}`;
    const existing = cache.current.get(key);
    if (existing) {
      setExplanation(existing);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const result = await jlptService.explain(
        examId,
        question.id,
        token,
        index,
      );
      if (generation.current === request) {
        cache.current.set(key, result);
        setExplanation(result);
      }
    } catch (failure) {
      if (generation.current === request) setError(errorText(failure));
    } finally {
      if (generation.current === request) setBusy(false);
    }
  };
  const close = () => {
    generation.current++;
    setOption(null);
    setBusy(false);
  };
  return {
    data,
    onWordPress: (key: string, y: number) => {
      if (data?.words[key]) {
        setAnchorY(y);
        setWord(data.words[key]);
      }
    },
    explain,
    controls: reviewError ? (
      <View style={styles.gap}>
        <AuthNotice message={reviewError} error />
        <AuthButton
          label="Thử lại tra từ"
          onPress={() => setReload(value => value + 1)}
          variant="text"
          size="compact"
        />
      </View>
    ) : null,
    popup: (
      <>
        <ShadowingWordPopup
          word={word}
          anchorY={anchorY}
          onClose={() => setWord(null)}
        />
        {token && option !== null ? (
          <Modal transparent animationType="fade" onRequestClose={close}>
            <View style={styles.overlay}>
              <View style={styles.panel} accessibilityViewIsModal>
                <View style={styles.header}>
                  <NihongoMascot pose="wave" size={44} decorative />
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" style={styles.heading}>
                      Momo giải thích
                    </Text>
                    <Text style={styles.caption}>Đáp án {option + 1}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đóng giải thích Momo"
                    onPress={close}
                    style={styles.close}
                  >
                    <XIcon size={20} color={colors.dark} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.content}>
                  <Text style={styles.quote}>{question.options[option]}</Text>
                  {busy ? (
                    <ActivityIndicator color={colors.primaryText} />
                  ) : null}
                  <AuthNotice message={error} error />
                  {error ? (
                    <AuthButton
                      label="Nhờ Momo thử lại"
                      onPress={() => explain(option)}
                      variant="outline"
                      size="compact"
                    />
                  ) : null}
                  {explanation ? (
                    <>
                      <Text selectable style={styles.body}>
                        {explanation.explanation}
                      </Text>
                      {explanation.grammar.map((item, index) => (
                        <View key={index} style={styles.grammar}>
                          <Text style={styles.heading}>{item.pattern}</Text>
                          <Text selectable style={styles.body}>
                            {item.meaning}
                          </Text>
                          <Text selectable style={styles.quote}>
                            {item.source_quote}
                          </Text>
                          <Text selectable style={styles.body}>
                            {item.example}
                          </Text>
                          <Text selectable style={styles.caption}>
                            {item.translation}
                          </Text>
                        </View>
                      ))}
                      {explanation.caution ? (
                        <AuthNotice message={explanation.caution} />
                      ) : null}
                    </>
                  ) : null}
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : null}
      </>
    ),
  };
}
const styles = StyleSheet.create({
  gap: { gap: 12 },
  flex: { flex: 1, gap: 4 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(21,53,73,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 24, gap: 20 },
  heading: { ...typography.heading, color: colors.dark, fontSize: 17 },
  caption: { ...typography.caption, color: colors.muted, lineHeight: 22 },
  body: { ...typography.body, color: colors.body, lineHeight: 25 },
  quote: {
    fontSize: 17,
    lineHeight: 29,
    color: colors.dark,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  grammar: {
    gap: 10,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
});

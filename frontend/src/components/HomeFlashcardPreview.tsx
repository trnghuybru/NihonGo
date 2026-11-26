import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthButton } from './AuthForm';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { flashcardService } from '../services/flashcardService';
import type { Flashcard } from '../services/flashcardService';
import { colors, radius, shadowSm, spacing, typography } from '../theme/theme';

/** Read-only preview: never starts a session or records a review grade. */
export function HomeFlashcardPreview({
  sessionId,
  remaining,
}: {
  sessionId: string;
  remaining: number;
}) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setCards([]);
    setIndex(0);
    setFlipped(false);
    setStatus('loading');
    flashcardService
      .session(sessionId)
      .then(session => {
        if (!current) return;
        setCards(
          (session.cards || []).filter(
            card =>
              !Object.prototype.hasOwnProperty.call(
                session.ratings || {},
                card.id,
              ),
          ),
        );
        setStatus('ready');
      })
      .catch(() => {
        if (current) setStatus('error');
      });
    return () => {
      current = false;
    };
  }, [sessionId, remaining, retry]);
  const card = cards[index];
  const change = (next: number) => {
    setIndex(next);
    setFlipped(false);
  };
  return (
    <View style={s.area} testID="home-flashcard-preview">
      {status === 'loading' ? (
        <ActivityIndicator
          color={colors.focus}
          accessibilityLabel="Đang tải thẻ xem trước"
        />
      ) : status === 'error' ? (
        <View style={s.empty}>
          <Text style={s.hint}>Chưa tải được thẻ xem trước.</Text>
          <AuthButton
            label="Tải lại thẻ xem trước"
            variant="text"
            onPress={() => setRetry(value => value + 1)}
          />
        </View>
      ) : card ? (
        <View style={s.preview}>
          <View style={s.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Thẻ trước"
              accessibilityState={{ disabled: index === 0 }}
              disabled={index === 0}
              onPress={() => change(index - 1)}
              style={({ pressed }) => [
                s.arrow,
                index === 0 && s.disabled,
                pressed && s.pressed,
              ]}
            >
              <ChevronLeftIcon size={22} color={colors.focus} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                flipped ? 'Lật về mặt từ vựng' : 'Lật thẻ xem nghĩa'
              }
              accessibilityHint="Chỉ xem trước, không thay đổi tiến độ học"
              onPress={() => setFlipped(value => !value)}
              style={({ pressed }) => [s.card, pressed && s.pressed]}
            >
              <View style={s.content}>
                <Text
                  style={flipped ? s.meaning : s.word}
                  testID={
                    flipped ? 'home-preview-meaning' : 'home-preview-word'
                  }
                >
                  {flipped ? card.back : card.front}
                </Text>
                {flipped && card.reading ? (
                  <Text style={s.reading}>{card.reading}</Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Thẻ tiếp"
              accessibilityState={{ disabled: index === cards.length - 1 }}
              disabled={index === cards.length - 1}
              onPress={() => change(index + 1)}
              style={({ pressed }) => [
                s.arrow,
                index === cards.length - 1 && s.disabled,
                pressed && s.pressed,
              ]}
            >
              <ChevronRightIcon size={22} color={colors.focus} />
            </Pressable>
          </View>
          <Text style={s.caption} accessibilityLiveRegion="polite">
            {index + 1}/{cards.length}
          </Text>
        </View>
      ) : (
        <Text style={s.hint}>Bạn đã xem hết các thẻ trong phiên này.</Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  area: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  preview: { width: '100%', maxWidth: 480, gap: spacing.xs },
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTint,
    boxShadow: shadowSm,
    alignItems: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  word: {
    ...typography.title,
    fontSize: 28,
    lineHeight: 38,
    color: colors.dark,
    textAlign: 'center',
  },
  meaning: { ...typography.heading, color: colors.dark, textAlign: 'center' },
  reading: { ...typography.body, color: colors.body, textAlign: 'center' },
  caption: { ...typography.caption, color: colors.focus, textAlign: 'center' },
  hint: { ...typography.body, color: colors.muted, textAlign: 'center' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  empty: { alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.8 },
});

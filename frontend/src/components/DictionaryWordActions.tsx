import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthButton, AuthNotice } from './AuthForm';
import { FavoriteWordButton } from './FavoriteWordButton';
import Svg, { Circle, Path } from 'react-native-svg';
import { flashcardService } from '../services/flashcardService';
import type { FlashcardDeck } from '../services/flashcardService';
import { colors, radius, spacing, typography } from '../theme/theme';

export function DictionaryWordActions({
  id,
  word,
  heading,
}: {
  id: string;
  word: string;
  heading?: ReactNode;
}) {
  const [choosing, setChoosing] = useState(false);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryPage, setRetryPage] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = async (next: number) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setRetryPage(null);
    if (next === 1) setDecks([]);
    try {
      // Custom decks are owned by the learner; the level filter is ignored for this kind.
      const result = await flashcardService.decks('custom', 'N5', next);
      if (!mounted.current) return;
      setDecks(previous =>
        next === 1
          ? result.items
          : [
              ...previous,
              ...result.items.filter(
                item => !previous.some(old => old.id === item.id),
              ),
            ],
      );
      setPage(result.pagination.page);
      setPages(result.pagination.total_pages);
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error ? failure.message : 'Chưa tải được bộ thẻ.',
        );
        setRetryPage(next);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const save = async (deck: FlashcardDeck) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setRetryPage(null);
    try {
      const result = await flashcardService.addDictionaryCard(deck.id, id);
      if (!mounted.current) return;
      setMessage(
        result.added
          ? `Đã lưu vào “${result.title}”.`
          : `Từ này đã có trong “${result.title}”.`,
      );
      setChoosing(false);
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa lưu được từ. Bạn thử lại nhé.',
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View style={styles.content}>
      <View style={styles.actions}>
        {heading ? <View style={styles.heading}>{heading}</View> : null}
        <View style={styles.actionIcons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lưu vào flashcard"
            accessibilityHint="Chọn bộ flashcard hiện có để lưu từ này."
            accessibilityState={{ disabled: busy, expanded: choosing }}
            disabled={busy}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addPressed,
            ]}
            onPress={() => {
              setChoosing(value => !value);
              setMessage('');
              if (!choosing) load(1);
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.primaryText} />
            ) : (
              <Svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                accessible={false}
              >
                <Circle
                  cx={12}
                  cy={12}
                  r={9}
                  stroke={colors.primaryText}
                  strokeWidth={1.7}
                />
                <Path
                  d="M12 8v8M8 12h8"
                  stroke={colors.primaryText}
                  strokeWidth={1.7}
                  strokeLinecap="round"
                />
              </Svg>
            )}
          </Pressable>
          <FavoriteWordButton source="dictionary" id={id} word={word} />
        </View>
      </View>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {message}
        </Text>
      ) : null}
      <AuthNotice error message={error} />
      {choosing ? (
        <View style={styles.picker}>
          <Text style={styles.title}>Chọn bộ flashcard</Text>
          {decks.map(deck => (
            <Pressable
              key={deck.id}
              accessibilityRole="button"
              accessibilityLabel={`Lưu vào bộ ${deck.title}`}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => save(deck)}
              style={({ pressed }) => [styles.deck, pressed && styles.pressed]}
            >
              <Text style={styles.name}>{deck.title}</Text>
              <Text style={styles.count}>{deck.card_count}/100 thẻ</Text>
            </Pressable>
          ))}
          {busy ? (
            <ActivityIndicator
              accessibilityLabel="Đang tải hoặc lưu bộ thẻ"
              color={colors.primary}
            />
          ) : null}
          {!busy && !error && !decks.length ? (
            <Text style={styles.body}>
              Bạn chưa có bộ tự tạo. Hãy tạo một bộ trong mục Flashcard.
            </Text>
          ) : null}
          {retryPage !== null ? (
            <AuthButton
              label="Thử lại danh sách bộ thẻ"
              variant="text"
              onPress={() => load(retryPage)}
            />
          ) : null}
          {page < pages ? (
            <AuthButton
              label="Xem thêm bộ thẻ"
              variant="text"
              disabled={busy}
              onPress={() => load(page + 1)}
            />
          ) : null}
          <AuthButton
            label="Đóng danh sách bộ thẻ"
            variant="text"
            onPress={() => setChoosing(false)}
          />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  actions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  heading: { flex: 1, minWidth: 0 },
  actionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -spacing.xs,
  },
  addButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  addPressed: { backgroundColor: colors.surfaceTint },
  picker: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  title: { ...typography.caption, color: colors.dark },
  deck: {
    minHeight: 48,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  pressed: { borderColor: colors.primary },
  name: { ...typography.body, color: colors.dark },
  count: { ...typography.caption, color: colors.muted },
  body: { ...typography.body, color: colors.body },
  success: { ...typography.body, color: colors.success },
});

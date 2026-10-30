import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  dictionaryService,
  DictionaryHistoryItem,
} from '../services/dictionaryService';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { AuthButton } from './AuthForm';
import { ReplayIcon } from './icons';

export function DictionaryRecentHistory({
  active,
  visible,
  query,
  onOpen,
}: {
  active: boolean;
  visible: boolean;
  query: string;
  onOpen: (item: DictionaryHistoryItem) => void;
}) {
  const [items, setItems] = useState<DictionaryHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = true;
    // A completed write takes precedence over an older in-flight history read.
    let changed = false;
    const unsubscribe = dictionaryService.subscribeHistory(next => {
      changed = true;
      if (current) {
        setItems(next);
        setError('');
      }
    });
    dictionaryService
      .history()
      .then(result => {
        if (current && !changed) {
          setItems(result.items);
          setError('');
        }
      })
      .catch(() => {
        if (current && !changed) setError('Chưa tải được lịch sử.');
      });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [active, attempt]);
  const clear = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await dictionaryService.clearHistory();
      setItems(result.items);
    } catch {
      setError('Chưa xoá được lịch sử.');
    } finally {
      setBusy(false);
    }
  }, []);
  if (!visible || !active) return null;
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  const term = normalize(query.trim());
  const matches = items.filter(
    item =>
      !term ||
      normalize(
        [
          item.word,
          item.reading,
          ...item.glosses.map(gloss => gloss.text),
        ].join(' '),
      ).includes(term),
  );
  // Keep the input focused until a suggestion's click is handled on web.
  const webEvents =
    Platform.OS === 'web'
      ? {
          onMouseDown: (event: { preventDefault: () => void }) =>
            event.preventDefault(),
        }
      : {};
  return (
    <View
      style={styles.dropdown}
      testID="dictionary-history-dropdown"
      {...webEvents}
    >
      <View style={styles.row}>
        <Text style={styles.caption}>Gần đây</Text>
        {items.length ? (
          <AuthButton
            label="Xoá lịch sử"
            variant="text"
            busy={busy}
            onPress={clear}
          />
        ) : null}
      </View>
      {error ? (
        <View style={styles.row}>
          <Text style={styles.caption}>{error}</Text>
          <AuthButton
            label="Tải lại lịch sử"
            variant="text"
            onPress={() => setAttempt(value => value + 1)}
          />
        </View>
      ) : null}
      {!matches.length && !error ? (
        <Text style={styles.empty}>
          {items.length
            ? 'Không có lịch sử phù hợp.'
            : 'Chưa có lịch sử tra cứu.'}
        </Text>
      ) : null}
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
        {matches.map(item => (
          <Pressable
            key={`${item.kind}:${item.target}`}
            accessibilityRole="button"
            accessibilityLabel={`Tra lại ${item.word}`}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <ReplayIcon size={16} color={colors.muted} />
            <Text style={styles.word}>{item.word}</Text>
            <Text style={styles.caption}>
              {item.kind === 'kanji' ? 'Hán tự' : item.reading}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.input,
    boxShadow: shadowMd,
    padding: spacing.sm,
    zIndex: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    minHeight: 40,
    gap: spacing.sm,
  },
  caption: { ...typography.caption, color: colors.muted, flexShrink: 1 },
  empty: { ...typography.body, color: colors.muted, padding: spacing.md },
  list: { maxHeight: 240 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 48,
    borderRadius: radius.small,
  },
  word: { ...typography.label, color: colors.dark, flexShrink: 1 },
  pressed: { backgroundColor: colors.surfaceTint },
});

import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ShadowingTokenText, ShadowingWordPopup } from './ShadowingWordLookup';
import { WordPronunciation } from './WordPronunciation';
import type { SentenceTranslationResult } from '../services/sentenceTranslationService';
import { colors, radius, shadowSm, spacing, typography } from '../theme/theme';

export function SentenceTranslation({
  result,
  active = true,
}: {
  result: SentenceTranslationResult;
  active?: boolean;
}) {
  const [selection, setSelection] = useState<{ key: string; y: number } | null>(
    null,
  );
  const close = useCallback(() => setSelection(null), []);
  useEffect(() => {
    setSelection(null);
  }, [result]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !selection) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, close]);
  return (
    <View style={styles.card} testID="sentence-translation-result">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Kết quả tra cứu
        </Text>
      </View>
      <View style={styles.content}>
        <View style={styles.sentenceRow}>
          <View style={styles.japanese}>
            {result.paragraphs.map(line => (
              <View key={line.id} style={styles.line}>
                <ShadowingTokenText
                  text={line.text}
                  tokens={line.tokens}
                  words={result.words}
                  preserveLayout
                  linkWords
                  selectedKey={selection?.key}
                  onWordPress={(key, y) => setSelection({ key, y })}
                  style={styles.sentence}
                />
              </View>
            ))}
          </View>
          <WordPronunciation
            id={'sentence:' + result.japanese}
            word={result.japanese}
            active={active}
          />
        </View>
        <Text
          selectable
          accessibilityLabel="Bản dịch tiếng Việt"
          style={styles.translation}
        >
          {result.vietnamese}
        </Text>
        <Text style={styles.caption}>Dịch tự động</Text>
      </View>
      <ShadowingWordPopup
        word={active && selection ? result.words[selection.key] ?? null : null}
        anchorY={selection?.y}
        onClose={close}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    boxShadow: shadowSm,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { ...typography.title, color: colors.dark },
  content: { padding: 20, gap: spacing.lg },
  sentenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  japanese: { flex: 1, minWidth: 0, gap: spacing.sm },
  line: { minHeight: 32 },
  sentence: {
    ...typography.body,
    fontSize: 22,
    lineHeight: 36,
    color: colors.dark,
  },
  translation: { ...typography.heading, lineHeight: 26, color: colors.body },
  caption: {
    ...typography.caption,
    color: colors.muted,
    alignSelf: 'flex-end',
  },
});

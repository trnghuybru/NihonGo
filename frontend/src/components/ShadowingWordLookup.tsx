import { useRecordDictionaryHistory } from '../hooks/useDictionaryHistory';
import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ShadowingLookupWord,
  ShadowingToken,
} from '../services/shadowingService';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';
import { XIcon } from './icons';
import { dictionaryService } from '../services/dictionaryService';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import { formatDictionaryPartsOfSpeech } from '../utils/dictionaryLabels';
import { AuthButton } from './AuthForm';
import { DictionaryWordActions } from './DictionaryWordActions';

export const ShadowingTokenText = memo(function TokenText({
  text,
  tokens,
  words,
  selectedKey,
  onWordPress,
  style,
  showFurigana = true,
  preserveLayout = false,
  align = 'center',
  linkWords = false,
  highlightRanges = [],
  interactiveRanges = [],
  activeRangeId,
  onRangeHover,
  onRangeLayout,
}: {
  text: string;
  tokens?: ShadowingToken[];
  words?: Record<string, ShadowingLookupWord>;
  selectedKey?: string | null;
  onWordPress: (key: string, pageY: number) => void;
  style?: StyleProp<TextStyle>;
  showFurigana?: boolean;
  preserveLayout?: boolean;
  align?: 'left' | 'center';
  linkWords?: boolean;
  highlightRanges?: { start: number; end: number }[];
  interactiveRanges?: {
    id: string;
    start: number;
    end: number;
    label: string;
    onPress: () => void;
  }[];
  activeRangeId?: string | null;
  onRangeHover?: (id: string | null) => void;
  onRangeLayout?: (id: string, y: number) => void;
}) {
  const { fontScale } = useWindowDimensions();
  if (!tokens?.length) return <Text style={style}>{text}</Text>;
  let offset = 0;
  return (
    <View
      style={[
        styles.wordFlow,
        preserveLayout && styles.readingFlow,
        align === 'left' && styles.leftFlow,
      ]}
    >
      {tokens.map((token, index) => {
        const start = offset;
        offset += token.text.length;
        const range = interactiveRanges.find(
          item => item.start < offset && item.end > start,
        );
        const highlighted = highlightRanges.some(
          highlight => highlight.start < offset && highlight.end > start,
        );
        if (!token.text.trim())
          return preserveLayout ? (
            <Text key={index} style={style}>
              {token.text}
            </Text>
          ) : null;
        const word = token.key ? words?.[token.key] : undefined;
        const linked =
          linkWords && word && /[\u3400-\u9fff々]/u.test(token.text);
        const selected = Boolean(token.key && token.key === selectedKey);
        const parts = rubyParts(
          token.text,
          showFurigana && word?.surface === token.text ? word.reading : '',
        );
        const content = (
          <View
            style={[
              styles.wordLine,
              preserveLayout && styles.readingWordLine,
              linked && styles.linkedWordLine,
              range && activeRangeId === range.id && styles.hoveredWordLine,
              (selected || highlighted) && styles.selectedWordLine,
            ]}
          >
            {parts.map((part, position) => (
              <View key={position} style={styles.rubyPart}>
                {showFurigana ? (
                  part.reading ? (
                    <Text accessible={false} style={styles.ruby}>
                      {part.reading}
                    </Text>
                  ) : (
                    <View style={{ height: 14 * fontScale }} />
                  )
                ) : null}
                <Text
                  style={[
                    style,
                    styles.wordText,
                    linkWords && styles.sentenceWordText,
                    linked && styles.linkedWordText,
                    selected && styles.selectedWordText,
                  ]}
                >
                  {part.text}
                </Text>
              </View>
            ))}
          </View>
        );
        const interaction = range
          ? {
              onHoverIn: () => onRangeHover?.(range.id),
              onHoverOut: () => onRangeHover?.(null),
              onFocus: () => onRangeHover?.(range.id),
              onBlur: () => onRangeHover?.(null),
              onLayout: (event: import('react-native').LayoutChangeEvent) => {
                if (start <= range.start)
                  onRangeLayout?.(range.id, event.nativeEvent.layout.y);
              },
              testID: `reading-sentence-${range.id}`,
            }
          : {};
        return word || range ? (
          <Pressable
            key={index}
            {...interaction}
            accessibilityRole="button"
            accessibilityLabel={word ? `Tra từ ${word.surface}` : range?.label}
            style={styles.wordCell}
            onPress={event => {
              event.stopPropagation();
              if (word) onWordPress(token.key!, event.nativeEvent.pageY);
              else range?.onPress();
            }}
          >
            {content}
          </Pressable>
        ) : (
          <View key={index} style={styles.wordCell}>
            {content}
          </View>
        );
      })}
    </View>
  );
});

// Align readings to kanji runs through their surrounding kana, e.g. 立った → 立(た) + った.
export function rubyParts(
  text: string,
  reading: string,
): { text: string; reading?: string }[] {
  const parts = text.match(/[\u3400-\u9fff々]+|[^\u3400-\u9fff々]+/gu) ?? [
    text,
  ];
  if (!reading || !/[\u3400-\u9fff々]/u.test(text)) return [{ text }];
  const kana = (value: string) =>
    value.replace(/[\u30a1-\u30f6]/gu, char =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    );
  const result: { text: string; reading?: string }[] = [];
  let cursor = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (/[\u3400-\u9fff々]/u.test(part)) {
      const next = parts[index + 1];
      const boundary = next
        ? reading.indexOf(kana(next), cursor + 1)
        : reading.length;
      if (boundary < 0) return [{ text, reading }];
      result.push({ text: part, reading: reading.slice(cursor, boundary) });
      cursor = boundary;
    } else {
      const value = kana(part);
      if (!reading.startsWith(value, cursor)) return [{ text, reading }];
      result.push({ text: part });
      cursor += value.length;
    }
  }
  return cursor === reading.length ? result : [{ text, reading }];
}

function DictionaryDefinition({ word }: { word: ShadowingLookupWord }) {
  const query = word.lemma || word.surface;
  const load = useCallback(async () => {
    const matches = await dictionaryService.words(query, 1);
    // Prefix matches alone can describe an unrelated word.
    const exact = matches.items.filter(
      item =>
        item.match_type === 'exact' ||
        item.word === query ||
        item.reading === query,
    );
    const entry = exact.find(item => item.reading === word.reading) ?? exact[0];
    return entry ? dictionaryService.word(entry.id) : null;
  }, [query, word.reading]);
  const { state, reload } = useRemoteResource(load);
  useRecordDictionaryHistory(
    'word',
    state.status === 'ready' ? state.data?.id : undefined,
  );
  const heading = (
    <View style={styles.wordHeading}>
      <Text style={styles.word}>{word.surface}</Text>
      {word.reading ? (
        <Text style={styles.reading}>【{word.reading}】</Text>
      ) : null}
      {word.lemma && word.lemma !== word.surface ? (
        <Text style={styles.reading}>
          {word.surface} → {word.lemma}
        </Text>
      ) : null}
    </View>
  );
  if (state.status === 'loading')
    return (
      <View style={styles.popupContent}>
        {heading}
        <ActivityIndicator
          accessibilityLabel="Đang tra từ"
          color={colors.primary}
        />
      </View>
    );
  if (state.status === 'error')
    return (
      <View style={styles.popupContent}>
        {heading}
        <View style={styles.definition}>
          <Text style={styles.reading}>{state.message}</Text>
          <AuthButton label="Thử lại" variant="text" onPress={reload} />
        </View>
      </View>
    );
  const entry = state.data;
  if (!entry)
    return (
      <View style={styles.popupContent}>
        {heading}
        <Text style={styles.reading}>
          Không tìm thấy kết quả trong từ điển.
        </Text>
      </View>
    );
  return (
    <View style={styles.popupContent}>
      <DictionaryWordActions
        key={entry.id}
        id={entry.id}
        word={entry.word}
        heading={heading}
      />
      {entry.reading !== word.reading ? (
        <Text style={styles.reading}>{entry.reading}</Text>
      ) : null}
      {entry.han_viet?.length ? (
        <Text style={styles.pos}>
          {entry.han_viet.join(' · ').toUpperCase()}
        </Text>
      ) : null}
      {entry.senses.map((sense, index) => {
        const vietnamese = sense.glosses.filter(
          gloss => gloss.language === 'vi',
        );
        const glosses = vietnamese.length
          ? vietnamese
          : sense.glosses.filter(gloss =>
              ['eng', 'en'].includes(gloss.language),
            );
        if (!glosses.length) return null;
        return (
          <View key={index} style={styles.definition}>
            <Text style={styles.pos}>
              {index + 1}.{' '}
              {formatDictionaryPartsOfSpeech(sense.parts_of_speech)}
            </Text>
            <Text selectable style={styles.meaning}>
              {glosses.map(gloss => gloss.text).join('; ')}
              {vietnamese.length ? '' : ' · Anh'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function ShadowingWordPopup({
  word,
  anchorY,
  onClose,
}: {
  word: ShadowingLookupWord | null;
  anchorY?: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!word) return null;
  const maxHeight = Math.min(
    400,
    height - insets.top - insets.bottom - spacing.section,
  );
  const top = Math.max(
    insets.top + spacing.lg,
    Math.min(
      (anchorY || height / 3) + spacing.lg,
      height - insets.bottom - maxHeight - spacing.lg,
    ),
  );
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Đóng tra từ"
          onPress={onClose}
        />
        <View
          style={[styles.popup, { marginTop: top, maxHeight }]}
          accessibilityViewIsModal
        >
          <View style={styles.popupHeader}>
            <Text style={styles.pos}>Từ điển</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng popup từ vựng"
              hitSlop={8}
              onPress={onClose}
              style={styles.close}
            >
              <XIcon size={18} color={colors.body} />
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator
            contentContainerStyle={styles.popupContent}
          >
            <DictionaryDefinition
              key={word.lemma || word.surface}
              word={word}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wordFlow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-end',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  leftFlow: { justifyContent: 'flex-start' },
  readingFlow: { justifyContent: 'flex-start', columnGap: 0, rowGap: 2 },
  readingWordLine: { borderBottomColor: 'transparent', borderBottomWidth: 1 },
  wordCell: { maxWidth: '100%' },
  wordLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '100%',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 2,
  },
  linkedWordLine: { borderBottomColor: colors.primary },
  linkedWordText: { color: colors.focus },
  hoveredWordLine: { backgroundColor: colors.surfaceTint },
  selectedWordLine: { backgroundColor: colors.badgeBg },
  rubyPart: { alignItems: 'center', maxWidth: '100%', flexShrink: 1 },
  ruby: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    color: colors.body,
    minHeight: 14,
    textAlign: 'center',
  },
  wordText: { textDecorationLine: 'none' },
  sentenceWordText: { textAlign: 'center' },
  selectedWordText: { color: colors.focus },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(37,37,38,0.12)',
    paddingHorizontal: spacing.lg,
  },
  popup: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : layout.maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    boxShadow: shadowMd,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  popupContent: { gap: spacing.md, paddingBottom: spacing.sm },
  close: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
  },
  pos: { ...typography.caption, color: colors.muted },
  wordHeading: { gap: spacing.xs, paddingTop: 12 },
  word: { ...typography.title, color: colors.dark },
  reading: { ...typography.body, color: colors.body },
  definition: {
    backgroundColor: colors.surfaceTint,
    padding: spacing.md,
    borderRadius: radius.small,
    gap: spacing.sm,
  },
  meaning: { ...typography.body, color: colors.body },
});

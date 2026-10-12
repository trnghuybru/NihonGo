import { memo } from 'react';
import {
  Modal,
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

export const ShadowingTokenText = memo(function TokenText({
  text,
  tokens,
  words,
  selectedKey,
  onWordPress,
  style,
}: {
  text: string;
  tokens?: ShadowingToken[];
  words?: Record<string, ShadowingLookupWord>;
  selectedKey?: string | null;
  onWordPress: (key: string, pageY: number) => void;
  style?: StyleProp<TextStyle>;
}) {
  const { fontScale } = useWindowDimensions();
  if (!tokens?.length) return <Text style={style}>{text}</Text>;
  return (
    <View style={styles.wordFlow}>
      {tokens.map((token, index) => {
        if (!token.text.trim()) return null;
        const word = token.key ? words?.[token.key] : undefined;
        const selected = token.key === selectedKey;
        const parts = rubyParts(
          token.text,
          word?.surface === token.text ? word.reading : '',
        );
        const content = (
          <View style={[styles.wordLine, selected && styles.selectedWordLine]}>
            {parts.map((part, position) => (
              <View
                key={position}
                style={[styles.rubyPart, { paddingTop: 14 * fontScale }]}
              >
                {part.reading ? (
                  <Text
                    accessible={false}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={styles.ruby}
                  >
                    {part.reading}
                  </Text>
                ) : null}
                <Text
                  style={[
                    style,
                    styles.wordText,
                    selected && styles.selectedWordText,
                  ]}
                >
                  {part.text}
                </Text>
              </View>
            ))}
          </View>
        );
        return word ? (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`Tra từ ${word.surface}`}
            style={styles.wordCell}
            onPress={event => {
              event.stopPropagation();
              onWordPress(token.key!, event.nativeEvent.pageY);
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

const partsOfSpeech: Record<string, string> = {
  名詞: 'Danh từ',
  動詞: 'Động từ',
  形容詞: 'Tính từ',
  形状詞: 'Tính từ',
  副詞: 'Trạng từ',
  助詞: 'Trợ từ',
  助動詞: 'Trợ động từ',
  接続詞: 'Liên từ',
};

export function ShadowingWordPopup({
  word,
  anchorY,
  onClose,
}: {
  word: ShadowingLookupWord | null;
  anchorY: number;
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
            <Text style={styles.pos}>
              {partsOfSpeech[word.pos] || word.pos}
            </Text>
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
            <Text style={styles.word}>{word.surface}</Text>
            {word.reading ? (
              <Text style={styles.reading}>【{word.reading}】</Text>
            ) : null}
            {word.lemma !== word.surface ? (
              <Text style={styles.reading}>Dạng gốc: {word.lemma}</Text>
            ) : null}
            {word.entries.length ? (
              word.entries.map(entry => (
                <View key={entry.id} style={styles.definition}>
                  <View style={styles.definitionHeading}>
                    <Text style={styles.entryReading}>
                      {entry.word} · {entry.reading}
                    </Text>
                    <Text style={styles.level}>{entry.level}</Text>
                  </View>
                  <Text style={styles.meaning}>{entry.meaning_vi}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.reading}>
                Chưa có nghĩa tiếng Việt của từ này trong dữ liệu hiện tại.
              </Text>
            )}
            <Text style={styles.hint}>Đóng và bấm phát để tiếp tục video.</Text>
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
  wordCell: { maxWidth: '100%' },
  wordLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '100%',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 2,
  },
  selectedWordLine: { backgroundColor: colors.badgeBg },
  rubyPart: { paddingTop: 14, maxWidth: '100%', flexShrink: 1 },
  ruby: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    color: colors.body,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  wordText: { textDecorationLine: 'none' },
  selectedWordText: { color: colors.focus },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(37,37,38,0.12)',
    paddingHorizontal: spacing.lg,
  },
  popup: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
  },
  pos: { ...typography.caption, color: colors.muted },
  word: { ...typography.brand, color: colors.dark },
  reading: { ...typography.input, color: colors.body },
  definition: {
    backgroundColor: colors.surfaceTint,
    padding: spacing.md,
    borderRadius: radius.small,
    gap: spacing.sm,
  },
  definitionHeading: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  entryReading: { ...typography.caption, color: colors.muted, flex: 1 },
  level: { ...typography.caption, color: colors.primaryText },
  meaning: { ...typography.title, color: colors.dark },
  hint: { ...typography.caption, color: colors.muted },
});

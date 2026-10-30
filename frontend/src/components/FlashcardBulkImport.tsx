import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AuthButton, AuthNotice } from './AuthForm';
import { AuthIcon } from './AuthIcon';
import type { CardDraft } from '../services/flashcardService';
import {
  MAX_IMPORT_CHARACTERS,
  parseFlashcardImport,
} from '../utils/flashcardImport';
import { colors, layout, radius, spacing, typography } from '../theme/theme';

type SeparatorChoice = 'tab' | 'comma' | 'custom';
type RowChoice = 'newline' | 'semicolon' | 'custom';

export function FlashcardBulkImport({
  remaining,
  disabled,
  onImport,
  onPendingChange,
}: {
  remaining: number;
  disabled: boolean;
  onImport: (cards: CardDraft[]) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [field, setField] = useState<SeparatorChoice>('tab');
  const [row, setRow] = useState<RowChoice>('newline');
  const [customField, setCustomField] = useState('');
  const [customRow, setCustomRow] = useState('');
  const [header, setHeader] = useState(false);
  const [focused, setFocused] = useState<'text' | 'field' | 'row' | null>(null);
  useEffect(() => {
    onPendingChange(Boolean(text.trim()));
  }, [text, onPendingChange]);
  const parsed = useMemo(
    () =>
      parseFlashcardImport(text, {
        fieldSeparator:
          field === 'tab' ? '\t' : field === 'comma' ? ',' : customField,
        cardSeparator:
          row === 'newline' ? '\n' : row === 'semicolon' ? ';' : customRow,
        skipHeader: header,
      }),
    [text, field, row, customField, customRow, header],
  );
  const locked = disabled;
  const tooMany = parsed.cards.length > remaining;
  const choice = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={styles.choice}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <Text style={styles.body}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.content}>
      <Text style={styles.heading}>Nhập dữ liệu của bạn</Text>
      <Text style={styles.body}>
        Dán từ Excel, Google Sheets hoặc nhập mỗi dòng một thẻ.
      </Text>
      <TextInput
        accessibilityLabel="Dữ liệu nhập hàng loạt"
        placeholder={'学校\ttrường học\n人生\tcuộc đời\n勉強\thọc tập'}
        value={text}
        onChangeText={setText}
        multiline
        editable={!locked}
        maxLength={MAX_IMPORT_CHARACTERS + 1}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setFocused('text')}
        onBlur={() => setFocused(null)}
        style={[styles.textarea, focused === 'text' && styles.focused]}
      />
      <Text style={styles.caption}>
        2 cột: Từ · Nghĩa. 3 cột: Từ · Cách đọc · Nghĩa.
      </Text>
      <View style={styles.options}>
        <View
          style={styles.optionColumn}
          accessibilityRole="radiogroup"
          accessibilityLabel="Giữa các cột"
        >
          <Text style={styles.label}>Giữa các cột</Text>
          {choice('Tab', field === 'tab', () => setField('tab'))}
          {choice('Dấu phẩy', field === 'comma', () => setField('comma'))}
          {choice('Ký tự riêng giữa cột', field === 'custom', () =>
            setField('custom'),
          )}
          {field === 'custom' ? (
            <TextInput
              accessibilityLabel="Dấu phân cách cột tuỳ chỉnh"
              placeholder="Ví dụ: |"
              value={customField}
              onChangeText={setCustomField}
              editable={!locked}
              maxLength={8}
              onFocus={() => setFocused('field')}
              onBlur={() => setFocused(null)}
              style={[styles.input, focused === 'field' && styles.focused]}
            />
          ) : null}
        </View>
        <View
          style={styles.optionColumn}
          accessibilityRole="radiogroup"
          accessibilityLabel="Giữa các thẻ"
        >
          <Text style={styles.label}>Giữa các thẻ</Text>
          {choice('Xuống dòng', row === 'newline', () => setRow('newline'))}
          {choice('Dấu chấm phẩy', row === 'semicolon', () =>
            setRow('semicolon'),
          )}
          {choice('Ký tự riêng giữa thẻ', row === 'custom', () =>
            setRow('custom'),
          )}
          {row === 'custom' ? (
            <TextInput
              accessibilityLabel="Dấu phân cách thẻ tuỳ chỉnh"
              placeholder="Ví dụ: ;;"
              value={customRow}
              onChangeText={setCustomRow}
              editable={!locked}
              maxLength={8}
              onFocus={() => setFocused('row')}
              onBlur={() => setFocused(null)}
              style={[styles.input, focused === 'row' && styles.focused]}
            />
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Dòng đầu là tiêu đề"
        accessibilityState={{ checked: header, disabled: locked }}
        disabled={locked}
        onPress={() => setHeader(value => !value)}
        style={styles.choice}
      >
        <View style={[styles.checkbox, header && styles.checkboxSelected]}>
          {header ? (
            <AuthIcon name="check" size={12} color={colors.onPrimary} />
          ) : null}
        </View>
        <Text style={styles.body}>Dòng đầu là tiêu đề</Text>
      </Pressable>
      <Text style={styles.heading}>
        Xem trước <Text style={styles.caption}>{parsed.cards.length} thẻ</Text>
      </Text>
      {parsed.errors.length ? (
        <AuthNotice
          error
          message={
            parsed.errors.slice(0, 3).join('\n') +
            (parsed.errors.length > 3
              ? `\nVà ${parsed.errors.length - 3} lỗi khác.`
              : '')
          }
        />
      ) : null}
      {tooMany ? (
        <AuthNotice
          error
          message={`Bộ thẻ còn chỗ cho ${remaining} thẻ. Hãy giảm số thẻ nhập.`}
        />
      ) : null}
      {parsed.cards.length ? (
        <ScrollView nestedScrollEnabled style={styles.preview}>
          {parsed.cards.map((card, index) => (
            <View key={index} style={styles.previewRow}>
              <Text style={styles.number}>{index + 1}</Text>
              <View style={styles.term}>
                <Text style={styles.label}>{card.front}</Text>
                {card.reading ? (
                  <Text style={styles.caption}>{card.reading}</Text>
                ) : null}
              </View>
              <Text style={styles.definition}>{card.back}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.caption}>Chưa có thẻ để xem trước.</Text>
      )}
      <AuthButton
        label={`Thêm ${parsed.cards.length} thẻ vào bộ`}
        variant="outline"
        disabled={
          locked ||
          !parsed.cards.length ||
          Boolean(parsed.errors.length) ||
          tooMany
        }
        onPress={() => {
          if (locked || !parsed.cards.length || parsed.errors.length || tooMany)
            return;
          onImport(parsed.cards);
          setText('');
          onPendingChange(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  focused: { borderColor: colors.focus, backgroundColor: colors.surface },
  heading: { ...typography.heading, color: colors.dark },
  label: { ...typography.label, color: colors.body },
  body: { ...typography.body, color: colors.body, flexShrink: 1 },
  caption: { ...typography.caption, color: colors.muted },
  textarea: {
    ...typography.input,
    color: colors.inputText,
    minHeight: 200,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  optionColumn: { flex: 1, minWidth: 110, gap: spacing.xs },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.checkboxBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: { borderColor: colors.focus },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.focus,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.checkboxBorder,
    borderRadius: spacing.xs,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.focus,
    borderColor: colors.focus,
  },
  input: {
    ...typography.input,
    color: colors.inputText,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceTint,
  },
  preview: {
    maxHeight: 240,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
    borderCurve: 'continuous',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  number: { ...typography.caption, color: colors.muted, minWidth: 16 },
  term: { flex: 1, minWidth: 0, gap: spacing.xs },
  definition: { ...typography.body, color: colors.body, flex: 1, minWidth: 0 },
});

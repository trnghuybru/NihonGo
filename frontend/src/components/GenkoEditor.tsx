import { StyleSheet, TextInput } from 'react-native';
import type { GenkoEditorProps } from './GenkoEditor.types';
import { colors, radius, spacing, typography } from '../theme/theme';

// The native workspace retains its system text input; the browser uses paper.
export function GenkoEditor({
  value,
  onChangeText,
  editable,
}: GenkoEditorProps) {
  return (
    <TextInput
      accessibilityLabel="Nội dung bài viết"
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      multiline
      numberOfLines={9}
      placeholder="ここに書いてください。"
      placeholderTextColor={colors.placeholder}
      textAlignVertical="top"
      style={styles.input}
    />
  );
}
const styles = StyleSheet.create({
  input: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 28,
    minHeight: 240,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceTint,
    color: colors.dark,
  },
});

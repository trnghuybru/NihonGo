import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, radius, spacing, typography } from '../theme/theme';
import { AuthIcon } from './AuthIcon';

interface Props {
  label: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function LearningChoice({
  label,
  description,
  selected,
  disabled = false,
  onPress,
}: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? (
          <AuthIcon name="check" size={14} color={colors.onPrimary} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
  },
  pressed: { backgroundColor: colors.badgeBg },
  copy: { flex: 1, gap: spacing.xs },
  label: { ...typography.label, color: colors.dark },
  description: { ...typography.body, color: colors.body },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.checkboxBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});

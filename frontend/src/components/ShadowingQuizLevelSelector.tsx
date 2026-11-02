import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ShadowingQuizLevel } from '../services/shadowingService';
import { colors, radius, spacing, typography } from '../theme/theme';
import { ChevronDownIcon } from './icons';

export function ShadowingQuizLevelSelector({
  level,
  loading,
  onChange,
}: {
  level: ShadowingQuizLevel;
  loading: boolean;
  onChange: (level: ShadowingQuizLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Trình độ câu hỏi: ${level}`}
        accessibilityState={{ disabled: loading, expanded: open }}
        disabled={loading}
        onPress={() => setOpen(true)}
        style={[styles.trigger, loading && styles.disabled]}
      >
        <Text style={styles.label}>{level}</Text>
        <ChevronDownIcon size={16} color={colors.body} />
      </Pressable>
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Đóng chọn trình độ"
            onPress={() => setOpen(false)}
          />
          <View style={styles.menu} accessibilityViewIsModal>
            {(['N5', 'N4', 'N3', 'N2', 'N1'] as const).map(value => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={`Trình độ ${value}`}
                accessibilityState={{ checked: value === level }}
                onPress={() => {
                  onChange(value);
                  setOpen(false);
                }}
                style={[styles.option, value === level && styles.selected]}
              >
                <Text
                  style={[
                    styles.label,
                    value === level && styles.selectedLabel,
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 40,
    minWidth: 80,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  label: { ...typography.input, color: colors.dark },
  disabled: { backgroundColor: colors.disabled },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(37,37,38,0.35)',
  },
  menu: {
    width: '100%',
    maxWidth: 280,
    padding: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.small,
  },
  selected: { backgroundColor: colors.primary },
  selectedLabel: { color: colors.onPrimary },
});

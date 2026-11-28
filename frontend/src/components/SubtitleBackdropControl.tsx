import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/theme';

export type SubtitleBackdropControlProps = {
  value: number;
  onChange: (value: number) => void;
};

export function SubtitleBackdropControl({
  value,
  onChange,
}: SubtitleBackdropControlProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nền phụ đề nhạt hơn"
        disabled={value <= 0}
        onPress={() => onChange(Math.max(0, value - 5))}
        style={styles.button}
      >
        <Text style={styles.label}>−</Text>
      </Pressable>
      <Text style={styles.caption}>Độ đậm nền · {value}%</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nền phụ đề đậm hơn"
        disabled={value >= 80}
        onPress={() => onChange(Math.min(80, value + 5))}
        style={styles.button}
      >
        <Text style={styles.label}>+</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.badgeBg,
  },
  label: { ...typography.label, color: colors.focus },
  caption: { ...typography.caption, color: colors.body },
});

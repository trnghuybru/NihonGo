import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/theme';
import type { SubtitleBackdropControlProps } from './SubtitleBackdropControl';
import type { CSSProperties } from 'react';

const sliderStyle: CSSProperties = {
  width: '100%',
  margin: 0,
  minHeight: 32,
  accentColor: colors.primary,
  cursor: 'pointer',
};

export function SubtitleBackdropControl({
  value,
  onChange,
}: SubtitleBackdropControlProps) {
  return (
    <View style={styles.control}>
      <View style={styles.labels}>
        <Text style={styles.caption}>Nhạt</Text>
        <Text style={styles.caption}>{value}%</Text>
        <Text style={styles.caption}>Đậm</Text>
      </View>
      <input
        aria-label="Độ đậm nền phụ đề"
        type="range"
        min={0}
        max={80}
        step={5}
        value={value}
        onChange={event => onChange(Number(event.currentTarget.value))}
        style={sliderStyle}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  control: { gap: 4 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  caption: { ...typography.caption, color: colors.body },
});

import { Pressable, StyleSheet } from 'react-native';
import { HomeFeatureIcon } from './HomeFeatureIcon';
import { colors, layout, radius } from '../theme/theme';

export function SearchButton({
  onPress,
  disabled = false,
  label = 'Tìm kiếm',
}: {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        disabled ? styles.disabled : pressed ? styles.pressed : null,
      ]}
    >
      <HomeFeatureIcon
        name="search"
        size={20}
        color={disabled ? colors.disabledText : colors.onPrimary}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  pressed: { backgroundColor: colors.primaryPressed },
  disabled: { backgroundColor: colors.disabled },
});

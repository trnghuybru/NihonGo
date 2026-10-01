import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/theme';

export function BrandLogo({ large = false }: { large?: boolean }) {
  return (
    <View accessible accessibilityLabel="NihonGO" style={styles.logo}>
      <Image
        source={require('../assets/mascot/momo-head.png')}
        resizeMode="contain"
        accessible={false}
        style={large ? styles.largeMark : styles.mark}
      />
      <Text style={styles.wordmark}>
        Nihon<Text style={styles.accent}>GO</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  mark: { width: 40, height: 40 },
  largeMark: { width: 56, height: 56 },
  wordmark: {
    ...typography.brand,
    color: colors.dark,
    flexShrink: 1,
  },
  accent: { color: colors.primary },
});

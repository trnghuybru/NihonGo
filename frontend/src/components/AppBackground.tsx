import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { backgroundGradient, colors } from '../theme/theme';

/** Fixed page backdrop; screens remain transparent so navigation keeps one gradient. */
export function AppBackground() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rose = `background-rose-${id}`;
  const peach = `background-peach-${id}`;
  return (
    <View
      testID="app-background"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.background]}
    >
      <Svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 400 900"
      >
        <Defs>
          <RadialGradient id={rose}>
            <Stop
              offset="0"
              stopColor={backgroundGradient.rose}
              stopOpacity={backgroundGradient.opacity}
            />
            <Stop
              offset="1"
              stopColor={backgroundGradient.rose}
              stopOpacity="0"
            />
          </RadialGradient>
          <RadialGradient id={peach}>
            <Stop
              offset="0"
              stopColor={backgroundGradient.peach}
              stopOpacity={backgroundGradient.opacity}
            />
            <Stop
              offset="1"
              stopColor={backgroundGradient.peach}
              stopOpacity="0"
            />
          </RadialGradient>
        </Defs>
        <Ellipse cx="30" cy="410" rx="300" ry="460" fill={`url(#${rose})`} />
        <Ellipse cx="390" cy="170" rx="210" ry="280" fill={`url(#${peach})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.background,
  },
});

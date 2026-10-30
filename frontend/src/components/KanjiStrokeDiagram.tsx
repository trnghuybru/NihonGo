import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, layout, radius, spacing } from '../theme/theme';
import { ReplayIcon } from './icons';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const millisecondsPerStroke = 800;

function pathLength(path: Path | null) {
  // react-native-svg exposes geometry on Shape natively and its SVG DOM node on web.
  const length =
    Platform.OS === 'web'
      ? (
          path as unknown as { elementRef?: { current: SVGPathElement | null } }
        )?.elementRef?.current?.getTotalLength()
      : path?.getTotalLength();
  return length && Number.isFinite(length) && length > 0 ? length : null;
}

export function KanjiStrokeDiagram({ paths }: { paths: string[] }) {
  // Changing characters must discard the previous character's playback position.
  return <StrokePlayer key={paths.join('|')} paths={paths} />;
}

function StrokePlayer({ paths }: { paths: string[] }) {
  const [progress] = useState(() => new Animated.Value(0));
  const pathRefs = useRef<(Path | null)[]>([]);
  const [lengths, setLengths] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(true);
  const [restart, setRestart] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') setPlaying(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!playing || !lengths) return;
    const animation = Animated.timing(progress, {
      toValue: paths.length,
      duration: paths.length * millisecondsPerStroke,
      easing: Easing.linear,
      useNativeDriver: false, // SVG dash offsets are unsupported by the native driver.
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished) setPlaying(false);
    });
    return () => animation.stop();
  }, [lengths, paths.length, playing, progress, restart]);

  const measure = useCallback(() => {
    if (lengths) return lengths;
    const measured = paths.map((_, index) =>
      pathLength(pathRefs.current[index]),
    );
    if (measured.some(length => length === null)) return null;
    const result = measured as number[];
    setLengths(result);
    return result;
  }, [lengths, paths]);

  const replay = () => {
    if (!paths.length || !measure()) return;
    progress.setValue(0);
    setRestart(value => value + 1);
    setPlaying(true);
  };

  const strokes = useMemo(
    () =>
      paths.map((d, index) => ({
        d,
        start: d.match(/^[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/),
        offset: progress.interpolate({
          inputRange: [index, index + 0.8],
          outputRange: [lengths?.[index] ?? 1, 0],
          extrapolate: 'clamp',
        }),
        opacity: progress.interpolate({
          inputRange: [index, index + 0.001],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
      })),
    [lengths, paths, progress],
  );

  return (
    <View style={styles.player}>
      <View
        style={styles.diagram}
        onLayout={measure}
        accessible
        accessibilityLabel={`Thứ tự ${paths.length} nét viết`}
      >
        <Svg width={220} height={220} viewBox="0 0 109 109">
          <Line
            x1={54.5}
            y1={0}
            x2={54.5}
            y2={109}
            stroke={colors.border}
            strokeDasharray="2 3"
          />
          <Line
            x1={0}
            y1={54.5}
            x2={109}
            y2={54.5}
            stroke={colors.border}
            strokeDasharray="2 3"
          />
          {strokes.map(({ d }, index) => (
            <Path
              key={`guide-${index}`}
              ref={path => {
                pathRefs.current[index] = path;
              }}
              d={d}
              fill="none"
              stroke={colors.border}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {lengths
            ? strokes.map(({ d, offset, opacity }, index) => (
                <AnimatedPath
                  key={index}
                  testID={`kanji-animated-stroke-${index}`}
                  d={d}
                  fill="none"
                  stroke={colors.dark}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={[lengths[index], lengths[index]]}
                  strokeDashoffset={offset}
                  opacity={opacity}
                />
              ))
            : null}
          {strokes.map(({ start: point }, index) =>
            point ? (
              <SvgText
                key={index}
                x={Math.max(4, Number(point[1]) - 3)}
                y={Math.max(6, Number(point[2]) - 3)}
                fontSize={5}
                fill={colors.focus}
              >
                {index + 1}
              </SvgText>
            ) : null,
          )}
        </Svg>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Phát lại nét viết"
        onPress={replay}
        style={({ pressed }) => [styles.replay, pressed && styles.pressed]}
      >
        <ReplayIcon size={20} color={colors.focus} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  player: { width: 238, alignSelf: 'center' },
  diagram: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  replay: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.track },
});

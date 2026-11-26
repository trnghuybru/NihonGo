import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AuthButton } from './AuthForm';
import { TrashIcon, XIcon } from './icons';
import { HandwritingCanvas } from './HandwritingCanvas';
import {
  HandwritingPrediction,
  handwritingService,
} from '../services/handwritingService';
import { colors, shadowMd, spacing, typography } from '../theme/theme';

export function HandwritingLookup({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (character: string) => void;
}) {
  const [hasInk, setHasInk] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [predictions, setPredictions] = useState<HandwritingPrediction[]>([]);
  const generation = useRef(0);
  const alive = useRef(true);
  const pending = useRef(false);
  const latestImage = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<{ image: string; version: number } | null>(null);
  const { height } = useWindowDimensions();
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let disposed = false;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (disposed) return;
      if (reduced) entrance.setValue(1);
      else {
        animation = Animated.timing(entrance, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        });
        animation.start();
      }
    });
    return () => {
      disposed = true;
      animation?.stop();
    };
  }, [entrance]);
  const invalidate = useCallback(() => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queued.current = null;
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      invalidate();
    };
  }, [invalidate]);
  // Keep at most one request in flight and replace waiting work with the newest image.
  const drain = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      while (alive.current && queued.current) {
        const work = queued.current;
        queued.current = null;
        try {
          const result = await handwritingService.recognize(work.image);
          if (alive.current && generation.current === work.version) {
            setPredictions(result.predictions);
          }
        } catch (cause) {
          if (alive.current && generation.current === work.version) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Không nhận dạng được chữ viết. Hãy thử lại.',
            );
          }
        } finally {
          if (alive.current && generation.current === work.version)
            setBusy(false);
        }
      }
    } finally {
      pending.current = false;
    }
  }, []);
  const recognizeAfterPause = useCallback(
    (image: string) => {
      invalidate();
      latestImage.current = image;
      setHasInk(Boolean(image));
      setPredictions([]);
      setError('');
      setBusy(false);
      if (!image) return;
      const version = generation.current;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!alive.current || generation.current !== version) return;
        queued.current = { image, version };
        setBusy(true);
        drain();
      }, 300);
    },
    [drain, invalidate],
  );
  const close = () => {
    invalidate();
    onClose();
  };
  return (
    <Animated.View
      testID="handwriting-panel"
      style={[
        styles.panel,
        {
          maxHeight: Math.min(400, height * 0.65),
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [-16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <ScrollView
        testID="handwriting-sheet"
        style={styles.sheet}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Viết tay
          </Text>
          <View style={styles.tools}>
            {busy ? (
              <ActivityIndicator
                color={colors.primary}
                accessibilityLabel="Đang nhận dạng chữ viết"
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa nét"
              disabled={!hasInk}
              accessibilityState={{ disabled: !hasInk }}
              onPress={() => {
                recognizeAfterPause('');
                setRevision(value => value + 1);
              }}
              style={({ pressed }) => [
                styles.iconButton,
                !hasInk && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <TrashIcon
                size={14}
                color={hasInk ? colors.primaryText : colors.muted}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng viết tay"
              onPress={close}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.pressed,
              ]}
            >
              <XIcon size={14} color={colors.muted} />
            </Pressable>
          </View>
        </View>
        <View style={styles.workspace}>
          <View style={styles.writingArea}>
            <HandwritingCanvas
              key={revision}
              onStrokeStart={() => {
                invalidate();
                latestImage.current = '';
                setHasInk(true);
                setPredictions([]);
                setError('');
                setBusy(false);
              }}
              onChange={recognizeAfterPause}
            />
          </View>
        </View>
        {error && latestImage.current ? (
          <AuthButton
            label="Thử lại"
            size="compact"
            variant="text"
            onPress={() => recognizeAfterPause(latestImage.current)}
          />
        ) : null}
        <View style={styles.results}>
          {error ? (
            <Text
              accessibilityRole="alert"
              accessibilityLabel={error}
              numberOfLines={2}
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.candidates}>
            {Array.from({ length: 5 }, (_, index) => {
              const item = predictions[index];
              return item ? (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={`Tra ký tự ${item.character}`}
                  onPress={() => {
                    invalidate();
                    onSelect(item.character);
                  }}
                  style={({ pressed }) => [
                    styles.candidate,
                    index === 0 && styles.firstCandidate,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.character}>{item.character}</Text>
                  <Text style={styles.score}>
                    {Math.round(item.score * 100)}%
                  </Text>
                </Pressable>
              ) : (
                <View
                  key={index}
                  accessible={false}
                  testID={`handwriting-candidate-placeholder-${index}`}
                  style={[styles.candidate, styles.emptyCandidate]}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: spacing.sm,
    width: '100%',
    maxWidth: 280,
    borderRadius: 12,
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    zIndex: 40,
  },
  sheet: { flexShrink: 1, minHeight: 0 },
  content: { padding: 10, gap: 8 },
  workspace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    flexShrink: 0,
  },
  writingArea: { flex: 1, minWidth: 0, flexShrink: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...typography.label, color: colors.dark },
  tools: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.surfaceTint,
  },
  disabled: { opacity: 0.4 },
  results: { gap: spacing.sm, flexShrink: 0 },
  error: { ...typography.body, color: colors.danger },
  emptyCandidate: { backgroundColor: colors.surfaceTint },
  candidates: { flexDirection: 'row', gap: spacing.xs },
  candidate: {
    flex: 1,
    height: 44,
    flexShrink: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  firstCandidate: {
    backgroundColor: colors.badgeBg,
    borderColor: colors.primary,
  },
  character: { ...typography.title, fontSize: 20, lineHeight: 24, color: colors.dark },
  score: { ...typography.caption, fontSize: 10, lineHeight: 12, color: colors.muted },
  pressed: { opacity: 0.7 },
});

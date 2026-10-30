import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton } from './AuthForm';
import { HandwritingCanvas } from './HandwritingCanvas';
import {
  HandwritingPrediction,
  handwritingService,
} from '../services/handwritingService';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';

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
  const insets = useSafeAreaInsets();
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
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
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
            <AuthButton label="Đóng viết tay" variant="text" onPress={close} />
          </View>
          <Text style={styles.caption}>Viết một ký tự tiếng Nhật.</Text>
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
          <View style={styles.actions}>
            <AuthButton
              label="Xóa nét"
              variant="outline"
              disabled={!hasInk}
              onPress={() => {
                recognizeAfterPause('');
                setRevision(value => value + 1);
              }}
            />
            {busy ? (
              <ActivityIndicator
                color={colors.primary}
                accessibilityLabel="Đang nhận dạng chữ viết"
              />
            ) : null}
            {error && latestImage.current ? (
              <AuthButton
                label="Thử lại"
                variant="text"
                onPress={() => recognizeAfterPause(latestImage.current)}
              />
            ) : null}
          </View>
          <View style={styles.results}>
            <View style={styles.resultStatus}>
              {error ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLabel={error}
                  numberOfLines={2}
                  style={styles.error}
                >
                  {error}
                </Text>
              ) : (
                <Text style={styles.caption}>Chọn ký tự để tra cứu</Text>
              )}
            </View>
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
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(37,37,38,0.4)',
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    flexGrow: 0,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  content: { padding: spacing.xl, gap: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...typography.title, color: colors.dark },
  caption: { ...typography.caption, color: colors.muted },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
  },
  results: { gap: spacing.md },
  resultStatus: { height: 40, justifyContent: 'center' },
  error: { ...typography.body, color: colors.danger },
  emptyCandidate: { backgroundColor: colors.surfaceTint },
  candidates: { flexDirection: 'row', gap: spacing.xs },
  candidate: {
    flex: 1,
    height: 72,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
  },
  firstCandidate: {
    backgroundColor: colors.badgeBg,
    borderColor: colors.primary,
  },
  character: { ...typography.title, color: colors.dark },
  score: { ...typography.caption, color: colors.muted },
  pressed: { opacity: 0.7 },
});

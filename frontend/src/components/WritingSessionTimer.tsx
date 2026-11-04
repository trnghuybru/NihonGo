import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/theme';

export function WritingSessionTimer({
  documentKey,
  running,
  elapsedByDocument,
}: {
  documentKey: string;
  running: boolean;
  elapsedByDocument: Map<string, number>;
}) {
  const [seconds, setSeconds] = useState(() =>
    Math.floor((elapsedByDocument.get(documentKey) ?? 0) / 1000),
  );
  useEffect(() => {
    let startedAt: number | null = null;
    const elapsed = () =>
      (elapsedByDocument.get(documentKey) ?? 0) +
      (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt));
    const stop = () => {
      elapsedByDocument.set(documentKey, elapsed());
      startedAt = null;
    };
    const update = (active: boolean) => {
      if (running && active) {
        if (startedAt === null) startedAt = Date.now();
      } else stop();
      setSeconds(Math.floor(elapsed() / 1000));
    };
    update(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state =>
      update(state === 'active'),
    );
    const timer = setInterval(() => {
      if (startedAt !== null) setSeconds(Math.floor(elapsed() / 1000));
    }, 1000);
    return () => {
      stop();
      clearInterval(timer);
      subscription.remove();
    };
  }, [documentKey, running, elapsedByDocument]);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60,
  ).padStart(2, '0')}`;
  return (
    <View style={styles.timer}>
      <Text style={styles.label}>Thời gian làm bài</Text>
      <Text
        testID="writing-elapsed-time"
        accessibilityLabel={`Thời gian làm bài ${time}`}
        style={styles.time}
      >
        {time}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  timer: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.muted },
  time: {
    ...typography.title,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
  },
});

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { flashcardService } from '../services/flashcardService';
import { colors, spacing, typography } from '../theme/theme';

export function FavoriteWordButton({
  source,
  id,
  word,
  sessionId,
  disabled = false,
}: (
  | { source: 'lesson' | 'dictionary'; sessionId?: never }
  | { source: 'session'; sessionId: string }
) & {
  id: string;
  word: string;
  disabled?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const changes = useRef(0);
  useEffect(() => {
    let active = true;
    setSaved(false);
    const before = changes.current;
    const read =
      source === 'session'
        ? flashcardService.sessionFavorite(sessionId, id)
        : flashcardService.favorite(source, id);
    read
      .then(result => {
        if (active && changes.current === before) setSaved(result.saved);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id, source, sessionId]);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${saved ? 'Bỏ yêu thích' : 'Yêu thích'} ${word}`}
        accessibilityState={{
          selected: saved,
          busy,
          disabled: busy || disabled,
        }}
        disabled={busy || disabled}
        style={styles.button}
        onPress={async () => {
          if (pending.current || disabled) return;
          changes.current += 1;
          pending.current = true;
          setBusy(true);
          setError('');
          try {
            const result =
              source === 'session'
                ? await flashcardService.setSessionFavorite(
                    sessionId,
                    id,
                    !saved,
                  )
                : await flashcardService.setFavorite(source, id, !saved);
            setSaved(result.saved);
          } catch {
            setError('Chưa lưu được. Thử lại.');
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.focus} />
        ) : (
          <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
            <Path
              d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"
              stroke={saved ? colors.focus : colors.muted}
              strokeWidth={1.7}
              strokeLinejoin="round"
              fill={saved ? colors.badgeBg : 'none'}
            />
          </Svg>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  error: { ...typography.caption, color: colors.danger, maxWidth: 150 },
});

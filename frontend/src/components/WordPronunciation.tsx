import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useVocabularyAudio } from '../hooks/useVocabularyAudio';
import { VolumeIcon, VolumeXIcon } from './icons';
import { colors, radius, typography } from '../theme/theme';

export function WordPronunciation({
  id,
  word,
  reading,
  active = true,
  audioId,
}: {
  id: string;
  word: string;
  reading?: string;
  active?: boolean;
  audioId?: string;
}) {
  const audio = useVocabularyAudio(id);
  const { stop } = audio;
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);
  const playing = audio.wordId !== null;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Dừng' : 'Nghe'} phát âm ${word}`}
        disabled={!active}
        onPress={() =>
          audio.toggle(audioId || id, word, reading, Boolean(audioId))
        }
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {audio.loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : playing ? (
          <VolumeXIcon size={22} color={colors.primary} />
        ) : (
          <VolumeIcon size={22} color={colors.primary} />
        )}
      </Pressable>
      {audio.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {audio.error.message}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
  error: { ...typography.caption, color: colors.danger, maxWidth: 240 },
});

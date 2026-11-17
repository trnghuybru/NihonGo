import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import type { ConversationMessage } from '../services/speakingService';
import { speakingService } from '../services/speakingService';
import { colors, radius, spacing, typography } from '../theme/theme';

const labels = ['Ý tưởng', 'Từ vựng & cấu trúc', 'Câu mẫu'] as const;

export function SpeakingGuidedHints({ sessionId, messages, active, initialHintCount = 0 }: {
  sessionId: string;
  messages: ConversationMessage[];
  active: boolean;
  initialHintCount?: number;
}) {
  const last = messages.at(-1);
  const messageId = active && last?.speaker === 'assistant' && last.status === 'completed'
    && last.content.trim() ? last.id : null;
  const [hints, setHints] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usedCount, setUsedCount] = useState(initialHintCount);
  const currentMessage = useRef(messageId);
  currentMessage.current = messageId;
  useEffect(() => {
    setHints([]);
    setError('');
    setLoading(false);
  }, [messageId]);
  if (!messageId) return null;
  const nextLevel = (hints.length + 1) as 1 | 2 | 3;
  const load = async () => {
    if (loading || nextLevel > 3) return;
    setLoading(true);
    setError('');
    try {
      let response = await speakingService.hint(sessionId, messageId, nextLevel);
      for (let attempt = 0; response.status === 'processing' && attempt < 8; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await speakingService.hint(sessionId, messageId, nextLevel);
      }
      if (!response.text) throw new Error('Gợi ý đang được tạo. Vui lòng thử lại.');
      if (currentMessage.current !== messageId) return;
      setHints(current => [...current, response.text!]);
      setUsedCount(response.hint_count ?? usedCount);
    } catch (failure) {
      if (currentMessage.current === messageId) setError(errorMessage(failure));
    } finally {
      if (currentMessage.current === messageId) setLoading(false);
    }
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Gợi ý cho câu hỏi vừa rồi</Text>
      <Text style={styles.note}>Chỉ mở khi cần · đã dùng trong {usedCount} lượt</Text>
      {hints.map((hint, index) => (
        <View key={index} style={styles.hint}>
          <Text style={styles.label}>{labels[index]}</Text>
          <Text style={styles.text}>{hint}</Text>
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hints.length < 3 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Xem gợi ý ${labels[hints.length]}`}
          accessibilityState={{ disabled: loading }} disabled={loading} onPress={load}
          style={styles.button}>
          {loading ? <ActivityIndicator size="small" color={colors.primaryText} /> :
            <Text style={styles.buttonText}>💡 Xem {labels[hints.length].toLowerCase()}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: spacing.md, padding: spacing.md, borderRadius: radius.small,
    backgroundColor: colors.surfaceTint, gap: spacing.sm },
  title: { ...typography.heading, color: colors.primaryText },
  note: { ...typography.caption, color: colors.muted },
  hint: { gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  label: { ...typography.caption, color: colors.primaryText },
  text: { ...typography.body, color: colors.body },
  error: { ...typography.caption, color: colors.danger },
  button: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.small, borderWidth: 1, borderColor: colors.border },
  buttonText: { ...typography.caption, color: colors.primaryText },
});

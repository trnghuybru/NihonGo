import { useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ConversationMessage } from '../services/speakingService';
import type { SpeakingPresentation } from '../hooks/useSpeakingPresentation';
import { colors, radius, spacing, typography } from '../theme/theme';

interface Message {
  id: string;
  speaker: 'user' | 'assistant';
  content: string;
}
export function SpeakingMessages({
  messages,
  presentation,
}: {
  messages: ConversationMessage[];
  presentation: SpeakingPresentation;
}) {
  const list = useRef<FlatList<Message>>(null);
  const items = useMemo(() => {
    const rows: Message[] = messages.map(({ id, speaker, content }) => ({
      id,
      speaker,
      content,
    }));
    const tail = messages.at(-1);
    const saved =
      ['user_turn', 'transition_to_user'].includes(presentation.phase) &&
      tail?.speaker === 'assistant' &&
      tail.content.trim() === presentation.assistant.trim() &&
      messages.at(-2)?.content.trim() === presentation.user.trim();
    if (!saved) {
      if (presentation.user)
        rows.push({
          id: 'live-user',
          speaker: 'user',
          content: presentation.user,
        });
      if (presentation.assistant)
        rows.push({
          id: 'live-assistant',
          speaker: 'assistant',
          content: presentation.assistant,
        });
    }
    return rows;
  }, [messages, presentation.user, presentation.assistant, presentation.phase]);
  const scroll = () =>
    list.current?.scrollToEnd({ animated: presentation.motion === 'full' });
  return (
    <FlatList
      ref={list}
      testID="speaking-messages"
      data={items}
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={scroll}
      onLayout={scroll}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View
          style={[
            styles.bubble,
            item.speaker === 'user' ? styles.user : styles.ai,
          ]}
        >
          <Text style={styles.label}>
            {item.speaker === 'user' ? 'Bạn' : 'Aoi'}
          </Text>
          <Text
            selectable
            accessibilityLiveRegion={
              item.id.startsWith('live-') ? 'polite' : 'none'
            }
            aria-live={item.id.startsWith('live-') ? 'polite' : 'off'}
            accessibilityLabel={item.content}
            style={styles.text}
          >
            {item.content || 'Đang nhận phản hồi…'}
          </Text>
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>Bắt đầu trò chuyện cùng Aoi.</Text>
      }
    />
  );
}
const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 0 },
  content: { paddingVertical: spacing.sm, gap: spacing.sm },
  bubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: radius.input,
    gap: spacing.xs,
  },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  user: { alignSelf: 'flex-end', backgroundColor: colors.badgeBg },
  label: { ...typography.caption, color: colors.muted },
  text: { ...typography.input, color: colors.dark },
  empty: { ...typography.caption, color: colors.muted, padding: spacing.md },
});

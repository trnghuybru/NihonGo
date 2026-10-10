import {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  AudioAsset,
  ConversationMessage,
  EvaluationResult,
  SentenceFeedback,
} from '../services/speakingService';
import type { SpeakingPresentation } from '../hooks/useSpeakingPresentation';
import { colors, radius, spacing, typography } from '../theme/theme';
import { VolumeIcon, VolumeXIcon } from './icons';
import { MessageFeedback } from './MessageFeedback';
import { HomeFeatureIcon } from './HomeFeatureIcon';

interface Message {
  id: string;
  speaker: 'user' | 'assistant';
  content: string;
  audio?: AudioAsset | null;
  status?: ConversationMessage['status'];
}
export function SpeakingMessages({
  messages,
  presentation,
  replay,
  review = false,
  feedback,
  header,
  footer,
  focusRequest,
  feedbackControls,
}: {
  messages: ConversationMessage[];
  presentation: SpeakingPresentation;
  review?: boolean;
  feedback?: EvaluationResult['items'];
  header?: ReactElement;
  footer?: ReactElement;
  focusRequest?: { id: string; request: number } | null;
  feedbackControls?: {
    states: Record<string, SentenceFeedback>;
    request: (id: string) => void;
  };
  replay?: {
    messageId: string | null;
    loading: boolean;
    disabled: boolean;
    toggle: (
      messageId: string,
      assetId: string,
      normalizeMicrophone: boolean,
    ) => void;
  };
}) {
  const list = useRef<FlatList<Message>>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );
  const feedbackById = useMemo(() => {
    const grouped = new Map<string, EvaluationResult['items']>();
    for (const item of feedback || []) {
      const group = grouped.get(item.message_id) || [];
      group.push(item);
      grouped.set(item.message_id, group);
    }
    return grouped;
  }, [feedback]);
  const toggleFeedback = useCallback((id: string) => {
    setExpandedId(previous => (previous === id ? null : id));
  }, []);
  const items = useMemo(() => {
    const rows: Message[] = messages.map(
      ({ id, speaker, content, audio, status }) => ({
        id,
        speaker,
        content,
        audio,
        status,
      }),
    );
    const tail = messages.at(-1);
    const saved =
      ['user_turn', 'transition_to_user'].includes(presentation.phase) &&
      tail?.speaker === 'assistant' &&
      tail.content.trim() === presentation.assistant.trim() &&
      messages.at(-2)?.content.trim() === presentation.user.trim();
    if (!review && !saved) {
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
  }, [
    messages,
    presentation.user,
    presentation.assistant,
    presentation.phase,
    review,
  ]);
  useEffect(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retries.current = 0;
    if (!focusRequest) return;
    const index = items.findIndex(item => item.id === focusRequest.id);
    if (index < 0) return;
    setExpandedId(focusRequest.id);
    retryTimer.current = setTimeout(() => {
      list.current?.scrollToIndex({
        index,
        animated: false,
        viewPosition: 0.15,
      });
    }, 50);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [focusRequest, items]);
  const scroll = useCallback(() => {
    if (!review && !expandedId)
      list.current?.scrollToEnd({ animated: presentation.motion === 'full' });
  }, [review, presentation.motion, expandedId]);
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
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        if (retries.current++ >= 3) return;
        list.current?.scrollToOffset({
          offset: averageItemLength * index,
          animated: false,
        });
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          list.current?.scrollToIndex({
            index,
            animated: false,
            viewPosition: 0.15,
          });
        }, 100);
      }}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.messageGroup}>
          <View
            style={[
              styles.message,
              item.speaker === 'user' ? styles.userMessage : styles.aiMessage,
            ]}
          >
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
            {item.audio && replay ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${
                  replay.messageId === item.id ? 'Dừng' : 'Nghe lại'
                } ${item.speaker === 'user' ? 'giọng của bạn' : 'giọng Aoi'}`}
                accessibilityState={{
                  disabled: replay.disabled,
                  busy: replay.messageId === item.id && replay.loading,
                  selected: replay.messageId === item.id,
                }}
                disabled={replay.disabled}
                onPress={() =>
                  replay.toggle(
                    item.id,
                    item.audio!.id,
                    item.speaker === 'user',
                  )
                }
                style={({ pressed }) => [
                  styles.audioButton,
                  replay.messageId === item.id ? styles.audioActive : null,
                  pressed && !replay.disabled ? styles.audioPressed : null,
                ]}
              >
                {replay.messageId === item.id && replay.loading ? (
                  <ActivityIndicator size="small" color={colors.primaryText} />
                ) : replay.messageId === item.id ? (
                  <VolumeXIcon
                    size={18}
                    color={
                      replay.disabled ? colors.disabledText : colors.primaryText
                    }
                  />
                ) : (
                  <VolumeIcon
                    size={18}
                    color={replay.disabled ? colors.disabledText : colors.muted}
                  />
                )}
              </Pressable>
            ) : null}
            {feedbackControls &&
            item.speaker === 'user' &&
            item.status === 'completed' &&
            item.content.trim() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Nhận xét câu: ${item.content}`}
                accessibilityState={{
                  expanded: expandedId === item.id,
                  busy:
                    feedbackControls.states[item.id]?.status === 'processing',
                }}
                onPress={() => {
                  toggleFeedback(item.id);
                  if (expandedId !== item.id) feedbackControls.request(item.id);
                }}
                style={styles.audioButton}
              >
                <HomeFeatureIcon
                  name="lightbulb"
                  size={18}
                  color={
                    expandedId === item.id ? colors.badgeText : colors.muted
                  }
                />
              </Pressable>
            ) : null}
          </View>
          {feedbackControls && expandedId === item.id ? (
            <View
              style={styles.sentencePanel}
              testID={`sentence-feedback-${item.id}`}
            >
              {feedbackControls.states[item.id]?.status === 'processing' ? (
                <View style={styles.feedbackLoading}>
                  <ActivityIndicator size="small" color={colors.badgeText} />
                  <Text style={styles.empty}>Đang nhận xét câu này…</Text>
                </View>
              ) : feedbackControls.states[item.id]?.status === 'failed' ? (
                <>
                  <Text style={styles.feedbackText}>
                    {feedbackControls.states[item.id]?.error ||
                      'Chưa nhận xét được câu này.'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Thử nhận xét lại"
                    onPress={() => feedbackControls.request(item.id)}
                    style={styles.retry}
                  >
                    <Text style={styles.feedbackText}>Thử lại</Text>
                  </Pressable>
                </>
              ) : feedbackControls.states[item.id]?.result ? (
                <>
                  <Text style={styles.feedbackText}>
                    {feedbackControls.states[item.id].result!.summary}
                  </Text>
                  {feedbackControls.states[item.id].result!.items.length ? (
                    <MessageFeedback
                      messageId={item.id}
                      items={feedbackControls.states[item.id].result!.items}
                      expanded
                      onToggle={toggleFeedback}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}
          {!feedbackControls &&
          item.speaker === 'user' &&
          feedbackById.has(item.id) ? (
            <MessageFeedback
              messageId={item.id}
              items={feedbackById.get(item.id)!}
              expanded={expandedId === item.id}
              onToggle={toggleFeedback}
            />
          ) : null}
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {review
            ? 'Chưa có tin nhắn để hiển thị.'
            : 'Bắt đầu trò chuyện cùng Aoi.'}
        </Text>
      }
    />
  );
}
const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 0 },
  content: { paddingVertical: spacing.sm, gap: spacing.sm },
  messageGroup: { gap: spacing.xs },
  sentencePanel: { gap: spacing.sm, alignItems: 'flex-end' },
  feedbackText: {
    ...typography.input,
    color: colors.body,
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
  },
  feedbackLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  retry: { minHeight: 48, justifyContent: 'center' },
  message: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  userMessage: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  aiMessage: { alignSelf: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    flexShrink: 1,
    padding: spacing.md,
    borderRadius: radius.input,
    gap: spacing.xs,
  },
  ai: { backgroundColor: colors.surface },
  user: { backgroundColor: colors.badgeBg },
  label: { ...typography.caption, color: colors.muted },
  text: { ...typography.input, color: colors.dark },
  empty: { ...typography.caption, color: colors.muted, padding: spacing.md },
  audioButton: {
    flexShrink: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioActive: { backgroundColor: colors.badgeBg },
  audioPressed: { backgroundColor: colors.surface },
});

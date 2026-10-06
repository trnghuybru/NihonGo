import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { MISSING_DATA } from '../config/content';
import { useConversation } from '../hooks/useConversation';
import {
  ConversationMessage,
  StartedSession,
} from '../services/speakingService';
import { ttsService } from '../services/ttsService';
import { voiceService } from '../services/voiceService';
import { colors, layout, spacing, typography } from '../theme/theme';

const messageKey = (message: ConversationMessage) => message.id;
const MessageRow = memo(function MessageRowView({
  message,
  roleName,
}: {
  message: ConversationMessage;
  roleName: string;
}) {
  return (
    <View
      accessibilityLabel={`${message.speaker === 'user' ? 'Bạn' : roleName}: ${
        message.content
      }`}
      style={[
        styles.message,
        message.speaker === 'user' ? styles.userMessage : styles.aiMessage,
      ]}
    >
      <Text selectable style={styles.content}>
        {message.content || MISSING_DATA}
      </Text>
      {message.status !== 'completed' ? (
        <Text style={styles.hint}>
          {message.status === 'pending'
            ? 'Đang chờ phản hồi'
            : 'Chưa nhận được phản hồi'}
        </Text>
      ) : null}
    </View>
  );
});

export function ConversationScreen({
  result,
  onBack,
}: {
  result: StartedSession;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const chat = useConversation(result.session.id);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'text' | 'voice'>(
    result.session.current_input_mode,
  );
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const capture = useRef(false);
  const openingMic = useRef(false);
  const ttsReady = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const list = useRef<FlatList<ConversationMessage>>(null);
  useEffect(() => {
    mounted.current = true;
    voiceService.init({
      onStart: () => {
        if (mounted.current && capture.current) setListening(true);
      },
      onEnd: () => {
        if (mounted.current) setListening(false);
      },
      onError: message => {
        capture.current = false;
        if (mounted.current) {
          setListening(false);
          setVoiceError(message);
        }
      },
      onPartialResults: text => {
        if (mounted.current && capture.current) setDraft(text.slice(0, 2000));
      },
      onFinalResults: text => {
        if (mounted.current && capture.current) {
          setDraft(text.slice(0, 2000));
          setListening(false);
          capture.current = false;
        }
      },
    });
    ttsReady.current = ttsService
      .init(value => {
        if (mounted.current) setSpeaking(value);
      })
      .then(() => {
        if (mounted.current)
          return ttsService.setLanguage(result.scenario.language_code);
      });
    return () => {
      mounted.current = false;
      capture.current = false;
      voiceService.cancel();
      voiceService.destroy();
      ttsService.stop();
    };
  }, [result.scenario.language_code]);

  const read = useCallback(async (text: string) => {
    if (!ttsService.isAvailable()) {
      setVoiceError(
        'Thiết bị chưa hỗ trợ đọc câu trả lời. Bạn vẫn có thể đọc văn bản.',
      );
      return;
    }
    await ttsReady.current;
    if (!mounted.current || capture.current) return;
    ttsService.stop();
    ttsService.feedToken(text);
    ttsService.flush();
  }, []);
  const toggleMic = async () => {
    if (openingMic.current || chat.sending || chat.unresolved || chat.loading)
      return;
    setVoiceError('');
    if (listening) {
      await voiceService.stop();
      setListening(false);
      return;
    }
    if (!voiceService.isAvailable()) {
      setVoiceError(
        'Nhận dạng giọng nói chưa khả dụng trên thiết bị này. Hãy dùng chế độ văn bản.',
      );
      return;
    }
    openingMic.current = true;
    capture.current = true;
    ttsService.stop();
    try {
      await voiceService.start(result.scenario.language_code);
    } finally {
      openingMic.current = false;
    }
  };
  const changeMode = async (next: 'text' | 'voice') => {
    capture.current = false;
    await voiceService.cancel();
    ttsService.stop();
    if (mounted.current) {
      setListening(false);
      setVoiceError('');
      setMode(next);
    }
  };
  const send = async (retry = false) => {
    capture.current = false;
    await voiceService.cancel();
    if (!mounted.current) return;
    setListening(false);
    setVoiceError('');
    const reply = await chat.send(draft, mode, retry);
    if (reply && mounted.current) {
      setDraft('');
      if (mode === 'voice') read(reply.content);
    }
  };
  const renderMessage = useCallback(
    ({ item }: { item: ConversationMessage }) => (
      <MessageRow message={item} roleName={result.scenario.role.name} />
    ),
    [result.scenario.role.name],
  );
  const latestReply = [...chat.messages]
    .reverse()
    .find(
      item =>
        item.speaker === 'assistant' &&
        item.status === 'completed' &&
        item.content,
    );
  const disabled = chat.sending || chat.loading || !chat.ready || !chat.active;
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop:
              Platform.OS === 'android' ? insets.top + spacing.md : spacing.md,
          },
        ]}
      >
        <View style={styles.headingRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Danh sách tình huống"
            accessibilityState={{ disabled: chat.sending }}
            disabled={chat.sending}
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <View style={styles.headingCopy}>
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={styles.title}
            >
              {result.scenario.title}
            </Text>
            <Text style={styles.hint}>{result.scenario.role.name}</Text>
          </View>
        </View>
        <View style={styles.modeRow} accessibilityRole="radiogroup">
          {(['text', 'voice'] as const).map(item => (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityLabel={item === 'text' ? 'Văn bản' : 'Giọng nói'}
              accessibilityState={{
                checked: mode === item,
                disabled: chat.sending,
              }}
              disabled={chat.sending}
              onPress={() => changeMode(item)}
              style={[styles.mode, mode === item ? styles.selectedMode : null]}
            >
              <Text style={styles.speaker}>
                {item === 'text' ? 'Văn bản' : 'Giọng nói'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        ref={list}
        data={chat.messages}
        renderItem={renderMessage}
        keyExtractor={messageKey}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          list.current?.scrollToEnd({ animated: true })
        }
        ListEmptyComponent={
          chat.loading ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.content}>{MISSING_DATA}</Text>
          )
        }
        ListFooterComponent={
          chat.sending ? (
            <View style={styles.waiting}>
              <ActivityIndicator color={colors.primaryText} />
              <Text style={styles.hint}>Đang trả lời…</Text>
            </View>
          ) : undefined
        }
      />
      <View style={styles.composer}>
        <AuthNotice message={chat.error || voiceError} error />
        {!chat.active ? (
          <Text style={styles.hint}>Buổi hội thoại hiện không hoạt động.</Text>
        ) : null}
        {(!chat.ready && !chat.loading) || chat.unresolved ? (
          <AuthButton
            label="Tải lại hội thoại"
            variant="text"
            busy={chat.loading}
            disabled={chat.sending}
            onPress={async () => {
              const recovered = await chat.reload();
              if (recovered && mounted.current) {
                setDraft('');
                if (mode === 'voice') read(recovered.content);
              }
            }}
          />
        ) : null}
        {chat.unresolved ? (
          <AuthButton
            label={
              chat.retrySeconds > 0
                ? `Thử lại sau ${chat.retrySeconds} giây`
                : 'Thử lại'
            }
            busy={chat.sending}
            disabled={chat.loading || !chat.active || chat.retrySeconds > 0}
            onPress={() => send(true)}
          />
        ) : null}
        {mode === 'voice' ? (
          <View style={styles.voiceRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                listening ? 'Dừng thu giọng nói' : 'Bắt đầu thu giọng nói'
              }
              accessibilityState={{ disabled: disabled || chat.unresolved }}
              disabled={disabled || chat.unresolved}
              onPress={toggleMic}
              style={styles.microphone}
            >
              <HomeFeatureIcon
                name="microphone"
                color={listening ? colors.danger : colors.dark}
                size={20}
              />
              <Text style={styles.speaker}>
                {listening ? 'Dừng' : 'Bấm để nói'}
              </Text>
            </Pressable>
            {latestReply ? (
              <AuthButton
                label={speaking ? 'Dừng đọc' : 'Đọc lại câu trả lời'}
                variant="text"
                disabled={chat.sending || listening}
                onPress={() =>
                  speaking ? ttsService.stop() : read(latestReply.content)
                }
              />
            ) : null}
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel={
              mode === 'voice'
                ? 'Nội dung nhận dạng giọng nói'
                : 'Tin nhắn hội thoại'
            }
            placeholder={
              mode === 'voice'
                ? 'Nói rồi kiểm tra nội dung trước khi gửi'
                : 'Nhập tin nhắn'
            }
            multiline
            maxLength={2000}
            value={draft}
            onChangeText={setDraft}
            editable={!disabled && !chat.unresolved && !listening}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn"
            accessibilityState={{
              disabled:
                disabled || chat.unresolved || listening || !draft.trim(),
              busy: chat.sending,
            }}
            disabled={disabled || chat.unresolved || listening || !draft.trim()}
            onPress={() => send()}
            style={[
              styles.sendButton,
              disabled || chat.unresolved || listening || !draft.trim()
                ? styles.sendDisabled
                : null,
            ]}
          >
            {chat.sending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text
                style={[
                  styles.sendText,
                  disabled || chat.unresolved || listening || !draft.trim()
                    ? styles.sendTextDisabled
                    : null,
                ]}
              >
                Gửi
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: layout.screenGutter,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs },
  backButton: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.md,
  },
  backArrow: { fontSize: 32, color: colors.dark },
  title: { ...typography.title, color: colors.dark },
  hint: { ...typography.caption, color: colors.muted },
  modeRow: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
  },
  mode: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  selectedMode: { backgroundColor: colors.surfaceTint },
  messages: { padding: layout.screenGutter, gap: spacing.md, flexGrow: 1 },
  message: {
    maxWidth: '90%',
    padding: spacing.md,
    borderRadius: 16,
    gap: spacing.xs,
  },
  userMessage: { alignSelf: 'flex-end', backgroundColor: colors.badgeBg },
  aiMessage: { alignSelf: 'flex-start', backgroundColor: '#F5F5F4' },
  speaker: { ...typography.label, color: colors.dark },
  content: {
    ...typography.input,
    fontSize: 15,
    lineHeight: 23,
    color: colors.dark,
  },
  waiting: {
    padding: spacing.md,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  composer: {
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  input: {
    ...typography.input,
    flex: 1,
    color: colors.dark,
    minHeight: 48,
    maxHeight: 100,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  sendButton: {
    minHeight: layout.touchTarget,
    minWidth: 56,
    borderRadius: 12,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sendDisabled: { backgroundColor: colors.disabled },
  sendText: { ...typography.button, color: colors.onPrimary },
  sendTextDisabled: { color: colors.disabledText },
  microphone: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  voiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { AuthIcon } from '../components/AuthIcon';
import {
  SpeakingAvatar,
  useSpeakingAnimation,
} from '../components/SpeakingStage';
import { useSpeakingPresentation } from '../hooks/useSpeakingPresentation';
import { SpeakingMessages } from '../components/SpeakingMessages';
import { SpeakingMicrophone } from '../components/SpeakingMicrophone';
import {
  EyeIcon,
  EyeOffIcon,
  KeyboardIcon,
  MicIcon,
} from '../components/icons';
import { phaseLabels } from '../components/SpeakingStage';
import { useConversation } from '../hooks/useConversation';
import { useAudioReplay } from '../hooks/useAudioReplay';
import { useSentenceFeedback } from '../hooks/useSentenceFeedback';
import { GeminiLiveService } from '../services/geminiLiveService';
import { StartedSession, speakingService } from '../services/speakingService';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import { ConversationEvaluationScreen } from './ConversationEvaluationScreen';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

export function ConversationScreen({
  result,
  onBack,
}: {
  result: StartedSession;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const chat = useConversation(result.session.id);
  const replay = useAudioReplay(result.session.id);
  const sentenceFeedback = useSentenceFeedback(result.session.id);
  const client = useRef<GeminiLiveService | null>(null);
  const lifecycle = useRef(0);
  const openingRequested = useRef(false);
  const { presentation, dispatch } = useSpeakingPresentation();
  const { phase } = presentation;
  const { handoff } = useSpeakingAnimation(presentation);
  const { height } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState(height);
  const avatarHeight = Math.round(contentHeight * 0.55);
  const [draft, setDraft] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [finished, setFinished] = useState(
    result.session.status === 'completed',
  );
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [showEvaluation, setShowEvaluation] = useState(false);
  const finishingRef = useRef(false);
  const active = chat.active && !finished;
  const reload = useRef(chat.reload);
  useEffect(() => {
    reload.current = chat.reload;
  }, [chat.reload]);
  const connect = useCallback(async () => {
    const generation = ++lifecycle.current;
    dispatch({ type: 'transport', value: 'connecting' });
    const previous = client.current;
    client.current = null;
    await previous?.close();
    if (generation !== lifecycle.current) return;
    const current = () => generation === lifecycle.current;
    const live = new GeminiLiveService(result.session.id, {
      onState: value => {
        if (current()) dispatch({ type: 'transport', value });
      },
      onPlaying: value => {
        if (current()) dispatch({ type: 'playback', value });
      },
      onError: message => {
        if (current()) dispatch({ type: 'error', message });
      },
      onMicLevel: level => {
        if (current()) dispatch({ type: 'mic_level', level });
      },
      onTranscript: (user, assistant) => {
        if (!current()) return;
        dispatch({ type: 'transcript', user, assistant });
      },
      onSaved: () => {
        if (current()) reload.current();
      },
    });
    client.current = live;
    const connected = await live.connect(
      openingRequested.current ? undefined : result.opening_message?.content,
      result.opening_message?.id,
    );
    if (connected && current()) openingRequested.current = true;
  }, [
    result.session.id,
    result.opening_message?.content,
    result.opening_message?.id,
    dispatch,
  ]);
  useEffect(() => {
    if (!chat.ready || !active) return;
    connect();
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background') {
        client.current?.interrupt();
        dispatch({
          type: 'error',
          message:
            'Hội thoại đã dừng khi app chuyển nền. Kết nối lại để tiếp tục.',
        });
      }
    });
    return () => {
      lifecycle.current += 1;
      subscription.remove();
      client.current?.close();
    };
  }, [chat.ready, active, connect, dispatch]);
  const replayAllowed =
    !active || ['idle', 'user_turn', 'error'].includes(phase);
  const stopReplay = replay.stop;
  useEffect(() => {
    if (!replayAllowed) stopReplay();
  }, [replayAllowed, stopReplay]);
  const replayControls = { ...replay, disabled: !replayAllowed };
  const ready =
    phase === 'user_turn' &&
    presentation.transport === 'ready' &&
    active &&
    !finishing &&
    !chat.loading &&
    !replay.messageId;
  const micLabel =
    phase === 'user_speaking'
      ? 'Đang thu âm, thả để gửi'
      : phase === 'user_turn'
      ? 'Giữ để nói'
      : phase === 'ai_speaking'
      ? 'Micro tạm khóa khi AI đang nói'
      : phase === 'error'
      ? 'Micro không khả dụng, hãy thử lại'
      : 'Micro đang chờ kết nối hoặc phản hồi';
  const unsaved = client.current?.hasUnsavedTurn() || false;
  const canLeave =
    ![
      'user_speaking',
      'ai_speaking',
      'transition_to_user',
      'processing',
    ].includes(phase) &&
    !unsaved &&
    !finishing;
  const finish = async () => {
    if (
      !canLeave ||
      chat.loading ||
      !chat.ready ||
      chat.unresolved ||
      finishingRef.current
    )
      return;
    finishingRef.current = true;
    setFinishing(true);
    setFinishError('');
    replay.stop();
    try {
      await speakingService.finish(result.session.id);
      setFinished(true);
      lifecycle.current += 1;
      await client.current?.close().catch(() => undefined);
      client.current = null;
      setShowTranscript(true);
      chat.reload();
    } catch (failure) {
      setFinishError(errorMessage(failure));
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (canLeave) onBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canLeave, onBack]);
  const send = () => {
    if (client.current?.sendText(draft)) setDraft('');
  };
  const toolbar = (
    <View pointerEvents="box-none" style={styles.taskToolbar}>
      <View style={styles.conversationControls}>
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Cách trò chuyện"
          style={styles.modeRow}
        >
          {(['voice', 'text'] as const).map(mode => (
            <Pressable
              key={mode}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityRole="tab"
              accessibilityLabel={
                mode === 'voice' ? 'Chế độ nói' : 'Chế độ nhắn tin'
              }
              accessibilityState={{
                selected: inputMode === mode,
                disabled: !canLeave,
              }}
              disabled={!canLeave}
              onPress={() => setInputMode(mode)}
              style={({ pressed }) => [
                styles.modeButton,
                inputMode === mode ? styles.modeSelected : null,
                pressed ? styles.modePressed : null,
                !canLeave ? styles.modeDisabled : null,
              ]}
            >
              {mode === 'voice' ? (
                <MicIcon
                  size={16}
                  color={
                    !canLeave
                      ? colors.disabledText
                      : inputMode === mode
                      ? colors.primaryText
                      : colors.muted
                  }
                />
              ) : (
                <KeyboardIcon
                  size={16}
                  color={
                    !canLeave
                      ? colors.disabledText
                      : inputMode === mode
                      ? colors.primaryText
                      : colors.muted
                  }
                />
              )}
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showTranscript ? 'Hiện Aoi' : 'Ẩn Aoi'}
          accessibilityHint={
            showTranscript
              ? 'Hiện lại nhân vật phía trên hội thoại'
              : 'Ẩn nhân vật để mở rộng vùng chat'
          }
          accessibilityState={{ selected: showTranscript }}
          onPress={() => setShowTranscript(value => !value)}
          style={({ pressed }) => [
            styles.transcriptButton,
            pressed ? styles.iconPressed : null,
          ]}
        >
          {showTranscript ? (
            <EyeIcon size={20} color={colors.badgeText} />
          ) : (
            <EyeOffIcon size={20} color={colors.muted} />
          )}
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Xem nhiệm vụ"
        accessibilityHint="Mở bối cảnh, nhiệm vụ và vai AI"
        onPress={() => setShowBriefing(true)}
        style={({ pressed }) => [
          styles.taskButton,
          pressed ? styles.taskPressed : null,
        ]}
      >
        <View style={styles.taskCircle}>
          <HomeFeatureIcon name="lightbulb" size={24} color={colors.muted} />
        </View>
      </Pressable>
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lịch sử hội thoại"
          accessibilityState={{ disabled: !canLeave }}
          disabled={!canLeave}
          onPress={onBack}
          style={styles.back}
        >
          <AuthIcon name="back" color={colors.dark} />
        </Pressable>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{result.scenario.title}</Text>
          <Text style={styles.hint}>Aoi · {result.scenario.role.name}</Text>
        </View>
        {active ? (
          <AuthButton
            label="Kết thúc"
            variant="text"
            busy={finishing}
            disabled={
              !canLeave || chat.loading || !chat.ready || chat.unresolved
            }
            onPress={finish}
          />
        ) : (
          <Text style={styles.hint}>Đã kết thúc</Text>
        )}
      </View>
      <View
        testID="speaking-content"
        style={styles.content}
        onLayout={event => setContentHeight(event.nativeEvent.layout.height)}
      >
        {showTranscript ? (
          toolbar
        ) : (
          <SpeakingAvatar
            presentation={presentation}
            height={avatarHeight}
            handoff={handoff}
            toolbar={toolbar}
          />
        )}
        <View style={styles.messageArea}>
          <Text style={styles.chatStatus} accessibilityLiveRegion="polite">
            {active ? phaseLabels[phase] : 'Phiên này chỉ xem lại'}
          </Text>
          <SpeakingMessages
            messages={chat.messages}
            presentation={presentation}
            replay={replayControls}
            feedbackControls={sentenceFeedback}
          />
        </View>
      </View>
      <View style={styles.composer}>
        <AuthNotice
          message={
            finishError ||
            (active ? presentation.error : '') ||
            chat.error ||
            replay.error
          }
          error
        />
        {chat.error ? (
          <AuthButton
            label="Tải lại hội thoại"
            variant="text"
            onPress={() => chat.reload()}
          />
        ) : null}
        {active &&
        (phase === 'error' ||
          (phase === 'idle' &&
            presentation.transport !== 'connecting' &&
            chat.ready)) ? (
          <AuthButton
            label={unsaved ? 'Thử lưu lại' : 'Kết nối lại'}
            variant="outline"
            onPress={() => {
              if (unsaved) client.current?.retrySave();
              else connect();
            }}
          />
        ) : null}
        {unsaved && phase === 'error' ? (
          <AuthButton
            label="Bỏ lượt chưa lưu"
            variant="text"
            onPress={() => {
              client.current?.discardUnsavedTurn();
              connect();
            }}
          />
        ) : null}
        {!active && (finished || chat.status === 'completed') ? (
          <AuthButton
            label="Xem điểm & nhận xét"
            variant="outline"
            onPress={() => {
              replay.stop();
              setShowEvaluation(true);
            }}
          />
        ) : !active ? null : inputMode === 'voice' ? (
          <View style={styles.voiceControls}>
            <SpeakingMicrophone
              presentation={presentation}
              ready={ready}
              label={micLabel}
              onPressIn={() => {
                client.current?.startSpeaking();
              }}
              onPressOut={() => {
                client.current?.stopSpeaking();
              }}
            />
            {['transition_to_user', 'user_turn', 'user_speaking'].includes(
              phase,
            ) ? (
              <Text style={styles.hint}>{micLabel}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Tin nhắn hội thoại"
              placeholder="Nhập tin nhắn…"
              placeholderTextColor={colors.placeholder}
              multiline
              maxLength={2000}
              value={draft}
              onChangeText={setDraft}
              editable={ready}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gửi tin nhắn"
              accessibilityState={{ disabled: !ready || !draft.trim() }}
              disabled={!ready || !draft.trim()}
              onPress={send}
              style={[
                styles.send,
                !ready || !draft.trim() ? styles.disabled : null,
              ]}
            >
              <AuthIcon
                name="arrow"
                color={
                  !ready || !draft.trim()
                    ? colors.disabledText
                    : colors.onPrimary
                }
              />
            </Pressable>
          </View>
        )}
      </View>
      {showEvaluation ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowEvaluation(false)}
        >
          <ConversationEvaluationScreen
            sessionId={result.session.id}
            title={result.scenario.title}
            onTranscript={() => setShowEvaluation(false)}
            onBack={onBack}
          />
        </Modal>
      ) : null}
      {showBriefing ? (
        <Modal
          transparent
          visible
          animationType={presentation.motion === 'reduced' ? 'fade' : 'slide'}
          onRequestClose={() => setShowBriefing(false)}
        >
          <View
            style={[
              styles.backdrop,
              {
                paddingTop: insets.top + spacing.lg,
                paddingBottom: insets.bottom + spacing.lg,
              },
            ]}
          >
            <View accessibilityViewIsModal style={styles.taskSheet}>
              <Text style={styles.title}>Nhiệm vụ của bạn</Text>
              <ScrollView contentContainerStyle={styles.briefing}>
                <Text style={styles.body}>{result.scenario.context}</Text>
                <Text style={styles.body}>
                  {result.scenario.learning_objectives}
                </Text>
                <Text style={styles.label}>
                  AI đóng vai · {result.scenario.role.name}
                </Text>
                <Text style={styles.hint}>
                  {result.scenario.role.description}
                </Text>
              </ScrollView>
              <AuthButton
                label="Đóng nhiệm vụ"
                variant="text"
                onPress={() => setShowBriefing(false)}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
  },
  messageArea: { flex: 1, minHeight: 0, paddingTop: spacing.md },
  chatStatus: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  taskToolbar: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  conversationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconPressed: { opacity: 0.55 },
  transcriptButton: {
    width: layout.touchTarget,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskPressed: { backgroundColor: colors.track },
  taskCircle: { opacity: 0.6 },
  taskSheet: {
    maxHeight: '75%',
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: 88,
    flexShrink: 1,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.track,
  },
  modeButton: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  modeSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryText,
    boxShadow: shadowSm,
  },
  modePressed: { backgroundColor: colors.badgeBg },
  modeDisabled: {
    backgroundColor: colors.disabled,
    borderColor: colors.disabled,
  },
  voiceControls: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  header: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.md,
  },
  back: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: { flex: 1, gap: spacing.xs },
  title: { ...typography.title, color: colors.dark },
  label: { ...typography.label, color: colors.dark },
  body: { ...typography.input, color: colors.body },
  hint: { ...typography.caption, color: colors.muted },
  briefing: { padding: spacing.lg, gap: spacing.sm },
  composer: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    ...typography.input,
    flex: 1,
    minWidth: 0,
    minHeight: layout.inputHeight,
    maxHeight: 100,
    padding: spacing.md,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    color: colors.inputText,
    borderWidth: 1,
    borderColor: colors.border,
  },
  send: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { backgroundColor: colors.disabled },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(37,37,38,0.24)',
    paddingHorizontal: layout.screenGutter,
    justifyContent: 'center',
  },
  sheet: {
    height: '85%',
    maxWidth: layout.maxContentWidth,
    width: '100%',
    alignSelf: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.lg,
  },
});

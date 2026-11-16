import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
import { AppBackground } from '../components/AppBackground';
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
import { speakingTtsExperiment } from '../config/speakingExperiment';
import { TtsConversationService } from '../services/ttsConversationService';
import { GeminiLiveService } from '../services/geminiLiveService';
import { StartedSession, speakingService } from '../services/speakingService';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import { betaLiveWeb, betaWeb } from '../config/beta';
import { BetaTextConversationScreen } from './BetaTextConversationScreen';
import { ConversationEvaluationScreen } from './ConversationEvaluationScreen';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

const MAX_LOCAL_AUDIO_REPLAYS = 20;
type ConversationScreenProps = {
  result: StartedSession;
  onBack: () => void;
  renderDesktopWorkspace?: (stage: ReactNode, chat: ReactNode) => ReactNode;
  onAvatarChange?: (state: { isSpeaking: boolean; emotion: string }) => void;
  onNavigationAvailabilityChange?: (available: boolean) => void;
};

export function ConversationScreen({
  result,
  onBack,
  renderDesktopWorkspace,
  onAvatarChange,
  onNavigationAvailabilityChange,
}: ConversationScreenProps) {
  if (!speakingTtsExperiment && betaWeb && !betaLiveWeb)
    return (
      <BetaTextConversationScreen
        result={result}
        onBack={onBack}
        renderDesktopWorkspace={renderDesktopWorkspace}
        onAvatarChange={onAvatarChange}
        onNavigationAvailabilityChange={onNavigationAvailabilityChange}
      />
    );
  return (
    <LiveConversationScreen
      result={result}
      onBack={onBack}
      renderDesktopWorkspace={renderDesktopWorkspace}
      onAvatarChange={onAvatarChange}
      onNavigationAvailabilityChange={onNavigationAvailabilityChange}
    />
  );
}

function LiveConversationScreen({
  result,
  onBack,
  renderDesktopWorkspace,
  onAvatarChange,
  onNavigationAvailabilityChange,
}: ConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const navigationInset = useBottomNavigationInset();
  const chat = useConversation(result.session.id);
  const replay = useAudioReplay(result.session.id);
  const [localAudioUrls, setLocalAudioUrls] = useState<Record<string, string>>(
    {},
  );
  const localAudioUrlMap = useRef(new Map<string, string>());
  const sentenceFeedback = useSentenceFeedback(result.session.id);
  const client = useRef<GeminiLiveService | TtsConversationService | null>(
    null,
  );
  const [emotion, setEmotion] = useState('neutral');
  const lifecycle = useRef(0);
  const openingRequested = useRef(false);
  const { presentation, dispatch } = useSpeakingPresentation();
  const { phase } = presentation;
  const isSpeaking = phase === 'ai_speaking';
  useEffect(() => {
    onAvatarChange?.({ isSpeaking, emotion });
  }, [isSpeaking, emotion, onAvatarChange]);
  useEffect(
    () => () => onAvatarChange?.({ isSpeaking: false, emotion: 'neutral' }),
    [onAvatarChange],
  );
  const { handoff } = useSpeakingAnimation(presentation);
  const { height, width } = useWindowDimensions();
  const desktop =
    Boolean(renderDesktopWorkspace) || (Platform.OS === 'web' && width >= 900);
  const [contentHeight, setContentHeight] = useState(height);
  const avatarHeight = desktop
    ? Math.max(280, Math.min(560, contentHeight - 180))
    : Math.round(contentHeight * 0.55);
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
    const callbacks: import('../services/geminiLiveService').LiveCallbacks = {
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
    };
    const rememberUserAudio = (messageId: string, wav: Uint8Array) => {
      if (!current()) return;
      const previous = localAudioUrlMap.current.get(messageId);
      if (previous) URL.revokeObjectURL(previous);
      const url = URL.createObjectURL(
        new Blob([wav.slice().buffer], { type: 'audio/wav' }),
      );
      localAudioUrlMap.current.set(messageId, url);
      while (localAudioUrlMap.current.size > MAX_LOCAL_AUDIO_REPLAYS) {
        const oldest = localAudioUrlMap.current.keys().next().value;
        if (oldest === undefined) break;
        const expired = localAudioUrlMap.current.get(oldest);
        localAudioUrlMap.current.delete(oldest);
        if (expired) URL.revokeObjectURL(expired);
      }
      setLocalAudioUrls(Object.fromEntries(localAudioUrlMap.current));
    };
    const live = speakingTtsExperiment
      ? new TtsConversationService(
          result.session.id,
          callbacks,
          setEmotion,
          rememberUserAudio,
        )
      : new GeminiLiveService(result.session.id, callbacks);
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
  useEffect(
    () => () => {
      localAudioUrlMap.current.forEach(url => URL.revokeObjectURL(url));
      localAudioUrlMap.current.clear();
    },
    [],
  );
  useEffect(() => {
    if (!chat.ready || !active) return;
    if (!betaWeb || speakingTtsExperiment) connect();
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
  const replayControls = {
    ...replay,
    localAudioUrls,
    disabled: !replayAllowed,
  };
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
  useEffect(() => {
    onNavigationAvailabilityChange?.(canLeave && !chat.unresolved);
  }, [canLeave, chat.unresolved, onNavigationAvailabilityChange]);
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
    <View
      pointerEvents="box-none"
      style={[
        styles.taskToolbar,
        renderDesktopWorkspace ? styles.workspaceToolbar : null,
      ]}
    >
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
        {!desktop ? (
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
        ) : null}
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
  const avatar = (
    <SpeakingAvatar
      presentation={{ ...presentation, emotion }}
      height={avatarHeight}
      handoff={handoff}
      toolbar={toolbar}
    />
  );
  const transcript = (
    <View
      testID={desktop ? 'speaking-desktop-transcript' : undefined}
      style={[
        styles.messageArea,
        desktop ? styles.desktopTranscript : null,
        renderDesktopWorkspace ? styles.sidebarTranscript : null,
      ]}
    >
      {desktop ? (
        <Text style={styles.transcriptTitle}>
          {renderDesktopWorkspace ? 'Nội dung hội thoại' : 'Lịch sử hội thoại'}
        </Text>
      ) : null}
      <Text
        style={[styles.chatStatus, desktop ? styles.desktopStatus : null]}
        accessibilityLiveRegion="polite"
      >
        {active ? phaseLabels[phase] : 'Phiên này chỉ xem lại'}
      </Text>
      <SpeakingMessages
        messages={chat.messages}
        presentation={{ ...presentation, emotion }}
        replay={replayControls}
        feedbackControls={sentenceFeedback}
      />
    </View>
  );
  const composer = (
    <View style={[styles.composer, desktop ? styles.desktopComposer : null]}>
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
          label={
            unsaved
              ? 'Thử lưu lại'
              : betaWeb && phase === 'idle'
              ? 'Bắt đầu Live'
              : 'Kết nối lại'
          }
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
            presentation={{ ...presentation, emotion }}
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
                !ready || !draft.trim() ? colors.disabledText : colors.onPrimary
              }
            />
          </Pressable>
        </View>
      )}
    </View>
  );
  const header = (
    <View
      style={[
        styles.header,
        desktop ? styles.desktopHeader : null,
        { paddingTop: insets.top + spacing.md },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Lịch sử hội thoại"
        accessibilityHint="Quay về Hội thoại gần đây"
        accessibilityState={{ disabled: !canLeave || chat.unresolved }}
        disabled={!canLeave || chat.unresolved}
        onPress={onBack}
        style={styles.back}
      >
        <AuthIcon name="back" color={colors.dark} />
      </Pressable>
      <View style={styles.headingCopy}>
        <Text numberOfLines={2} style={styles.title}>
          {result.scenario.title}
        </Text>
        <Text style={styles.hint}>Aoi · {result.scenario.role.name}</Text>
      </View>
      {active ? (
        <AuthButton
          label="Kết thúc"
          size="compact"
          variant="text"
          busy={finishing}
          disabled={!canLeave || chat.loading || !chat.ready || chat.unresolved}
          onPress={finish}
        />
      ) : (
        <Text style={styles.hint}>Đã kết thúc</Text>
      )}
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={
        renderDesktopWorkspace
          ? styles.portalController
          : [styles.screen, { paddingBottom: navigationInset }]
      }
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {renderDesktopWorkspace && desktop ? (
        renderDesktopWorkspace(
          <View
            testID="speaking-desktop-controls"
            style={styles.workspaceControls}
          >
            {toolbar}
            {inputMode === 'voice' ? composer : null}
          </View>,
          <View style={styles.screen}>
            {header}
            {transcript}
            {inputMode === 'text' ? (
              <View style={styles.sidebarComposer}>{composer}</View>
            ) : null}
          </View>,
        )
      ) : (
        <>
          {header}
          <View
            testID="speaking-content"
            style={[styles.content, desktop ? styles.desktopContent : null]}
            onLayout={event =>
              setContentHeight(event.nativeEvent.layout.height)
            }
          >
            {desktop ? (
              <>
                <View
                  testID="speaking-desktop-stage"
                  style={styles.desktopStage}
                >
                  {avatar}
                  {composer}
                </View>
                {transcript}
              </>
            ) : (
              <>
                {showTranscript ? toolbar : avatar}
                {transcript}
              </>
            )}
          </View>
          {desktop ? null : composer}
        </>
      )}
      {showEvaluation ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowEvaluation(false)}
        >
          <View style={styles.screen}>
            <AppBackground />
            <ConversationEvaluationScreen
              sessionId={result.session.id}
              title={result.scenario.title}
              onTranscript={() => setShowEvaluation(false)}
              onBack={onBack}
            />
          </View>
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
  sidebarComposer: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  workspaceControls: { padding: spacing.md, width: '100%', gap: spacing.sm },
  workspaceToolbar: {
    width: 'auto',
    maxWidth: '100%',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  portalController: { position: 'absolute', width: 0, height: 0 },
  sidebarTranscript: {
    flex: 1,
    width: '100%',
    minHeight: 100,
    borderWidth: 0,
    borderRadius: radius.small,
    overflow: 'hidden',
    backgroundColor: colors.surfaceTint,
  },
  screen: { flex: 1 },
  content: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: layout.maxFormWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
  },
  desktopContent: {
    maxWidth: layout.maxContentWidth + layout.screenGutter * 2,
    flexDirection: 'row',
    gap: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  desktopStage: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  messageArea: { flex: 1, minHeight: 0, paddingTop: spacing.md },
  desktopTranscript: {
    flex: 0,
    width: 360,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceTint,
  },
  transcriptTitle: { ...typography.caption, color: colors.dark },
  desktopStatus: { textAlign: 'left', marginTop: spacing.xs },
  chatStatus: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  taskToolbar: {
    width: '100%',
    maxWidth: layout.maxFormWidth,
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
    maxWidth: layout.maxFormWidth,
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
    maxWidth: layout.maxFormWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.md,
  },
  desktopHeader: {
    maxWidth: layout.maxContentWidth + layout.screenGutter * 2,
  },
  back: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { ...typography.label, color: colors.dark },
  label: { ...typography.label, color: colors.dark },
  body: { ...typography.input, color: colors.body },
  hint: { ...typography.caption, color: colors.muted },
  briefing: { padding: spacing.lg, gap: spacing.sm },
  composer: {
    width: '100%',
    maxWidth: layout.maxFormWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  desktopComposer: {
    maxWidth: layout.maxFormWidth,
    paddingHorizontal: 0,
    paddingBottom: 0,
    flexShrink: 0,
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
    maxWidth: layout.maxFormWidth,
    width: '100%',
    alignSelf: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.lg,
  },
});

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { CharacterView3D } from '../components/CharacterView3D';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { useConversation } from '../hooks/useConversation';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import { StartedSession, speakingService } from '../services/speakingService';
import { JapaneseSpeech } from '../services/japaneseSpeech';
import { colors, radius, spacing, typography } from '../theme/theme';

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => BrowserRecognition;
  webkitSpeechRecognition?: new () => BrowserRecognition;
};

export function BetaTextConversationScreen({
  result,
  onBack,
}: {
  result: StartedSession;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const navigationInset = useBottomNavigationInset();
  const chat = useConversation(result.session.id);
  const [draft, setDraft] = useState('');
  const [draftMode, setDraftMode] = useState<'text' | 'voice'>('text');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voice = useRef(new JapaneseSpeech());
  const playbackGeneration = useRef(0);
  const recognition = useRef<BrowserRecognition | null>(null);
  const finishPending = useRef(false);
  useEffect(() => () => {
    playbackGeneration.current += 1;
    recognition.current?.stop();
    voice.current.stop();
  }, []);
  const active = chat.active && !finishing;
  const failedReply = chat.messages.at(-1)?.speaker === 'assistant' &&
    chat.messages.at(-1)?.status === 'failed';
  const canSend = active && chat.ready && !chat.loading && !chat.sending &&
    !chat.unresolved && !chat.retrySeconds && Boolean(draft.trim());

  const playReply = async (content: string) => {
    if (!content.trim()) return;
    const generation = ++playbackGeneration.current;
    voice.current.stop();
    setSpeaking(false);
    setSpeechError('');
    try {
      await voice.current.speak(content, () => {
        if (generation === playbackGeneration.current) setSpeaking(false);
      }, () => {
        if (generation !== playbackGeneration.current) return;
        setSpeaking(false);
        setSpeechError('Không đọc được câu trả lời. Bạn vẫn có thể xem nội dung bên dưới.');
      });
      if (generation === playbackGeneration.current) setSpeaking(true);
    } catch (failure) {
      if (generation !== playbackGeneration.current) return;
      setSpeaking(false);
      setSpeechError(errorMessage(failure));
    }
  };

  const toggleMicrophone = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const browser = typeof window === 'undefined' ? null : window as RecognitionWindow;
    const Recognition = browser?.SpeechRecognition || browser?.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError('Trình duyệt chưa hỗ trợ nhận giọng nói tiếng Nhật. Hãy dùng Chrome hoặc nhập câu trả lời.');
      return;
    }
    playbackGeneration.current += 1;
    voice.current.stop();
    setSpeaking(false);
    setSpeechError('');
    const current = new Recognition();
    current.lang = 'ja-JP';
    current.continuous = false;
    current.interimResults = false;
    current.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setDraft(transcript);
        setDraftMode('voice');
      }
      else setSpeechError('Chưa nhận được câu nói. Hãy thử lại.');
    };
    current.onerror = event => {
      setSpeechError(event.error === 'not-allowed'
        ? 'Hãy cho phép trình duyệt dùng micro rồi thử lại.'
        : 'Không nhận được giọng nói. Hãy thử lại hoặc nhập câu trả lời.');
    };
    current.onend = () => {
      if (recognition.current === current) recognition.current = null;
      setListening(false);
    };
    recognition.current = current;
    try {
      current.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setSpeechError('Không mở được micro. Hãy kiểm tra quyền truy cập của trình duyệt.');
    }
  };

  const send = async () => {
    if (!canSend) return;
    const content = draft.trim();
    setDraft('');
    const mode = draftMode;
    setDraftMode('text');
    const sent = await chat.send(content, mode);
    if (!sent) {
      setDraft(previous => previous || content);
      setDraftMode(mode);
    }
    else if (sent.content) void playReply(sent.content);
  };

  const finish = async () => {
    if (finishPending.current || chat.sending || chat.unresolved || !chat.ready) return;
    finishPending.current = true;
    setFinishing(true);
    setFinishError('');
    try {
      recognition.current?.stop();
      playbackGeneration.current += 1;
      voice.current.stop();
      setSpeaking(false);
      await speakingService.finish(result.session.id);
      await chat.reload();
    } catch (failure) {
      setFinishError(errorMessage(failure));
    } finally {
      finishPending.current = false;
      setFinishing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: navigationInset }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={onBack}>
          <Text style={styles.back}>← Quay lại</Text>
        </Pressable>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{result.scenario.title}</Text>
          <Text style={styles.subtitle}>Trò chuyện với {result.scenario.role.name}</Text>
        </View>
      </View>
      <View style={styles.avatar}>
        <CharacterView3D isSpeaking={speaking} portrait />
      </View>
      <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
        <Text style={styles.context}>{result.scenario.context}</Text>
        {chat.messages.map(message => (
          <View
            key={message.id}
            style={[styles.message, message.speaker === 'user' ? styles.userMessage : styles.assistantMessage]}
          >
            <Text style={styles.speaker}>{message.speaker === 'user' ? 'Bạn' : result.scenario.role.name}</Text>
            <Text style={styles.messageText}>{message.content || (message.status === 'pending' ? 'Đang trả lời…' : '')}</Text>
            {message.speaker === 'assistant' && message.status === 'completed' && message.content ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Nghe Aoi nói" onPress={() => void playReply(message.content)}>
                <Text style={styles.listen}>▶ Nghe Aoi nói</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {chat.loading && !chat.ready ? <ActivityIndicator color={colors.primaryText} /> : null}
      </ScrollView>
      <View style={styles.composer}>
        <AuthNotice message={chat.error} error />
        <AuthNotice message={finishError} error />
        <AuthNotice message={speechError} error />
        {listening ? <Text style={styles.note}>Đang nghe tiếng Nhật…</Text> : null}
        {chat.retrySeconds ? <Text style={styles.note}>Thử lại sau {chat.retrySeconds} giây.</Text> : null}
        {chat.unresolved && chat.active && !chat.sending ? (
          <AuthButton
            label={failedReply ? 'Thử lại phản hồi' : 'Tải lại phản hồi'}
            secondary
            onPress={() => failedReply ? chat.send('', 'text', true) : chat.reload(true)}
          />
        ) : null}
        {chat.active ? (
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Nhập câu trả lời tiếng Nhật"
              style={styles.input}
              value={draft}
              onChangeText={value => { setDraft(value); setDraftMode('text'); }}
              placeholder="Nhập câu trả lời tiếng Nhật…"
              placeholderTextColor={colors.muted}
              multiline
              editable={!chat.sending && !finishing}
            />
            <AuthButton label="Gửi" onPress={send} busy={chat.sending} disabled={!canSend} />
          </View>
        ) : <Text style={styles.note}>Hội thoại đã kết thúc.</Text>}
        {chat.active ? <AuthButton label={listening ? 'Dừng micro' : '🎙 Nói tiếng Nhật'} secondary onPress={toggleMicrophone} disabled={chat.sending || !chat.ready || Boolean(chat.unresolved)} /> : null}
        {chat.active ? <Text style={styles.note}>Giọng nói được trình duyệt nhận dạng; âm thanh có thể được gửi tới dịch vụ của trình duyệt. Xem lại câu nhận dạng trước khi gửi.</Text> : null}
        {chat.active ? <AuthButton label="Kết thúc hội thoại" secondary onPress={finish} busy={finishing} disabled={chat.sending || chat.unresolved || !chat.ready} /> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.primaryText, ...typography.body },
  heading: { marginTop: spacing.sm },
  title: { color: colors.primaryText, ...typography.heading },
  subtitle: { color: colors.muted, ...typography.body },
  transcript: { flex: 1 },
  avatar: { height: 230, marginHorizontal: spacing.lg, borderRadius: radius.card, overflow: 'hidden' },
  transcriptContent: { padding: spacing.lg, gap: spacing.md },
  context: { color: colors.muted, ...typography.body },
  message: { maxWidth: '85%', padding: spacing.md, borderRadius: radius.card },
  userMessage: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  speaker: { color: colors.muted, ...typography.caption },
  messageText: { color: colors.primaryText, ...typography.body },
  listen: { marginTop: spacing.sm, color: colors.primaryText, ...typography.caption },
  composer: { padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 48, maxHeight: 128, padding: spacing.sm, color: colors.primaryText, backgroundColor: colors.surface, borderRadius: radius.input, ...typography.body },
  note: { color: colors.muted, ...typography.body },
});

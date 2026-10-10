import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import { useConversation } from '../hooks/useConversation';
import { useAudioReplay } from '../hooks/useAudioReplay';
import { initialPresentation } from '../hooks/useSpeakingPresentation';
import { SpeakingMessages } from '../components/SpeakingMessages';
import { criterionNames } from '../components/MessageFeedback';
import {
  EvaluationCriterionCode,
  SessionEvaluation,
  speakingService,
} from '../services/speakingService';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

const criteria: {
  code: EvaluationCriterionCode;
  name: string;
  weight: string;
}[] = [
  { code: 'grammar', name: 'Ngữ pháp', weight: '40%' },
  { code: 'vocabulary', name: 'Từ vựng', weight: '30%' },
  { code: 'naturalness', name: 'Độ tự nhiên', weight: '30%' },
];

export function ConversationEvaluationScreen({
  sessionId,
  title,
  onTranscript,
  onBack,
}: {
  sessionId: string;
  title: string;
  onTranscript: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const chat = useConversation(sessionId);
  const replay = useAudioReplay(sessionId);
  const [showDetails, setShowDetails] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    request: number;
  } | null>(null);
  const focusMessage = (id: string) => {
    setFocusRequest(previous => ({
      id,
      request: (previous?.request || 0) + 1,
    }));
  };
  const leave = (callback: () => void) => {
    replay.stop();
    callback();
  };
  const [evaluation, setEvaluation] = useState<SessionEvaluation | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const retryRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(
    async (retry = false) => {
      if (retryRef.current) return;
      retryRef.current = true;
      const current = ++generation.current;
      if (timer.current) clearTimeout(timer.current);
      setBusy(true);
      setError('');
      try {
        let value = retry
          ? await speakingService.evaluate(sessionId)
          : await speakingService.evaluation(sessionId);
        if (current !== generation.current) return;
        if (value.status === 'not_started' || value.status === 'pending') {
          value = await speakingService.evaluate(sessionId);
        }
        if (current !== generation.current) return;
        setEvaluation(value);
        if (value.status === 'failed')
          setError(
            value.error || 'Chưa phân tích được hội thoại. Vui lòng thử lại.',
          );
      } catch (failure) {
        if (current === generation.current) setError(errorMessage(failure));
      } finally {
        if (current === generation.current) {
          retryRef.current = false;
          setBusy(false);
        }
      }
    },
    [sessionId],
  );
  useEffect(() => {
    load();
    return () => {
      generation.current += 1;
      retryRef.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);
  useEffect(() => {
    if (evaluation?.status !== 'processing' || error || busy) return;
    timer.current = setTimeout(() => load(), 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [evaluation, error, busy, load]);
  const result = evaluation?.result;
  const processing = !error && (busy || evaluation?.status === 'processing');
  const scored =
    evaluation?.status === 'completed' &&
    result?.assessment_status === 'scored';
  const header = (
    <View style={styles.section}>
      <Text style={styles.caption}>
        Dựa trên bản chép lời · Chưa đánh giá phát âm
      </Text>
      {processing ? (
        <View style={styles.card}>
          <ActivityIndicator
            color={colors.primaryText}
            accessibilityLabel="Đang phân tích hội thoại"
          />
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Đang phân tích hội thoại…
          </Text>
          <Text style={styles.caption}>
            Hội thoại đã được lưu. Bạn có thể đọc và nghe lại trong lúc chờ.
          </Text>
        </View>
      ) : null}
      <AuthNotice message={error} error />
      {error ? (
        <AuthButton
          label="Thử phân tích lại"
          variant="outline"
          onPress={() => load(true)}
          busy={busy}
        />
      ) : null}
      {result ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.heading}>
              {scored ? 'Điểm tổng quan' : 'Chưa đủ dữ liệu để chấm điểm'}
            </Text>
            {scored ? (
              <Text
                accessibilityLabel={`Điểm tổng quan ${evaluation.overall_score} trên 100`}
                style={styles.score}
              >
                {evaluation.overall_score}
                <Text style={styles.caption}> / 100</Text>
              </Text>
            ) : null}
          </View>
          {scored ? (
            <View style={styles.criteria}>
              {criteria.map(({ code, name }) => (
                <View key={code} style={styles.criterion}>
                  <Text style={styles.caption}>{name}</Text>
                  <Text style={styles.criterionScore}>
                    {result.criteria[code].score}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.body}>{result.summary}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              showDetails ? 'Thu gọn điểm' : 'Xem chi tiết điểm'
            }
            accessibilityState={{ expanded: showDetails }}
            onPress={() => setShowDetails(value => !value)}
            style={styles.linkButton}
          >
            <Text style={styles.link}>
              {showDetails ? 'Thu gọn −' : 'Chi tiết điểm và điểm mạnh +'}
            </Text>
          </Pressable>
          {showDetails ? (
            <View style={styles.section}>
              {scored
                ? criteria.map(({ code, name, weight }) => (
                    <View key={code} style={styles.detail}>
                      <Text style={styles.heading}>
                        {name} · {weight}
                      </Text>
                      <Text style={styles.body}>
                        {result.criteria[code].feedback}
                      </Text>
                    </View>
                  ))
                : null}
              {result.strengths.length ? (
                <Text style={styles.heading}>Điểm mạnh của bạn</Text>
              ) : null}
              {result.strengths.map((value, index) => (
                <Text key={index} style={styles.body}>
                  • {value}
                </Text>
              ))}
              {scored ? (
                <Text style={styles.caption}>
                  Điểm tham khảo cho phiên này, không phải kết quả JLPT.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <Text accessibilityRole="header" style={styles.heading}>
        Hội thoại & nhận xét từng câu
      </Text>
      <Text style={styles.caption}>
        Bấm nhận xét dưới câu của bạn để xem giải thích. Câu chưa có nhận xét
        không đồng nghĩa với câu đúng.
      </Text>
      {chat.loading ? (
        <ActivityIndicator
          accessibilityLabel="Đang tải hội thoại"
          color={colors.primaryText}
        />
      ) : null}
      <AuthNotice message={chat.error || replay.error} error />
      {chat.error ? (
        <AuthButton
          label="Tải lại hội thoại"
          variant="text"
          onPress={() => chat.reload()}
        />
      ) : null}
    </View>
  );
  const footer = (
    <View style={styles.footer}>
      {result ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>
            Luyện gì tiếp theo?
          </Text>
          {result.next_steps.slice(0, 3).map((value, index) => (
            <Text key={index} style={styles.body}>
              {index + 1}. {value}
            </Text>
          ))}
          {scored
            ? [...criteria]
                .sort(
                  (a, b) =>
                    (result.criteria[a.code].score ?? 100) -
                    (result.criteria[b.code].score ?? 100),
                )
                .map(({ code }) => {
                  const related = result.items.filter(
                    item =>
                      item.criterion === code &&
                      chat.messages.some(
                        message =>
                          message.id === item.message_id &&
                          message.speaker === 'user',
                      ),
                  );
                  if (!related.length) return null;
                  return (
                    <View key={code} style={styles.detail}>
                      <Text style={styles.heading}>{criterionNames[code]}</Text>
                      <Text style={styles.body}>
                        {result.criteria[code].suggestion}
                      </Text>
                      {[...new Set(related.map(item => item.message_id))].map(
                        (id, index) => (
                          <Pressable
                            key={id}
                            accessibilityRole="button"
                            accessibilityLabel={`Xem câu liên quan ${
                              criterionNames[code]
                            } ${index + 1}`}
                            onPress={() => focusMessage(id)}
                            style={styles.linkButton}
                          >
                            <Text style={styles.link}>
                              Xem câu liên quan
                              {related.length > 1 ? ` ${index + 1}` : ''} ↑
                            </Text>
                          </Pressable>
                        ),
                      )}
                    </View>
                  );
                })
            : null}
        </View>
      ) : null}
    </View>
  );
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.topbar}>
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Nhận xét hội thoại
          </Text>
          <Text numberOfLines={1} style={styles.caption}>
            {title}
          </Text>
        </View>
        <AuthButton
          label="Xem hội thoại"
          variant="text"
          onPress={() => leave(onTranscript)}
        />
      </View>
      <View style={styles.chat}>
        <SpeakingMessages
          messages={chat.messages}
          presentation={initialPresentation}
          review
          feedback={scored ? result?.items : undefined}
          header={header}
          footer={footer}
          focusRequest={focusRequest}
          replay={{ ...replay, disabled: false, toggle: replay.toggle }}
        />
      </View>
      <AuthButton
        label="Về luyện nói"
        variant="text"
        onPress={() => leave(onBack)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topbar: {
    padding: layout.screenGutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleCopy: { flex: 1, gap: spacing.xs },
  chat: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: layout.maxContentWidth + layout.screenGutter * 2,
    paddingHorizontal: layout.screenGutter,
    alignSelf: 'center',
  },
  title: { ...typography.title, color: colors.dark },
  heading: { ...typography.heading, color: colors.dark },
  body: { ...typography.input, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  section: { gap: spacing.md },
  footer: { paddingVertical: spacing.xl },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    boxShadow: shadowSm,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  score: { ...typography.brand, color: colors.badgeText },
  criteria: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  criterion: { flexGrow: 1, gap: spacing.xs },
  criterionScore: { ...typography.heading, color: colors.badgeText },
  detail: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  linkButton: { minHeight: 48, justifyContent: 'center' },
  link: { ...typography.label, color: colors.badgeText },
});

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthCard, AuthNotice } from './AuthForm';
import { useStudyActivity } from './StudyTime';
import { NihongoMascot } from './NihongoMascot';
import {
  useWebNavigation,
  WebNavigationContext,
} from '../navigation/webNavigation';
import {
  journeyService,
  JourneyStep,
  LearningJourney,
} from '../services/journeyService';
import {
  writingService,
  WritingSubmissionApi,
} from '../services/writingService';
import { colors, radius, spacing, typography } from '../theme/theme';

const ShadowingScreen = lazy(() =>
  import('../screens/ShadowingScreen').then(module => ({
    default: module.ShadowingScreen,
  })),
);
const ReadingScreen = lazy(() =>
  import('../screens/ReadingScreen').then(module => ({
    default: module.ReadingScreen,
  })),
);
const WritingScreen = lazy(() =>
  import('../screens/WritingScreen').then(module => ({
    default: module.WritingScreen,
  })),
);
const FlashcardScreen = lazy(() =>
  import('../screens/FlashcardScreen').then(module => ({
    default: module.FlashcardScreen,
  })),
);
const VocabularyScreen = lazy(() =>
  import('../screens/VocabularyScreen').then(module => ({
    default: module.VocabularyScreen,
  })),
);
const labels = {
  review: 'Ôn tập',
  vocabulary: 'Từ vựng',
  shadowing: 'Shadowing',
  reading: 'Đọc hiểu',
  writing: 'Viết với AI',
};
const activityImages = {
  review: require('../assets/mascot/momo-skill-writing-head-v1.png'),
  vocabulary: require('../assets/mascot/momo-skill-writing-head-v1.png'),
  shadowing: require('../assets/mascot/momo-skill-listening-head-v1.png'),
  reading: require('../assets/mascot/momo-skill-reading-head-v1.png'),
  writing: require('../assets/mascot/momo-skill-writing-head-v1.png'),
};

export function PersonalLearningHub({ accountId }: { accountId: string }) {
  const navigation = useWebNavigation();
  const [data, setData] = useState<LearningJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  const [activity, setActivity] = useState<JourneyStep | null>(null);
  const [text, setText] = useState('');
  const [draftId, setDraftId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [submission, setSubmission] = useState<WritingSubmissionApi | null>(
    null,
  );
  const [showPlan, setShowPlan] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const expansion = useRef(new Animated.Value(0)).current;
  const [planHeight, setPlanHeight] = useState(0);
  const [showAllWords, setShowAllWords] = useState(false);
  const { width } = useWindowDimensions();
  const loadedDate = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  useStudyActivity(activity !== null);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReducedMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => sub.remove();
  }, []);
  const build = () => {
    setShowPlan(true);
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: reducedMotion ? 0 : 2400,
      useNativeDriver: true,
    }).start();
  };
  useEffect(() => {
    const animation = Animated.timing(expansion, {
      toValue: showPlan ? planHeight : 0,
      duration: reducedMotion ? 0 : 600,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [expansion, planHeight, reducedMotion, showPlan]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await journeyService.load();
      if (alive.current) {
        if (loadedDate.current !== result.date) {
          setText(result.draft?.text ?? '');
          setDraftId(result.draft?.id);
          setSubmission(null);
          setNotice('');
          setActivity(null);
        }
        loadedDate.current = result.date;
        setData(result);
      }
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa tải được lịch sử học. Hãy thử lại.',
        );
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload, accountId]);
  const run = async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa thực hiện được. Hãy thử lại.',
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const close = useCallback(() => {
    if (pending.current) return;
    setActivity(null);
    reload();
  }, [reload]);
  const steps = data?.steps ?? [];
  const first =
    steps.find(
      step =>
        step.kind ===
        (draftId
          ? 'writing'
          : data?.knowledge.recent_words.length
          ? 'shadowing'
          : 'vocabulary'),
    ) ?? steps[0];
  const topic = data?.writing_topic;
  const open = (step: JourneyStep) => {
    if (navigation) {
      const path =
        step.kind === 'shadowing'
          ? '/practice/listening/' +
            encodeURIComponent(step.target_id!) +
            '?start=' +
            (step.start_seconds ?? 0)
          : step.kind === 'reading'
          ? '/practice/reading/' + encodeURIComponent(step.target_id!)
          : step.kind === 'review'
          ? '/flashcards/review'
          : step.kind === 'vocabulary'
          ? '/lessons'
          : '/practice/writing?journey=1';
      navigation.navigate(path, { state: { backTo: '/profile' } });
      return;
    }
    setActivity(step);
  };
  const generate = (step: JourneyStep) =>
    run(async () => {
      if (!data) return;
      const result = await journeyService.topic(data.date);
      if (alive.current) {
        setData(result);
        open(step);
      }
    });
  const saveDraft = () =>
    run(async () => {
      if (!topic) return;
      const result = draftId
        ? await writingService.updateDraft(draftId, text)
        : await writingService.saveCustomDraft(text, topic.title);
      if (alive.current) {
        setDraftId(result.draft.id);
        setNotice('Đã lưu vào bản nháp trong mục Viết.');
      }
    });
  const submit = () =>
    run(async () => {
      if (!topic) return;
      const result = await writingService.submitWriting({
        prompt_title: topic.title,
        level: topic.level,
        text,
      });
      if (alive.current) {
        setSubmission(result.submission);
        setNotice(
          'Đã lưu bài viết và góp ý trong mục Viết. Quay lại lộ trình để tiếp tục.',
        );
      }
      if (data && activity?.kind === 'writing') {
        const completed = await journeyService.complete(data.date, activity.id);
        if (alive.current) setData(completed);
      }
    });

  return (
    <View style={styles.hub} testID="personal-learning-hub">
      <View style={styles.journeyPanel} testID="journey-panel">
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>GÓC HỌC TẬP CỦA BẠN</Text>
            <Text accessibilityRole="header" style={styles.heroTitle}>
              Gom những điều đã học, thành điều bạn có thể dùng.
            </Text>
            <Text style={styles.heroBody}>
              Từ quen thuộc sẽ dẫn bạn đến bài nghe, bài đọc và đề viết phù hợp.
            </Text>
            <View style={styles.buildAction}>
              <AuthButton
                label={showPlan ? 'Xem lại lộ trình' : 'Xây dựng lộ trình ôn'}
                size="compact"
                trailingIcon="arrow"
                disabled={loading || !data}
                onPress={build}
              />
            </View>
          </View>
          <View style={styles.heroArt} accessible={false} pointerEvents="none">
            <Animated.View
              style={{
                transform: [
                  {
                    translateY: reveal.interpolate({
                      inputRange: [0, 0.18, 0.32, 0.5, 1],
                      outputRange: [0, -12, 0, -4, 0],
                    }),
                  },
                  {
                    rotate: reveal.interpolate({
                      inputRange: [0, 0.15, 0.3, 0.45, 1],
                      outputRange: ['0deg', '-8deg', '7deg', '0deg', '0deg'],
                    }),
                  },
                ],
              }}
            >
              <NihongoMascot size={140} pose="wave" decorative />
            </Animated.View>
            {[0, 1, 2, 3, 4].map(index => (
              <Animated.Text
                key={index}
                style={[
                  styles.sparkle,
                  {
                    left: 18 + index * 30,
                    top: 20 + (index % 2) * 35,
                    opacity: reveal.interpolate({
                      inputRange: [
                        0,
                        0.12 + index * 0.025,
                        0.3 + index * 0.025,
                        0.55,
                        1,
                      ],
                      outputRange: [0, 0, 1, 0, 0],
                      extrapolate: 'clamp',
                    }),
                    transform: [
                      {
                        translateY: reveal.interpolate({
                          inputRange: [0, 0.55, 1],
                          outputRange: [18, -35 - index * 5, -35 - index * 5],
                        }),
                      },
                      {
                        scale: reveal.interpolate({
                          inputRange: [0, 0.22, 0.4, 1],
                          outputRange: [0, 1.2, 0.7, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {index % 2 ? '✦' : '✧'}
              </Animated.Text>
            ))}
          </View>
        </View>
        {data && first && showPlan ? (
          <Animated.View style={[styles.planSection, { height: expansion }]}>
            <View
              style={styles.planContent}
              onLayout={event => setPlanHeight(event.nativeEvent.layout.height)}
            >
              <Text accessibilityRole="header" style={styles.title}>
                Bạn muốn luyện gì hôm nay?
              </Text>
              <View style={styles.activityGrid}>
                {[first, ...steps.filter(step => step.id !== first.id)].map(
                  (step, index) => {
                    const writing = step.kind === 'writing';
                    const action = writing
                      ? draftId
                        ? 'Viết tiếp'
                        : topic
                        ? 'Mở đề viết'
                        : 'Tạo đề viết bằng AI'
                      : step.excerpt
                      ? 'Nghe đoạn này'
                      : 'Bắt đầu ' + labels[step.kind].toLowerCase();
                    return (
                      <View
                        key={step.id}
                        style={[styles.slot, width >= 800 && styles.slotWide]}
                      >
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            styles.placeholder,
                            {
                              opacity: reveal.interpolate({
                                inputRange: [
                                  0,
                                  0.25,
                                  0.42 + index * 0.08,
                                  0.65 + index * 0.08,
                                  1,
                                ],
                                outputRange: [0, 0.5, 0.5, 0, 0],
                                extrapolate: 'clamp',
                              }),
                            },
                          ]}
                        >
                          <View style={styles.placeholderCircle} />
                          <View style={styles.placeholderLines}>
                            <View style={styles.placeholderLine} />
                            <View style={styles.placeholderShort} />
                          </View>
                        </Animated.View>
                        <Animated.View
                          style={[
                            styles.step,
                            step === first && styles.activeStep,
                            {
                              opacity: reveal.interpolate({
                                inputRange: [
                                  0,
                                  0.42 + index * 0.08,
                                  0.58 + index * 0.08,
                                  1,
                                ],
                                outputRange: [0, 0, 1, 1],
                                extrapolate: 'clamp',
                              }),
                              transform: [
                                {
                                  translateX: reveal.interpolate({
                                    inputRange: [
                                      0,
                                      0.42 + index * 0.08,
                                      0.7 + index * 0.07,
                                      1,
                                    ],
                                    outputRange: [
                                      index % 2 ? 45 : -45,
                                      index % 2 ? 45 : -45,
                                      0,
                                      0,
                                    ],
                                    extrapolate: 'clamp',
                                  }),
                                },
                                {
                                  translateY: reveal.interpolate({
                                    inputRange: [
                                      0,
                                      0.42 + index * 0.08,
                                      0.7 + index * 0.07,
                                      1,
                                    ],
                                    outputRange: [35, 35, 0, 0],
                                    extrapolate: 'clamp',
                                  }),
                                },
                                {
                                  scale: reveal.interpolate({
                                    inputRange: [
                                      0,
                                      0.42 + index * 0.08,
                                      0.7 + index * 0.07,
                                      1,
                                    ],
                                    outputRange: [0.94, 0.94, 1, 1],
                                    extrapolate: 'clamp',
                                  }),
                                },
                              ],
                            },
                          ]}
                        >
                          <View style={styles.activityHeader}>
                            <Image
                              source={activityImages[step.kind]}
                              style={styles.activityImage}
                              resizeMode="contain"
                              accessible={false}
                            />
                            <View style={styles.activityIdentity}>
                              <Text style={styles.eyebrow}>
                                {labels[step.kind]} · {step.minutes} phút
                                {data.completed.includes(step.id)
                                  ? ' · Đã luyện'
                                  : ''}
                              </Text>
                            </View>
                          </View>
                          <Text
                            accessibilityRole="header"
                            style={styles.heading}
                            numberOfLines={2}
                          >
                            {writing
                              ? topic?.title ?? 'Viết với từ đã học'
                              : step.title}
                          </Text>
                          <AuthButton
                            label={action}
                            size="compact"
                            variant={step === first ? 'primary' : 'outline'}
                            disabled={busy}
                            onPress={() =>
                              writing && !topic ? generate(step) : open(step)
                            }
                          />
                        </Animated.View>
                      </View>
                    );
                  },
                )}
                <View style={[styles.slot, width >= 800 && styles.slotWide]}>
                  <View style={styles.step}>
                    <Text style={styles.eyebrow}>TỪ VỰNG</Text>
                    <Text accessibilityRole="header" style={styles.heading}>
                      Xem lại từ đã ôn
                    </Text>
                    <Text style={styles.body}>
                      {data.knowledge.reviewed_cards} thẻ đã ôn ·{' '}
                      {data.knowledge.due_cards} thẻ đến hạn
                    </Text>
                    <AuthButton
                      label="Ôn từ vựng"
                      variant="outline"
                      size="compact"
                      onPress={() =>
                        navigation
                          ? navigation.navigate('/flashcards', {
                              state: { backTo: '/profile' },
                            })
                          : open({
                              id: 'vocabulary-review',
                              kind: 'review',
                              title: 'Ôn từ vựng',
                              reason: '',
                              instruction: '',
                              minutes: 0,
                            })
                      }
                    />
                  </View>
                </View>
                <View style={[styles.slot, width >= 800 && styles.slotWide]}>
                  <View style={styles.step}>
                    <Text style={styles.eyebrow}>BÀI VIẾT</Text>
                    <Text accessibilityRole="header" style={styles.heading}>
                      Xem lại lỗi viết
                    </Text>
                    <Text style={styles.body}>
                      {data.knowledge.writing_submissions} bài đã nộp
                    </Text>
                    <AuthButton
                      label="Xem bài viết và lỗi sai"
                      variant="outline"
                      size="compact"
                      onPress={() =>
                        navigation
                          ? navigation.navigate(
                              '/practice/writing?view=submissions',
                            )
                          : setActivity({
                              id: 'writing-review',
                              kind: 'writing',
                              title: 'Bài viết của bạn',
                              reason: '',
                              instruction: '',
                              minutes: 0,
                            })
                      }
                    />
                  </View>
                </View>
              </View>
              {data.missing.length ? (
                <Text style={styles.caption}>
                  Chưa có {data.missing.join(' và ')} phù hợp hôm nay.
                </Text>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
      {!showPlan ? (
        <AuthCard>
          <Text accessibilityRole="header" style={styles.title}>
            Từ bạn vừa ôn
          </Text>
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Đang tải kiến thức đã học"
              color={colors.focus}
            />
          ) : null}
          {data && !loading ? (
            <>
              {data.knowledge.recent_words.length ? (
                <View style={styles.words}>
                  {data.knowledge.recent_words
                    .slice(0, showAllWords ? 20 : 4)
                    .map((word, index) => (
                      <View key={`${word.word}:${index}`} style={styles.word}>
                        <Text selectable style={styles.heading}>
                          {word.word}
                        </Text>
                        {word.reading ? (
                          <Text style={styles.caption}>{word.reading}</Text>
                        ) : null}
                        <Text selectable style={styles.body}>
                          {word.meaning}
                        </Text>
                      </View>
                    ))}
                </View>
              ) : (
                <Text style={styles.body}>
                  Ôn một lượt flashcard để lưu những từ đầu tiên vào đây.
                </Text>
              )}
              {data.knowledge.recent_words.length > 4 ? (
                <AuthButton
                  label={
                    showAllWords ? 'Thu gọn từ đã ôn' : 'Xem thêm từ đã ôn'
                  }
                  variant="text"
                  onPress={() => setShowAllWords(value => !value)}
                />
              ) : null}
              <Text style={styles.caption}>
                {data.knowledge.reviewed_cards} thẻ đã ôn ·{' '}
                {data.knowledge.reading_passages} bài đọc đã làm ·{' '}
                {data.knowledge.writing_submissions} bài viết đã nộp
              </Text>
            </>
          ) : null}
          <AuthNotice message={error} error />
          <AuthButton
            label="Cập nhật kiến thức và lộ trình"
            variant="text"
            busy={loading}
            disabled={busy}
            onPress={reload}
          />
        </AuthCard>
      ) : null}
      <Modal
        visible={activity !== null}
        animationType="slide"
        onRequestClose={close}
        presentationStyle="fullScreen"
      >
        {activity ? (
          <WebNavigationContext.Provider value={null}>
            <View
              style={[
                styles.modal,
                { paddingTop: insets.top, paddingBottom: insets.bottom },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.heading}>
                  {labels[activity.kind]} · Lộ trình của bạn
                </Text>
                <AuthButton
                  label="Quay lại lộ trình"
                  variant="text"
                  disabled={busy}
                  onPress={close}
                />
              </View>
              <Text style={styles.guide}>{activity.instruction}</Text>
              <Suspense
                fallback={
                  <ActivityIndicator
                    accessibilityLabel="Đang mở bài luyện"
                    color={colors.focus}
                  />
                }
              >
                {activity.id === 'writing-review' ? (
                  <WritingScreen onExit={close} />
                ) : null}
                {activity.kind === 'shadowing' ? (
                  <ShadowingScreen
                    initialJobId={activity.target_id}
                    initialStartSeconds={activity.start_seconds}
                    onExit={close}
                  />
                ) : null}
                {activity.kind === 'reading' ? (
                  <ReadingScreen
                    accountId={accountId}
                    initialPassageId={activity.target_id}
                    onExit={close}
                  />
                ) : null}
                {activity.kind === 'review' ? (
                  <FlashcardScreen
                    startDueReview
                    onExit={close}
                    catalogBackLabel="Quay lại lộ trình"
                  />
                ) : null}
                {activity.kind === 'vocabulary' ? (
                  <VocabularyScreen area="lessons" onExit={close} />
                ) : null}
                {activity.kind === 'writing' && topic ? (
                  <ScrollView
                    contentContainerStyle={styles.editor}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={styles.eyebrow}>
                      ĐỀ DO AI TẠO · {topic.level}
                    </Text>
                    <Text style={styles.title}>{topic.title}</Text>
                    <Text style={styles.instruction}>{topic.instruction}</Text>
                    <Text style={styles.body}>Gợi ý: {topic.hint}</Text>
                    <TextInput
                      accessibilityLabel="Bài viết theo đề AI"
                      multiline
                      value={text}
                      onChangeText={setText}
                      editable={!busy && !submission}
                      maxLength={12000}
                      placeholder="Viết bằng tiếng Nhật…"
                      textAlignVertical="top"
                      style={styles.input}
                    />
                    <AuthNotice message={error} error />
                    <AuthNotice message={notice} />
                    {submission ? (
                      <View style={styles.result}>
                        <Text style={styles.heading}>
                          Góp ý cho bài viết của bạn · {submission.score} điểm
                        </Text>
                        <Text selectable style={styles.body}>
                          {submission.feedback}
                        </Text>
                        <Text selectable style={styles.body}>
                          {submission.corrected_text}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <AuthButton
                          label="Lưu bản nháp"
                          variant="outline"
                          disabled={text.trim().length < 4}
                          busy={busy}
                          onPress={saveDraft}
                        />
                        <AuthButton
                          label="Nộp bài và nhận góp ý AI"
                          disabled={text.trim().length < 4}
                          busy={busy}
                          onPress={submit}
                        />
                      </>
                    )}
                  </ScrollView>
                ) : null}
              </Suspense>
            </View>
          </WebNavigationContext.Provider>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  journeyPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  hero: {
    overflow: 'hidden',
    padding: 28,
    minHeight: 200,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  heroCopy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 310,
    gap: 14,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  heroEyebrow: { ...typography.caption, color: colors.focus },
  heroTitle: {
    ...typography.title,
    fontSize: 21,
    lineHeight: 29,
    color: '#153549',
    maxWidth: 540,
  },
  heroBody: {
    ...typography.caption,
    color: '#586a7a',
    maxWidth: 500,
  },
  buildAction: { alignSelf: 'flex-start', marginTop: spacing.sm },
  sparkle: { position: 'absolute', color: colors.primary, fontSize: 24 },
  heroArt: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artKanji: {
    fontSize: 100,
    lineHeight: 125,
    color: colors.primary,
    opacity: 0.35,
  },
  artNote: {
    position: 'absolute',
    right: 0,
    bottom: 5,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceTint,
    transform: [{ rotate: '-5deg' }],
  },
  artNoteText: { ...typography.heading, color: colors.focus },
  artCaption: { ...typography.caption, color: colors.muted },
  guide: {
    ...typography.label,
    color: colors.body,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  quote: {
    ...typography.title,
    fontSize: 21,
    lineHeight: 32,
    color: colors.dark,
  },
  hub: { gap: spacing.xl },
  eyebrow: { ...typography.caption, color: colors.focus, letterSpacing: 1 },
  title: {
    ...typography.title,
    fontSize: 21,
    lineHeight: 28,
    color: '#153549',
  },
  heading: { ...typography.heading, color: colors.dark },
  body: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
  caption: { ...typography.caption, color: colors.muted, lineHeight: 20 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: {
    flexGrow: 1,
    flexBasis: 130,
    gap: spacing.xs,
    backgroundColor: colors.surfaceTint,
    padding: spacing.lg,
    borderRadius: radius.small,
  },
  number: { ...typography.brand, color: colors.focus },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  word: {
    flexGrow: 1,
    flexBasis: 150,
    padding: spacing.md,
    borderRadius: radius.small,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: spacing.xs,
  },
  track: {
    height: 6,
    backgroundColor: colors.track,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: { height: 6, backgroundColor: colors.success },
  planSection: { width: '100%', overflow: 'hidden' },
  planContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  slot: { flexBasis: '100%', minWidth: 0 },
  slotWide: { flexBasis: '48%', flexGrow: 1, maxWidth: '50%' },
  placeholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  placeholderCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.track,
  },
  placeholderLines: { flex: 1, gap: spacing.sm, paddingTop: spacing.sm },
  placeholderLine: {
    height: 9,
    width: '85%',
    borderRadius: 6,
    backgroundColor: colors.track,
  },
  placeholderShort: {
    height: 9,
    width: '55%',
    borderRadius: 6,
    backgroundColor: colors.track,
  },
  step: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
  },
  activeStep: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceTint,
  },
  activityHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  activityImage: { width: 52, height: 52 },
  activityIdentity: { flex: 1, minWidth: 0 },
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepCopy: { flex: 1, gap: spacing.xs },
  badge: {
    ...typography.heading,
    color: colors.focus,
    padding: spacing.md,
    backgroundColor: colors.badgeBg,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  done: { backgroundColor: colors.successBg, color: colors.success },
  instruction: { ...typography.label, color: colors.dark, lineHeight: 23 },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    padding: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  editor: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  input: {
    ...typography.input,
    fontSize: 18,
    lineHeight: 30,
    minHeight: 260,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    color: colors.dark,
  },
  result: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.successBg,
    borderRadius: radius.small,
  },
});

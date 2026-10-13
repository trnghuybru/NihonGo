import { memo, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { BrandLogo } from '../components/BrandLogo';
import { useShadowingTranslation } from '../hooks/useShadowingTranslation';
import { useShadowingQuiz } from '../hooks/useShadowingQuiz';
import { ShadowingQuiz } from '../components/ShadowingQuiz';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ReplayIcon,
  MessageSquareIcon,
  PlayCircleIcon,
  XIcon,
  EyeIcon,
  EyeOffIcon,
  TranslateIcon,
  AIIcon,
} from '../components/icons';
import {
  ShadowingTokenText,
  ShadowingWordPopup,
} from '../components/ShadowingWordLookup';
import { VideoExamplePlayer } from '../components/VideoExamplePlayer';
import type { VideoExample } from '../services/videoExamplesService';
import {
  shadowingService,
  ShadowingJob,
  ShadowingLesson,
} from '../services/shadowingService';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

const labels: Record<ShadowingJob['status'], string> = {
  queued: 'Đang chờ xử lý',
  extracting: 'Đang lấy dữ liệu video',
  transcribing: 'Đang tạo phụ đề',
  normalizing: 'Đang chuẩn bị đoạn luyện',
  ready: 'Sẵn sàng luyện',
  failed: 'Chưa chuẩn bị được video',
};

const SegmentRow = memo(function CaptionSegment({
  segment,
  position,
  active,
  onSelect,
  translation,
}: {
  segment: VideoExample;
  position: number;
  active: boolean;
  onSelect: (index: number) => void;
  translation?: string;
}) {
  const onPress = useCallback(() => onSelect(position), [onSelect, position]);
  return (
    <View style={[styles.segment, active && styles.selected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Luyện đoạn ${position + 1}`}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        hitSlop={10}
      >
        <PlayCircleIcon size={18} color={active ? colors.dark : colors.muted} />
      </Pressable>
      <View style={styles.segmentText}>
        <Text style={[styles.subtitleText, active && styles.activeText]}>
          {segment.text}
        </Text>
        {translation ? (
          <Text style={styles.translationText}>{translation}</Text>
        ) : null}
      </View>
    </View>
  );
});

const VideoThumbnail = memo(function Thumbnail({
  videoId,
}: {
  videoId: string;
}) {
  const [failed, setFailed] = useState(false);
  const source = useMemo(
    () => ({ uri: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }),
    [videoId],
  );
  return (
    <View style={styles.thumbnail}>
      {failed ? (
        <View style={styles.thumbnailFallback}>
          <PlayCircleIcon size={36} color={colors.muted} />
          <Text style={styles.caption}>Không tải được ảnh xem trước</Text>
        </View>
      ) : (
        <Image
          source={source}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessible={false}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
});

const ShadowingVideoCard = memo(function VideoCard({
  job,
  busy,
  onOpen,
  onRetry,
}: {
  job: ShadowingJob;
  busy: boolean;
  onOpen: (id: string) => Promise<void>;
  onRetry?: (job: ShadowingJob) => Promise<void>;
}) {
  const ready = job.status === 'ready';
  const title = job.title || 'Video đang được chuẩn bị';
  return (
    <View style={styles.videoCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mở video ${title}`}
        disabled={!ready || busy}
        accessibilityState={{ disabled: !ready || busy }}
        onPress={() => onOpen(job.id)}
      >
        <VideoThumbnail key={job.video_id} videoId={job.video_id} />
        {ready ? (
          <View pointerEvents="none" style={styles.thumbnailPlay}>
            <PlayCircleIcon size={36} color={colors.primaryText} />
          </View>
        ) : null}
      </Pressable>
      <View style={styles.videoCardInfo}>
        <Text style={styles.videoCardTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.videoCardFooter}>
          <Text
            style={[
              styles.videoStatus,
              job.status === 'failed' && styles.failedStatus,
            ]}
          >
            {labels[job.status]}
          </Text>
          {ready ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Luyện shadowing"
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => onOpen(job.id)}
              style={styles.videoAction}
            >
              <PlayCircleIcon size={16} color={colors.primaryText} />
              <Text style={styles.label}>Luyện shadowing</Text>
            </Pressable>
          ) : null}
        </View>
        {job.status === 'failed' ? (
          <Text style={styles.body}>{job.error_message}</Text>
        ) : null}
        {job.can_retry && onRetry ? (
          <AuthButton
            label="Thử lại"
            variant="outline"
            busy={busy}
            onPress={() => onRetry(job)}
          />
        ) : null}
      </View>
    </View>
  );
});

function CatalogSeparator() {
  return <View style={styles.catalogSeparator} />;
}

export function ShadowingScreen({
  onExit,
  bottomOverlayHeight = 0,
}: {
  onExit?: () => void;
  bottomOverlayHeight?: number;
}) {
  const insets = useSafeAreaInsets();
  const bottomScreenInset = bottomOverlayHeight ? 0 : insets.bottom;
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [captionWidth, setCaptionWidth] = useState(0);
  const listRef = useRef<FlatList>(null);
  const [url, setUrl] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const paginated = useRef(false);
  const catalogGeneration = useRef(0);
  const [jobs, setJobs] = useState<ShadowingJob[]>([]);
  const [selectedWordKey, setSelectedWordKey] = useState<string | null>(null);
  const [lookupAnchor, setLookupAnchor] = useState(0);
  const [lesson, setLesson] = useState<ShadowingLesson | null>(null);
  const quiz = useShadowingQuiz(lesson?.job.id);
  const [showTranslation, setShowTranslation] = useState(false);
  const translation = useShadowingTranslation(lesson?.job.id, showTranslation);
  const [index, setIndex] = useState(0);
  const lastCaptionIndex = useRef(0);
  const [seekRequest, setSeekRequest] = useState(0);
  const [captionIndex, setCaptionIndex] = useState(-1);
  const [liveIndex, setLiveIndex] = useState(-1);
  const [continuous, setContinuous] = useState(true);
  const [follow, setFollow] = useState(true);
  const scrollRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTarget = useRef(-1);
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hideCaption, setHideCaption] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const listGeneration = useRef(0);
  const mounted = useRef(true);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const generation = useRef(0);
  const leaveLesson = useCallback(() => {
    generation.current += 1;
    setSettingsOpen(false);
    setSelectedWordKey(null);
    setLesson(null);
    setShowTranslation(false);
    setBusy(false);
    setError('');
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!lesson) {
          if (!onExit) return false;
          onExit();
          return true;
        }
        leaveLesson();
        return true;
      },
    );
    return () => subscription.remove();
  }, [lesson, leaveLesson, onExit]);
  const refresh = useCallback(async () => {
    const current = ++listGeneration.current;
    try {
      const result = await shadowingService.list(scope);
      if (mounted.current && current === listGeneration.current) {
        setJobs(previous =>
          paginated.current
            ? [
                ...result.items,
                ...previous.filter(
                  item => !result.items.some(newItem => newItem.id === item.id),
                ),
              ]
            : result.items,
        );
        if (!paginated.current) setCursor(result.next_cursor ?? null);
        setListError('');
      }
    } catch (failure) {
      if (mounted.current && current === listGeneration.current)
        setListError(
          failure instanceof Error
            ? failure.message
            : 'Không tải được danh sách video.',
        );
    } finally {
      if (mounted.current && current === listGeneration.current)
        setLoading(false);
    }
  }, [scope]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
    });
    return () => {
      mounted.current = false;
      generation.current += 1;
      listGeneration.current += 1;
      subscription.remove();
    };
  }, []);
  const catalogVisible = lesson === null;
  useEffect(() => {
    if (foreground && catalogVisible) refresh();
  }, [refresh, foreground, catalogVisible]);
  useEffect(() => {
    const pending = jobs.some(
      job => job.status !== 'ready' && job.status !== 'failed',
    );
    if (!foreground || !pending) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!disposed) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [jobs, refresh, foreground]);
  const selectScope = (next: 'all' | 'mine') => {
    if (scope === next) return;
    listGeneration.current += 1;
    catalogGeneration.current += 1;
    paginated.current = false;
    setScope(next);
    setJobs([]);
    setCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setListError('');
  };
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || loading) return;
    const current = catalogGeneration.current;
    setLoadingMore(true);
    try {
      const result = await shadowingService.list(scope, cursor);
      if (mounted.current && current === catalogGeneration.current) {
        paginated.current = true;
        setJobs(previous => [
          ...previous,
          ...result.items.filter(
            item => !previous.some(oldItem => oldItem.id === item.id),
          ),
        ]);
        setCursor(result.next_cursor ?? null);
        setListError('');
      }
    } catch (failure) {
      if (mounted.current && current === catalogGeneration.current)
        setListError(
          failure instanceof Error
            ? failure.message
            : 'Không tải thêm được video.',
        );
    } finally {
      if (mounted.current && current === catalogGeneration.current)
        setLoadingMore(false);
    }
  }, [cursor, loadingMore, loading, scope]);
  const open = useCallback(async (id: string) => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await shadowingService.lesson(id);
      if (mounted.current && current === generation.current) {
        setSelectedWordKey(null);
        setLesson(result);
        setShowTranslation(false);
        setIndex(0);
        setPanelOpen(true);
        setSettingsOpen(false);
        setLiveIndex(-1);
        setCaptionIndex(-1);
        setSeekRequest(0);
        lastCaptionIndex.current = 0;
        setContinuous(true);
        setFollow(true);
        setLoop(false);
        setRate(1);
      }
    } catch (failure) {
      if (mounted.current && current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không mở được bài luyện.',
        );
    } finally {
      if (mounted.current && current === generation.current) setBusy(false);
    }
  }, []);
  const submit = useCallback(
    async (job?: ShadowingJob) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        const result = job
          ? await shadowingService.retry(job.id)
          : await shadowingService.submit(url.trim());
        if (!mounted.current) return;
        listGeneration.current += 1;
        setJobs(previous => [
          result.job,
          ...previous.filter(item => item.id !== result.job.id),
        ]);
        setUrl('');
        if (result.job.status === 'ready') await open(result.job.id);
      } catch (failure) {
        if (mounted.current)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không gửi được video.',
          );
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy, open, url],
  );
  const scrollToCaption = useCallback((position: number) => {
    if (position < 0) return;
    scrollTarget.current = position;
    if (scrollRetry.current) {
      clearTimeout(scrollRetry.current);
      scrollRetry.current = null;
    }
    listRef.current?.scrollToIndex({
      index: position,
      animated: true,
      viewPosition: 0.25,
    });
  }, []);
  const captions = lesson?.captions ?? lesson?.segments;
  const practiceIndices = useMemo(
    () =>
      new Map(
        lesson?.segments.map((segment, position) => [segment.id, position]),
      ),
    [lesson],
  );
  const captionChanged = useCallback(
    (position: number) => {
      setCaptionIndex(position);
      const cue = captions?.[position];
      const practiceId =
        cue && ('segment_id' in cue ? (cue.segment_id as string) : cue.id);
      const practiceIndex = practiceId
        ? practiceIndices.get(practiceId) ?? -1
        : -1;
      if (practiceIndex >= 0) lastCaptionIndex.current = practiceIndex;
      setLiveIndex(practiceIndex);
    },
    [captions, practiceIndices],
  );
  const selectSegment = useCallback(
    (position: number) => {
      lastCaptionIndex.current = position;
      setIndex(position);
      setSeekRequest(value => value + 1);
      setLiveIndex(position);
      const id = lesson?.segments[position]?.id;
      setCaptionIndex(
        captions?.findIndex(
          cue => ('segment_id' in cue ? cue.segment_id : cue.id) === id,
        ) ?? -1,
      );
      setFollow(true);
    },
    [captions, lesson],
  );
  const showWord = useCallback(
    (key: string, pageY: number) => {
      if (!lesson?.words?.[key]) return;
      setLookupAnchor(pageY);
      setSelectedWordKey(key);
    },
    [lesson],
  );
  const closeWord = useCallback(() => setSelectedWordKey(null), []);
  const lookupWord = selectedWordKey
    ? lesson?.words?.[selectedWordKey] ?? null
    : null;
  const renderSegment = useCallback(
    ({ item, index: position }: { item: VideoExample; index: number }) => (
      <SegmentRow
        segment={item}
        position={position}
        active={position === liveIndex}
        onSelect={selectSegment}
        translation={
          showTranslation ? translation.data?.items[item.id] : undefined
        }
      />
    ),
    [liveIndex, selectSegment, showTranslation, translation.data],
  );
  const stopFollowing = useCallback(() => {
    setFollow(false);
    scrollTarget.current = -1;
    if (scrollRetry.current) {
      clearTimeout(scrollRetry.current);
      scrollRetry.current = null;
    }
  }, []);
  useEffect(
    () => () => {
      if (scrollRetry.current) {
        clearTimeout(scrollRetry.current);
        scrollRetry.current = null;
      }
    },
    [lesson],
  );
  useEffect(() => {
    if (lesson && panelOpen && follow) scrollToCaption(liveIndex);
  }, [lesson, panelOpen, follow, liveIndex, scrollToCaption]);
  const renderJob = useCallback(
    ({ item }: { item: ShadowingJob }) => (
      <ShadowingVideoCard
        job={item}
        busy={busy}
        onOpen={open}
        onRetry={item.can_retry ? submit : undefined}
      />
    ),
    [busy, open, submit],
  );
  if (lesson) {
    const current = liveIndex >= 0 ? liveIndex : lastCaptionIndex.current;
    const captionText =
      captionIndex >= 0 && captions?.[captionIndex]
        ? captions[captionIndex].text
        : '';
    const currentTokens =
      !hideCaption && captionIndex >= 0
        ? lesson.tokens?.captions[captions?.[captionIndex]?.id ?? ''] ??
          lesson.tokens?.segments[captions?.[captionIndex]?.id ?? '']
        : undefined;
    const tokenSpacing =
      Math.max(
        0,
        (currentTokens?.filter(token => token.text.trim()).length ?? 1) - 1,
      ) * spacing.sm;
    // Japanese glyphs use roughly one em; Latin text needs less horizontal space.
    // Native wrapping/scrolling remains the fallback for unusually wide glyphs.
    const units = Array.from(captionText).reduce(
      (total, character) =>
        total +
        (/\s/.test(character)
          ? 0.35
          : /[\u0020-\u007e]/.test(character)
          ? 0.6
          : 1),
      0,
    );
    const availableWidth =
      captionWidth || Math.min(windowWidth, layout.maxContentWidth) - 80;
    const fontSize = Math.max(
      16,
      Math.min(
        22,
        Math.floor(
          (availableWidth * 2 - tokenSpacing) /
            Math.max(1, units * fontScale) /
            2,
        ) * 2,
      ),
    );
    const lineHeight = Math.ceil(fontSize * 1.45);
    const captionOverflows =
      units * fontSize * fontScale + tokenSpacing > availableWidth * 2;
    return (
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top,
            paddingBottom: bottomScreenInset,
            paddingHorizontal: spacing.sm,
          },
        ]}
      >
        <View style={styles.fixedHeader}>
          <View style={styles.backRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Danh sách video"
              onPress={leaveLesson}
              hitSlop={6}
              style={styles.backButton}
            >
              <ChevronLeftIcon size={18} color={colors.dark} />
            </Pressable>
            <Text style={styles.heading}>Shadowing</Text>
          </View>
          <View style={styles.videoStage}>
            {lesson.segments[index] ? (
              <VideoExamplePlayer
                pausedForLookup={Boolean(lookupWord)}
                pausedForQuiz={quiz.paused}
                quizCheckpoints={quiz.checkpoints}
                onQuizQuestion={quiz.showQuestion}
                resumeRequest={quiz.resumeRequest}
                quizJumpRequest={quiz.jumpRequest}
                videoOnly
                key={lesson.job.id}
                example={lesson.segments[index]}
                query=""
                position={liveIndex >= 0 ? liveIndex + 1 : 0}
                count={lesson.segments.length}
                seekRequest={seekRequest}
                timeline={captions}
                continuous={continuous}
                onCaptionChange={captionChanged}
                onReplay={() => selectSegment(current)}
                hideCaption={hideCaption}
                playbackRate={rate}
                loop={loop}
                onPrevious={
                  current > 0 ? () => selectSegment(current - 1) : undefined
                }
                onNext={
                  current < lesson.segments.length - 1
                    ? () => selectSegment(current + 1)
                    : undefined
                }
              />
            ) : null}
          </View>
          <AuthNotice error message={error} />
          {!hideCaption ? (
            <View style={styles.currentCaptionArea}>
              <View
                testID="shadowing-current-caption"
                style={styles.currentCaptionBox}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={hideCaption ? 'Hiện phụ đề' : 'Ẩn phụ đề'}
                  accessibilityState={{ selected: !hideCaption }}
                  onPress={() => setHideCaption(value => !value)}
                  hitSlop={6}
                  style={styles.captionVisibility}
                >
                  {hideCaption ? (
                    <EyeOffIcon size={18} color={colors.muted} />
                  ) : (
                    <EyeIcon size={18} color={colors.primaryText} />
                  )}
                </Pressable>
                <ScrollView
                  key={captionIndex}
                  style={[
                    styles.currentCaptionScroll,
                    {
                      maxHeight: Math.ceil(
                        (lineHeight + 18) * fontScale * 2 + spacing.xs,
                      ),
                    },
                  ]}
                  onLayout={event =>
                    setCaptionWidth(Math.round(event.nativeEvent.layout.width))
                  }
                  nestedScrollEnabled
                >
                  <ShadowingTokenText
                    text={captionText}
                    tokens={currentTokens}
                    words={lesson.words}
                    selectedKey={selectedWordKey}
                    onWordPress={showWord}
                    style={[
                      styles.currentCaptionText,
                      { fontSize, lineHeight },
                    ]}
                  />
                </ScrollView>
                {!hideCaption && captionIndex >= 0 && captionOverflows ? (
                  <Text style={styles.captionOverflowHint}>
                    Cuộn để đọc đầy đủ
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          {showTranslation && !hideCaption ? (
            <View style={styles.translationArea}>
              {!hideCaption &&
              liveIndex >= 0 &&
              translation.data?.items[lesson.segments[liveIndex]?.id] ? (
                <ScrollView
                  style={styles.translationScroll}
                  nestedScrollEnabled
                >
                  <Text style={styles.currentTranslation}>
                    {translation.data.items[lesson.segments[liveIndex].id]}
                  </Text>
                </ScrollView>
              ) : null}
              {translation.loading ||
              translation.data?.status === 'queued' ||
              translation.data?.status === 'translating' ? (
                <Text style={styles.caption}>
                  Đang chuẩn bị bản dịch
                  {translation.data
                    ? ` · ${translation.data.completed}/${translation.data.total} câu`
                    : '…'}
                </Text>
              ) : null}
              {translation.error || translation.data?.status === 'failed' ? (
                <View style={styles.translationRetry}>
                  <Text style={styles.caption}>
                    {translation.error ||
                      translation.data?.error_message ||
                      'Chưa dịch được phụ đề.'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Thử lại bản dịch"
                    onPress={translation.retry}
                    hitSlop={8}
                  >
                    <Text style={styles.label}>Thử lại</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.toolbarFrame}
            contentContainerStyle={styles.toolbar}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Phụ đề"
              accessibilityState={{ expanded: panelOpen }}
              onPress={() => {
                setPanelOpen(value => !value);
              }}
              hitSlop={6}
              style={[styles.toolIcon, panelOpen && styles.selected]}
            >
              <MessageSquareIcon color={colors.primaryText} size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bản dịch"
              accessibilityState={{ selected: showTranslation }}
              onPress={() => setShowTranslation(value => !value)}
              hitSlop={6}
              style={[styles.toolIcon, showTranslation && styles.selected]}
            >
              <TranslateIcon
                size={18}
                color={showTranslation ? colors.primaryText : colors.body}
              />
            </Pressable>
            <View style={styles.toolbarSpace} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Câu hỏi AI"
              accessibilityHint={`Mở câu hỏi AI. Đã trả lời ${quiz.completed.length}/${quiz.questions.length} câu.`}
              accessibilityState={{ selected: quiz.questions.length > 0 }}
              onPress={() => quiz.setSetupOpen(true)}
              style={[
                styles.toolIcon,
                quiz.questions.length > 0 && styles.selected,
              ]}
            >
              <AIIcon
                size={20}
                color={quiz.questions.length ? colors.primaryText : colors.body}
              />
            </Pressable>
            {hideCaption ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hiện phụ đề"
                accessibilityState={{ selected: false }}
                onPress={() => setHideCaption(false)}
                hitSlop={6}
                style={styles.toolIcon}
              >
                <EyeOffIcon size={18} color={colors.muted} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Theo dõi phụ đề"
              accessibilityHint="Quay về câu hiện tại và tự cuộn theo video."
              accessibilityState={{ checked: follow }}
              onPress={() => {
                if (follow) stopFollowing();
                else setFollow(true);
              }}
              hitSlop={8}
              style={[styles.toolIcon, follow && styles.selected]}
            >
              <Text style={styles.label}>↓</Text>
            </Pressable>
            <View style={styles.playbackControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ví dụ trước"
                disabled={current <= 0}
                accessibilityState={{ disabled: current <= 0 }}
                hitSlop={10}
                onPress={() => selectSegment(current - 1)}
                style={styles.stepButton}
              >
                <ChevronLeftIcon
                  size={18}
                  color={current > 0 ? colors.body : colors.disabledText}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nghe lại"
                hitSlop={10}
                onPress={() => selectSegment(current)}
                style={styles.replayControl}
              >
                <ReplayIcon size={16} color={colors.primaryText} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ví dụ tiếp"
                disabled={current >= lesson.segments.length - 1}
                accessibilityState={{
                  disabled: current >= lesson.segments.length - 1,
                }}
                hitSlop={10}
                onPress={() => selectSegment(current + 1)}
                style={styles.stepButton}
              >
                <ChevronRightIcon
                  size={18}
                  color={
                    current < lesson.segments.length - 1
                      ? colors.body
                      : colors.disabledText
                  }
                />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tuỳ chọn shadowing"
              onPress={() => setSettingsOpen(true)}
              hitSlop={8}
              style={styles.toolIcon}
            >
              <Text style={styles.moreIcon}>•••</Text>
            </Pressable>
          </ScrollView>
        </View>
        {panelOpen ? (
          <View style={styles.subtitlePanel}>
            <FlatList
              ref={listRef}
              style={styles.subtitleList}
              data={lesson.segments}
              keyExtractor={item => item.id}
              extraData={{ liveIndex, showTranslation }}
              contentContainerStyle={[
                styles.lessonContent,
                { paddingBottom: bottomOverlayHeight + spacing.xl },
              ]}
              scrollIndicatorInsets={{ bottom: bottomOverlayHeight }}
              onScrollBeginDrag={stopFollowing}
              onScrollToIndexFailed={info => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: false,
                });
                if (scrollRetry.current) return;
                scrollRetry.current = setTimeout(() => {
                  if (scrollTarget.current === info.index)
                    listRef.current?.scrollToIndex({
                      index: info.index,
                      animated: true,
                      viewPosition: 0.25,
                    });
                  scrollRetry.current = null;
                }, 150);
              }}
              ListHeaderComponent={
                lesson.caption_kind === 'asr' ? (
                  <Text style={styles.caption}>
                    Phụ đề tự động có thể có lỗi. Hãy đối chiếu với lời nói
                    trong video.
                  </Text>
                ) : undefined
              }
              renderItem={renderSegment}
            />
          </View>
        ) : (
          <View style={styles.closedPanel}>
            <Text style={styles.caption}>
              Bấm “Phụ đề” để mở danh sách câu.
            </Text>
          </View>
        )}
        <ShadowingWordPopup
          word={lookupWord}
          anchorY={lookupAnchor}
          onClose={closeWord}
        />
        <ShadowingQuiz
          quiz={quiz}
          maxCount={Math.min(10, lesson.segments.length)}
          onStarted={() => {
            setContinuous(true);
            setLoop(false);
            setSelectedWordKey(null);
            selectSegment(0);
          }}
        />
        <Modal
          visible={settingsOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSettingsOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Đóng tuỳ chọn"
              onPress={() => setSettingsOpen(false)}
            />
            <View
              style={[
                styles.settingsSheet,
                { paddingBottom: insets.bottom + spacing.xl },
              ]}
              accessibilityViewIsModal
            >
              <View style={styles.lessonTop}>
                <Text style={styles.panelTitle}>Tuỳ chọn luyện nghe</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đóng tuỳ chọn luyện nghe"
                  hitSlop={8}
                  style={styles.toolIcon}
                  onPress={() => setSettingsOpen(false)}
                >
                  <XIcon size={16} color={colors.body} />
                </Pressable>
              </View>
              <View style={styles.controls}>
                {[true, false].map(value => (
                  <Pressable
                    key={String(value)}
                    accessibilityRole="radio"
                    accessibilityLabel={
                      value ? 'Nghe liên tục' : 'Luyện từng đoạn'
                    }
                    accessibilityState={{ checked: continuous === value }}
                    onPress={() => {
                      setContinuous(value);
                      setLoop(false);
                      setIndex(current);
                    }}
                    style={[
                      styles.chip,
                      continuous === value && styles.selected,
                    ]}
                  >
                    <Text style={styles.label}>
                      {value ? 'Nghe liên tục' : 'Từng đoạn'}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tốc độ ${rate}x`}
                  accessibilityHint="Bấm để đổi giữa 1, 0.75 và 0.5 lần tốc độ."
                  onPress={() =>
                    setRate(value =>
                      value === 1 ? 0.75 : value === 0.75 ? 0.5 : 1,
                    )
                  }
                  style={styles.chip}
                >
                  <Text style={styles.label}>{rate}×</Text>
                </Pressable>
              </View>
              <View style={styles.controls}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="Lặp đoạn"
                  accessibilityState={{ checked: loop }}
                  onPress={() => {
                    setLoop(value => !value);
                    setContinuous(false);
                    setIndex(current);
                  }}
                  style={[styles.chip, loop && styles.selected]}
                >
                  <Text style={styles.label}>Lặp đoạn</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={jobs}
        renderItem={renderJob}
        keyExtractor={job => job.id}
        ItemSeparatorComponent={CatalogSeparator}
        initialNumToRender={4}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.catalogContent,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom:
              Math.max(insets.bottom, bottomOverlayHeight) + spacing.xl,
          },
        ]}
        ListHeaderComponent={
          <View style={styles.catalogHeader}>
            <BrandLogo />
            <View style={styles.catalogCopy}>
              <Text accessibilityRole="header" style={styles.catalogTitle}>
                Nghe & shadowing
              </Text>
            </View>
            <AuthNotice error message={error} />
            <AuthNotice error message={listError} />
            <View style={styles.importFrame}>
              <View style={styles.sourceTab}>
                <PlayCircleIcon size={20} color={colors.primaryText} />
                <Text style={styles.sourceLabel}>YouTube</Text>
              </View>
              <View style={styles.importCard}>
                <Text style={styles.heading}>Link YouTube</Text>
                <TextInput
                  accessibilityLabel="Link YouTube"
                  placeholder="Dán link video YouTube tiếng Nhật…"
                  placeholderTextColor={colors.placeholder}
                  value={url}
                  onChangeText={setUrl}
                  maxLength={2048}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.input}
                />
                <Text style={styles.body}>
                  Video dài tối đa 20 phút. Bạn có thể tiếp tục dùng app trong
                  lúc chuẩn bị.
                </Text>
                <AuthButton
                  label="Chuẩn bị video"
                  busy={busy}
                  disabled={!url.trim()}
                  onPress={() => submit()}
                />
              </View>
            </View>
            <View style={styles.catalogScopes}>
              {(['all', 'mine'] as const).map(value => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  hitSlop={6}
                  accessibilityLabel={
                    value === 'all' ? 'Tất cả video' : 'Video của tôi'
                  }
                  accessibilityState={{
                    selected: scope === value,
                    disabled: busy,
                  }}
                  disabled={busy}
                  onPress={() => selectScope(value)}
                  style={[
                    styles.scopeButton,
                    scope === value && styles.selected,
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeLabel,
                      scope === value && styles.scopeActive,
                    ]}
                  >
                    {value === 'all' ? 'Tất cả video' : 'Video của tôi'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.body}>
            {loading
              ? 'Đang tải video…'
              : scope === 'mine'
              ? 'Bạn chưa thêm video nào. Dán một link YouTube để bắt đầu.'
              : 'Chưa có video. Thêm một link để bắt đầu luyện shadowing.'}
          </Text>
        }
        ListFooterComponent={
          <View>
            {loadingMore ? (
              <Text style={styles.caption}>Đang tải thêm video…</Text>
            ) : null}
            <AuthButton
              label="Làm mới"
              variant="text"
              onPress={() => {
                paginated.current = false;
                refresh();
              }}
            />
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  translationText: {
    ...typography.body,
    color: colors.muted,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  translationArea: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  translationScroll: { maxHeight: 72 },
  currentTranslation: {
    ...typography.label,
    color: colors.body,
    textAlign: 'center',
  },
  translationRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  screen: { flex: 1, backgroundColor: colors.background },
  catalogContent: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
  },
  catalogHeader: { gap: spacing.lg, paddingBottom: spacing.lg },
  catalogCopy: { gap: spacing.sm },
  catalogTitle: { ...typography.title, color: colors.dark },
  catalogSubtitle: { ...typography.input, color: colors.body },
  catalogScopes: { flexDirection: 'row', gap: spacing.sm },
  scopeButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  scopeLabel: { ...typography.caption, color: colors.muted },
  scopeActive: { color: colors.primaryText },
  catalogSeparator: { height: spacing.lg },
  importFrame: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  sourceTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.small,
    borderTopRightRadius: radius.small,
  },
  sourceLabel: { ...typography.label, color: colors.primaryText },
  importCard: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    borderTopLeftRadius: 0,
  },
  videoCard: {
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
    boxShadow: shadowSm,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.track,
  },
  thumbnailFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumbnailPlay: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  videoCardInfo: { padding: spacing.lg, gap: spacing.sm },
  videoCardTitle: {
    ...typography.label,
    fontSize: 14,
    lineHeight: 20,
    color: colors.dark,
  },
  videoCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  videoStatus: { ...typography.caption, color: colors.muted, flex: 1 },
  failedStatus: { color: colors.danger },
  videoAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
  },
  lessonContent: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  fixedHeader: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: spacing.sm,
  },
  videoStage: { position: 'relative' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentCaptionArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 104,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  currentCaptionBox: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.lg + 32,
    paddingVertical: spacing.md,
    width: '100%',
    minHeight: layout.touchTarget,
  },
  captionVisibility: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  captionOverflowHint: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  currentCaptionScroll: { maxHeight: 64 },
  currentCaptionText: {
    ...typography.title,
    fontSize: 22,
    lineHeight: 32,
    color: colors.dark,
    textAlign: 'center',
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary,
  },
  toolbarFrame: { flexGrow: 0 },
  toolbar: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: spacing.sm,
  },
  toolbarSpace: { flex: 1 },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepButton: {
    width: 28,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replayControl: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  toolIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
  },
  moreIcon: { ...typography.label, color: colors.body },
  subtitlePanel: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  panelTitle: { ...typography.heading, color: colors.dark },
  subtitleText: {
    ...typography.input,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
  segmentText: { flex: 1 },
  closedPanel: { flex: 1, alignItems: 'center', padding: spacing.xl },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(37,37,38,0.35)',
  },
  settingsSheet: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  lessonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  subtitleList: { flex: 1 },
  followButton: {
    flexShrink: 1,
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  activeText: { color: colors.dark },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.small,
    gap: spacing.md,
    boxShadow: shadowSm,
  },
  heading: { ...typography.heading, color: colors.dark },
  body: { ...typography.body, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  label: { ...typography.caption, color: colors.primaryText },
  input: {
    ...typography.input,
    color: colors.dark,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  eye: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  segment: {
    padding: spacing.md,
    borderRadius: radius.small,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.surfaceTint,
    borderColor: colors.primary,
  },
});

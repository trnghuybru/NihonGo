import { JlptSourceViewer } from '../components/JlptSourceViewer';
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AuthButton, AuthNotice, AuthShell } from '../components/AuthForm';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { ShadowingTokenText } from '../components/ShadowingWordLookup';
import { useJlptReview } from '../components/JlptReviewSupport';
import { JlptTimedTransition } from '../components/JlptTimedTransition';
import {
  canAnswer,
  ExamMode,
  nextTiming,
  settleTiming,
  startTiming,
} from '../services/jlptTiming';
import { useWebLayout } from '../hooks/useWebLayout';
import { colors, spacing, typography } from '../theme/theme';
import {
  Exam,
  ExamGrade,
  ExamSource,
  ExamPreview,
  ExamQuestion,
  jlptService,
} from '../services/jlptService';
import {
  ExamDraft,
  ExamProgress,
  loadExamDrafts,
  readExamDraft,
  readExamProgress,
  saveExamDraft,
} from '../services/jlptDraft';

const message = (failure: unknown) =>
  failure instanceof Error
    ? failure.message
    : 'Chưa tải được đề thi. Hãy thử lại.';

const questionLabel = (
  question: Pick<ExamQuestion, 'number' | 'subquestion'>,
) =>
  `${question.number}${
    question.subquestion ? `(${question.subquestion})` : ''
  }`;

function RestartExamDialog({
  visible,
  onConfirm,
  onCancel,
  busy = false,
  error = '',
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}) {
  if (!visible) return null;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View style={styles.dialogOverlay}>
        <View accessibilityViewIsModal style={styles.dialogCard}>
          <Text accessibilityRole="header" style={styles.heading}>
            Làm lại đề thi?
          </Text>
          <Text style={styles.body}>
            Đáp án và tiến độ hiện tại sẽ được thay bằng lượt làm mới.
          </Text>
          <AuthNotice message={error} error />
          <AuthButton
            label="Bắt đầu lại"
            onPress={onConfirm}
            busy={busy}
            size="compact"
          />
          <AuthButton
            label="Giữ bài hiện tại"
            onPress={onCancel}
            disabled={busy}
            variant="text"
            size="compact"
          />
        </View>
      </View>
    </Modal>
  );
}

function ElapsedTime({
  elapsedMs,
  activeSince,
  stopped,
}: {
  elapsedMs: number;
  activeSince: number;
  stopped: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (stopped) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stopped, activeSince]);
  const seconds = Math.floor(
    (elapsedMs + (stopped ? 0 : Math.max(0, now - activeSince))) / 1000,
  );
  return (
    <Text style={styles.caption}>
      Đã làm {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </Text>
  );
}

export function JlptScreen({
  accountId = 'session',
  onExit,
}: {
  accountId?: string;
  onExit?: () => void;
}) {
  const [catalog, setCatalog] = useState<ExamPreview[] | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [source, setSource] = useState<ExamSource | null>(null);
  const [startFresh, setStartFresh] = useState(false);
  const [restartId, setRestartId] = useState<string | null>(null);
  const closeExam = useCallback(() => setExam(null), []);
  const { width } = useWindowDimensions();
  const { contentWidth } = useWebLayout();
  const catalogWidth = contentWidth || width;
  const catalogColumns = catalogWidth >= 900 ? 4 : catalogWidth >= 560 ? 2 : 1;
  const realCards = (catalog ?? []).map(item => ({
    ...item,
    progress: item.source_only ? null : readExamProgress(accountId, item),
  }));
  const latestDraftId = realCards
    .filter(item => item.progress && !item.progress.submitted)
    .sort((a, b) => b.progress!.updatedAt - a.progress!.updatedAt)[0]?.id;
  const catalogCards: (Pick<ExamPreview, 'id' | 'level' | 'year' | 'month'> & {
    sample?: boolean;
    source_only?: boolean;
    progress?: ExamProgress | null;
  })[] = realCards;
  const alive = useRef(true);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await jlptService.list();
      await loadExamDrafts(accountId, response.items);
      if (alive.current) setCatalog(response.items);
    } catch (failure) {
      if (alive.current) setError(message(failure));
    }
  }, [accountId]);
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  const open = async (id: string, fresh = false) => {
    if (opening) return;
    setOpening(id);
    setError('');
    try {
      if (catalog?.find(e => e.id === id)?.source_only) {
        const response = await jlptService.source(id);
        if (alive.current) setSource(response);
        return;
      }
      const response = await jlptService.exam(id);
      if (alive.current) {
        setStartFresh(fresh);
        setRestartId(null);
        setExam(response);
      }
    } catch (failure) {
      if (alive.current) setError(message(failure));
    } finally {
      if (alive.current) setOpening(null);
    }
  };
  if (source)
    return <JlptSourceViewer source={source} onExit={() => setSource(null)} />;
  if (exam)
    return (
      <ExamWorkspace
        key={`${accountId}:${exam.id}`}
        exam={exam}
        accountId={accountId}
        startFresh={startFresh}
        onExit={closeExam}
      />
    );
  return (
    <AuthShell
      title="Luyện thi JLPT"
      subtitle=""
      card={false}
      wide
      compactHeader
      hideHeader={Boolean(onExit)}
    >
      {onExit ? (
        <ScreenBackHeader
          title="Luyện thi JLPT"
          backLabel="Quay lại luyện tập"
          onBack={onExit}
        />
      ) : null}
      <AuthNotice message={error} error />
      <RestartExamDialog
        visible={restartId !== null}
        onCancel={() => setRestartId(null)}
        onConfirm={() => {
          if (restartId) open(restartId, true);
        }}
        busy={opening !== null}
        error={error}
      />
      {catalog === null && !error ? (
        <ActivityIndicator color={colors.primaryText} />
      ) : null}
      {error && catalog === null ? (
        <AuthButton
          label="Tải lại danh sách đề"
          onPress={load}
          variant="outline"
          size="compact"
        />
      ) : null}
      {catalog?.length === 0 ? (
        <Text style={styles.body}>Chưa có kỳ thi nào được thêm.</Text>
      ) : null}
      <View style={styles.catalogGrid}>
        {catalogCards.map(item => (
          <View
            key={item.id}
            style={[
              styles.examCard,
              item.id === latestDraftId && styles.latestExam,
              catalogColumns === 2 && styles.twoColumnExam,
              catalogColumns === 1 && styles.singleColumnExam,
            ]}
          >
            <View style={styles.examCardTop}>
              <View style={styles.level}>
                <Text style={styles.levelText}>{item.level}</Text>
              </View>
              <Text accessibilityRole="header" style={styles.examTitle}>
                Tháng {item.month}/{item.year}
              </Text>
              {item.sample ? <Text style={styles.sampleLabel}>Mẫu</Text> : null}
              {item.progress ? (
                <Text
                  style={[
                    styles.examState,
                    item.progress.submitted && styles.completedState,
                  ]}
                >
                  {item.progress.submitted ? 'Đã nộp' : 'Đang làm dở'}
                </Text>
              ) : null}
            </View>
            <View style={styles.examProgress}>
              <Text
                style={
                  item.progress?.submitted ? styles.resultScore : styles.caption
                }
              >
                {item.progress?.submitted
                  ? item.progress.correct !== undefined
                    ? `${item.progress.correct}/${item.progress.total} câu đúng`
                    : 'Đã hoàn thành bài làm'
                  : item.progress
                  ? `${item.progress.answered}/${item.progress.total} câu đã trả lời`
                  : item.source_only
                  ? 'Tài liệu đề & đáp án gốc'
                  : 'Chưa làm'}
              </Text>
              {item.progress && !item.progress.submitted ? (
                <View
                  style={styles.cardProgressTrack}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Tiến độ trả lời"
                  accessibilityValue={{
                    min: 0,
                    max: item.progress.total,
                    now: item.progress.answered,
                  }}
                >
                  <View
                    style={[
                      styles.cardProgressFill,
                      item.progress.answered > 0 && styles.visibleProgressFill,
                      {
                        width: `${
                          (item.progress.answered / item.progress.total) * 100
                        }%`,
                      },
                    ]}
                  />
                </View>
              ) : null}
              {item.id === latestDraftId ? (
                <Text style={styles.resumeHint}>Lần làm gần nhất</Text>
              ) : null}
            </View>
            <View style={styles.examActions}>
              <View style={styles.examMainAction}>
                <AuthButton
                  label={
                    item.progress?.submitted
                      ? 'Xem kết quả'
                      : item.progress
                      ? 'Tiếp tục'
                      : item.source_only
                      ? 'Xem đề gốc'
                      : 'Mở đề thi'
                  }
                  onPress={() => {
                    if (!item.sample) open(item.id);
                  }}
                  busy={opening === item.id}
                  disabled={
                    item.sample || (opening !== null && opening !== item.id)
                  }
                  size="compact"
                  variant={item.id === latestDraftId ? 'primary' : 'outline'}
                />
              </View>
              {item.progress && !item.sample ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Làm lại đề"
                  accessibilityState={{ disabled: opening !== null }}
                  onPress={() => setRestartId(item.id)}
                  disabled={opening !== null}
                  style={({ pressed }) => [
                    styles.examRestart,
                    pressed && styles.examRestartPressed,
                  ]}
                >
                  <Text style={styles.examRestartText}>Làm lại</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </AuthShell>
  );
}

function ExamWorkspace({
  exam,
  accountId,
  onExit,
  startFresh = false,
}: {
  exam: Exam;
  accountId: string;
  onExit: () => void;
  startFresh?: boolean;
}) {
  const [draft, setDraft] = useState<ExamDraft>(
    () =>
      (!startFresh ? readExamDraft(accountId, exam) : null) ?? {
        version: exam.version,
        answers: {},
        flagged: [],
        index: 0,
        startedAt: Date.now(),
        submitted: false,
        mode: 'practice',
      },
  );
  const [grade, setGrade] = useState<ExamGrade | null>(null);
  const elapsedBase = useRef(draft.elapsedMs ?? 0);
  const activeSince = useRef(Date.now());
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const snapshot = (value: ExamDraft): ExamDraft => ({
    ...value,
    elapsedMs: value.submitted
      ? value.elapsedMs ?? elapsedBase.current
      : elapsedBase.current + Date.now() - activeSince.current,
  });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restartConfirming, setRestartConfirming] = useState(false);
  const [timedConfirming, setTimedConfirming] = useState(false);
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [now, setNow] = useState(Date.now);
  const autoSubmitted = useRef(false);
  const alive = useRef(true);
  const sending = useRef(false);
  const questionCard = useRef<ComponentRef<typeof View>>(null);
  const { width } = useWindowDimensions();
  const { contentWidth } = useWebLayout();
  const wide = (contentWidth || width) >= 980;
  const entries = exam.sections.flatMap(section =>
    section.questions.map(question => ({ section, question })),
  );
  const { section, question } = entries[draft.index];
  const imageOnly = question.content_format === 'image';
  const answered = Object.keys(draft.answers).length;
  const result = grade?.results[question.id];
  const study = useJlptReview(
    exam.id,
    question,
    imageOnly ? undefined : grade?.review_token,
  );
  const timed = draft.mode === 'timed';
  const timing = draft.timing;
  const timedLocked =
    timed && !grade && (!timing || !canAnswer(exam, timing, question.id, now));
  useEffect(() => {
    if (!timed || draft.submitted || timing?.phase !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [timed, draft.submitted, timing?.phase]);
  useEffect(() => {
    if (!timed || !timing || draft.submitted) return;
    const next = settleTiming(exam, timing, now);
    if (next !== timing) {
      setConfirming(false);
      setDraft(value => ({ ...value, timing: next }));
    }
  }, [exam, timed, timing, now, draft.submitted]);
  const flagged = draft.flagged.includes(question.id);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>(
    'saving',
  );
  const saveVersion = useRef(0);
  useEffect(() => {
    const version = ++saveVersion.current;
    setSaveState('saving');
    saveExamDraft(accountId, exam.id, snapshot(draft)).then(saved => {
      if (alive.current && version === saveVersion.current)
        setSaveState(saved ? 'saved' : 'error');
    });
  }, [accountId, exam.id, draft]);
  const submit = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await jlptService.grade(
        exam.id,
        exam.version,
        draft.answers,
      );
      if (!alive.current) return;
      setGrade(response);
      setConfirming(false);
      setDraft(value => ({
        ...snapshot(value),
        submitted: true,
        result: {
          correct: response.correct,
          answered: response.answered,
          total: response.total,
        },
      }));
    } catch (failure) {
      if (alive.current) setError(message(failure));
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }, [exam.id, exam.version, draft.answers]);
  useEffect(() => {
    if (
      timed &&
      timing?.phase === 'complete' &&
      !draft.submitted &&
      !autoSubmitted.current
    ) {
      autoSubmitted.current = true;
      submit();
    }
  }, [timed, timing?.phase, draft.submitted, submit]);
  useEffect(() => {
    alive.current = true;
    if (draft.submitted) submit();
    return () => {
      alive.current = false;
      saveExamDraft(accountId, exam.id, snapshot(draftRef.current));
    };
    // Restore a submitted draft once; later answer changes never submit automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (index: number) => {
    if (
      busy ||
      draft.submitted ||
      grade ||
      (timed && (!timing || !canAnswer(exam, timing, question.id)))
    )
      return;
    setDraft(value => ({
      ...value,
      answers: { ...value.answers, [question.id]: index },
    }));
  };
  const move = (index: number) => {
    if (
      timed &&
      !grade &&
      (!timing || !canAnswer(exam, timing, entries[index].question.id))
    )
      return;
    setDraft(value => ({ ...value, index }));
    setMapOpen(false);
    // Keep the current item visible after moving from a long reading passage.
    if (Platform.OS === 'web')
      requestAnimationFrame(() => {
        (
          questionCard.current as unknown as {
            scrollIntoView?: (options: ScrollIntoViewOptions) => void;
          }
        )?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      });
  };
  const nextUnanswered = entries.findIndex(
    e => draft.answers[e.question.id] === undefined,
  );
  const visibleIndexes = entries.flatMap((entry, index) =>
    (!timed ||
      grade ||
      entry.section.id === exam.sections[timing?.section ?? 0]?.id) &&
    (!onlyMistakes || grade?.results[entry.question.id].status !== 'correct')
      ? [index]
      : [],
  );
  const previous = visibleIndexes.filter(index => index < draft.index).pop();
  const next = visibleIndexes.find(index => index > draft.index);
  const targetAt = question.target
    ? question.prompt.indexOf(question.target)
    : -1;
  const numberOnlyOptions = question.options.every(
    (option, index) => option === String(index + 1),
  );
  const restart = (nextMode: ExamMode = draft.mode ?? 'practice') => {
    setGrade(null);
    setOnlyMistakes(false);
    setConfirming(false);
    setRestartConfirming(false);
    setTimedConfirming(false);
    setMapOpen(false);
    setError('');
    elapsedBase.current = 0;
    activeSince.current = Date.now();
    autoSubmitted.current = false;
    setNow(Date.now());
    setDraft({
      version: exam.version,
      answers: {},
      flagged: [],
      index: 0,
      startedAt: Date.now(),
      elapsedMs: 0,
      submitted: false,
      mode: nextMode,
      timing: nextMode === 'timed' ? startTiming(exam) : undefined,
    });
  };
  return (
    <AuthShell title={exam.title} subtitle="" card={false} wide hideHeader>
      {study.popup}
      {timed && !grade && !draft.submitted && timing?.phase === 'between' ? (
        <JlptTimedTransition
          exam={exam}
          completed={timing.section}
          error={error}
          busy={busy}
          onExit={onExit}
          onSubmit={submit}
          onStart={() => {
            try {
              const nextPart = nextTiming(exam, timing);
              const index = entries.findIndex(
                e => e.section.id === exam.sections[nextPart.section].id,
              );
              setNow(Date.now());
              setDraft(value => ({ ...value, index, timing: nextPart }));
            } catch (failure) {
              setError(message(failure));
            }
          }}
        />
      ) : null}
      <RestartExamDialog
        visible={restartConfirming}
        onConfirm={() => restart()}
        onCancel={() => setRestartConfirming(false)}
      />
      {timedConfirming ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setTimedConfirming(false)}
        >
          <View style={styles.dialogOverlay}>
            <View accessibilityViewIsModal style={styles.dialogCard}>
              <Text accessibilityRole="header" style={styles.heading}>
                Thi thử tính giờ
              </Text>
              {exam.sections.map(s => (
                <Text key={s.id} style={styles.body}>
                  {s.label} · {Math.ceil((s.duration_seconds ?? 0) / 60)} phút
                </Text>
              ))}
              <Text style={styles.body}>
                Đồng hồ bắt đầu khi bạn bấm bắt đầu và tiếp tục chạy khi thoát
                bài.
                {answered > 0 || draft.flagged.length > 0
                  ? ' Lượt thi mới sẽ thay đáp án và đánh dấu hiện tại.'
                  : ''}
              </Text>
              {!exam.audio_url ? (
                <Text style={styles.caption}>
                  Chưa có âm thanh phần nghe. Bạn có thể thi các phần còn lại.
                </Text>
              ) : null}
              <AuthButton
                label="Bắt đầu tính giờ"
                onPress={() => restart('timed')}
                size="compact"
              />
              <AuthButton
                label="Tiếp tục luyện tự do"
                onPress={() => setTimedConfirming(false)}
                variant="text"
                size="compact"
              />
            </View>
          </View>
        </Modal>
      ) : null}
      <View nativeID="jlpt-workspace" style={styles.workspace}>
        <View style={styles.toolbar}>
          <View style={styles.flex}>
            <ScreenBackHeader
              title={exam.title}
              backLabel="Danh sách đề"
              onBack={onExit}
              disabled={busy}
            />
            {grade ? <Text style={styles.caption}>Xem lại bài làm</Text> : null}
          </View>
          {!timed && !draft.submitted ? (
            <AuthButton
              label="Thi thử tính giờ"
              variant="outline"
              size="compact"
              disabled={busy}
              onPress={() => {
                if (exam.sections.some(s => !s.duration_seconds)) {
                  setError(
                    'Đề này chưa có thời lượng đã xác minh. Bạn vẫn có thể luyện tự do.',
                  );
                  return;
                }
                setTimedConfirming(true);
              }}
            />
          ) : null}
          {timed && !grade && timing ? (
            <Text
              accessibilityLiveRegion="none"
              style={[
                styles.clock,
                timing.deadlineAt !== null &&
                  timing.deadlineAt - now <= 300000 &&
                  styles.incorrectText,
              ]}
            >
              {exam.sections[timing.section].label} ·{' '}
              {Math.floor(
                Math.max(
                  0,
                  Math.ceil(((timing.deadlineAt ?? now) - now) / 1000),
                ) / 60,
              )}
              :
              {String(
                Math.max(
                  0,
                  Math.ceil(((timing.deadlineAt ?? now) - now) / 1000),
                ) % 60,
              ).padStart(2, '0')}
            </Text>
          ) : (
            <ElapsedTime
              elapsedMs={
                draft.submitted ? draft.elapsedMs ?? 0 : elapsedBase.current
              }
              activeSince={activeSince.current}
              stopped={draft.submitted}
            />
          )}
        </View>
        <AuthNotice message={error} error />
        {draft.submitted && !grade ? (
          <AuthButton
            label="Tải lại kết quả"
            onPress={submit}
            busy={busy}
            variant="outline"
            size="compact"
          />
        ) : null}
        {grade ? (
          <View style={styles.summary} accessibilityLiveRegion="polite">
            <View style={styles.catalogHeader}>
              <Text style={styles.score}>
                {grade.correct}
                <Text style={styles.scoreDenominator}>/{grade.total}</Text>
              </Text>
              <View style={styles.flex}>
                <Text style={styles.label}>Câu trả lời đúng</Text>
                <Text style={styles.caption}>
                  {grade.answered - grade.correct} câu sai ·{' '}
                  {grade.total - grade.answered} câu chưa trả lời
                </Text>
              </View>
            </View>
            <View style={styles.sectionList}>
              {grade.sections.map(s => (
                <View key={s.id} style={styles.stat}>
                  <Text style={styles.caption}>{s.label}</Text>
                  <Text style={styles.label}>
                    {s.correct}/{s.total}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.caption}>{grade.note}</Text>
            <View style={styles.actions}>
              <AuthButton
                label={
                  onlyMistakes ? 'Xem tất cả câu' : 'Xem câu sai & bỏ trống'
                }
                onPress={() => {
                  const first = entries.findIndex(
                    e => grade.results[e.question.id].status !== 'correct',
                  );
                  setOnlyMistakes(value => !value);
                  if (!onlyMistakes && first >= 0) move(first);
                }}
                variant="outline"
                size="compact"
                disabled={grade.correct === grade.total}
              />
              <AuthButton
                label="Làm lại đề"
                onPress={() => setRestartConfirming(true)}
                variant="text"
                size="compact"
              />
            </View>
          </View>
        ) : null}
        {!wide ? (
          <AuthButton
            label={
              mapOpen
                ? 'Đóng bảng câu hỏi'
                : `Bảng câu hỏi · ${answered}/${exam.total}`
            }
            onPress={() => setMapOpen(value => !value)}
            variant="outline"
            size="compact"
          />
        ) : null}
        <View style={[styles.columns, !wide && styles.stacked]}>
          <View
            ref={questionCard}
            nativeID="jlpt-question-card"
            style={[styles.questionColumn, !wide && styles.stackedQuestion]}
          >
            <View style={styles.sectionTabs}>
              {exam.sections.map(s => (
                <Pressable
                  key={s.id}
                  accessibilityRole="tab"
                  accessibilityLabel={s.label}
                  accessibilityState={{ selected: s.id === section.id }}
                  disabled={
                    timed &&
                    !grade &&
                    (timing?.phase !== 'running' ||
                      s.id !== exam.sections[timing.section]?.id)
                  }
                  onPress={() =>
                    move(entries.findIndex(e => e.section.id === s.id))
                  }
                  style={[
                    styles.sectionTab,
                    s.id === section.id && styles.sectionTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.caption,
                      s.id === section.id && styles.activeText,
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.questionCard}>
              <View style={styles.questionHeading}>
                <Text
                  accessibilityRole="header"
                  style={[styles.title, styles.mondaiHeading]}
                >
                  問題{question.group}
                  {'　'}
                  <Text style={styles.instruction}>{question.instruction}</Text>
                </Text>
                {!grade ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      flagged ? 'Bỏ đánh dấu câu này' : 'Đánh dấu xem lại'
                    }
                    accessibilityState={{ selected: flagged }}
                    disabled={busy || draft.submitted || timedLocked}
                    onPress={() =>
                      setDraft(value => ({
                        ...value,
                        flagged: flagged
                          ? value.flagged.filter(id => id !== question.id)
                          : [...value.flagged, question.id],
                      }))
                    }
                    style={[styles.flagButton, flagged && styles.flagActive]}
                  >
                    <Text style={styles.flagText}>
                      {flagged ? '⚑ Đã đánh dấu' : '⚐ Xem lại'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {section.id === 'listening' && !exam.audio_url ? (
                <Text style={styles.caption}>Chưa có tệp nghe</Text>
              ) : null}
              {question.passage ? (
                <View style={styles.passage}>
                  {grade && study.data ? (
                    study.data.paragraphs.map((p, index) => (
                      <ShadowingTokenText
                        key={index}
                        text={p.text}
                        tokens={p.tokens}
                        words={study.data!.words}
                        onWordPress={study.onWordPress}
                        style={styles.japanese}
                        showFurigana={false}
                        preserveLayout
                        align="left"
                        linkWords
                      />
                    ))
                  ) : (
                    <Text selectable style={styles.japanese}>
                      {question.passage}
                    </Text>
                  )}
                </View>
              ) : null}
              {imageOnly && question.images.length > 0 ? (
                <Text style={styles.caption}>
                  Câu {questionLabel(question)} · Chọn đáp án theo ảnh đề gốc
                </Text>
              ) : null}
              {question.images.map(image => (
                <Image
                  key={image.id}
                  accessibilityLabel={`Tài liệu minh họa cho câu ${questionLabel(
                    question,
                  )}`}
                  source={{ uri: image.image_data_url }}
                  resizeMode="contain"
                  style={[
                    styles.questionImage,
                    {
                      aspectRatio: image.width_px / image.height_px,
                    },
                  ]}
                />
              ))}
              {!imageOnly || question.images.length === 0 ? (
                <View style={styles.promptRow}>
                  <Text style={styles.questionMark}>
                    {questionLabel(question)}
                    {section.id === 'listening' ? '番' : ''}
                  </Text>
                  {section.id !== 'listening' &&
                  !(
                    section.id === 'grammar-reading' && question.group === 3
                  ) ? (
                    grade && study.data ? (
                      <View style={styles.promptCopy}>
                        <ShadowingTokenText
                          text={question.prompt}
                          tokens={study.data.prompt_tokens}
                          words={study.data.words}
                          onWordPress={study.onWordPress}
                          style={styles.prompt}
                          showFurigana={false}
                          preserveLayout
                          align="left"
                          linkWords
                        />
                      </View>
                    ) : (
                      <Text
                        selectable
                        style={[styles.prompt, styles.promptCopy]}
                      >
                        {targetAt >= 0 ? (
                          <>
                            {question.prompt.slice(0, targetAt)}
                            <Text style={styles.underlined}>
                              {question.target}
                            </Text>
                            {question.prompt.slice(
                              targetAt + question.target!.length,
                            )}
                          </>
                        ) : (
                          question.prompt
                        )}
                      </Text>
                    )
                  ) : null}
                </View>
              ) : null}
              {grade && !imageOnly ? (
                <>
                  <Text style={styles.caption}>
                    Chạm từ để tra nghĩa · Chạm đáp án để hỏi Momo
                  </Text>
                  {study.controls}
                </>
              ) : null}
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Chọn đáp án"
                style={[
                  styles.options,
                  numberOnlyOptions && styles.numberOptions,
                ]}
              >
                {question.options.map((option, index) => {
                  const selected = draft.answers[question.id] === index;
                  const correct = result?.correct_index === index;
                  const incorrect = Boolean(result && selected && !correct);
                  return (
                    <Pressable
                      key={index}
                      accessibilityRole={
                        grade && !imageOnly ? 'button' : 'radio'
                      }
                      accessibilityHint={
                        grade && !imageOnly
                          ? 'Nhờ Momo giải thích đáp án này'
                          : undefined
                      }
                      accessibilityLabel={
                        option === String(index + 1)
                          ? `Đáp án ${index + 1}`
                          : `Đáp án ${index + 1}: ${option}`
                      }
                      accessibilityState={{
                        checked: selected,
                        disabled: Boolean(
                          busy ||
                            (grade && imageOnly) ||
                            (!grade && (draft.submitted || timedLocked)),
                        ),
                      }}
                      disabled={Boolean(
                        busy ||
                          (grade && imageOnly) ||
                          (!grade && (draft.submitted || timedLocked)),
                      )}
                      onPress={() =>
                        grade ? study.explain(index) : choose(index)
                      }
                      style={({ pressed }) => [
                        styles.option,
                        numberOnlyOptions && styles.numberOption,
                        selected && styles.optionSelected,
                        correct && styles.optionCorrect,
                        incorrect && styles.optionIncorrect,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.optionNumber,
                          selected && styles.numberSelected,
                          correct && styles.numberCorrect,
                          incorrect && styles.numberIncorrect,
                        ]}
                      >
                        <Text
                          style={[
                            styles.numberText,
                            (selected || correct || incorrect) &&
                              styles.whiteText,
                          ]}
                        >
                          {index + 1}
                        </Text>
                      </View>
                      {option !== String(index + 1) ? (
                        <Text style={styles.optionText}>{option}</Text>
                      ) : null}
                      {correct ? (
                        <Text style={styles.correctText}>✓ Đúng</Text>
                      ) : incorrect ? (
                        <Text style={styles.incorrectText}>✕ Đã chọn</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {result && result.status !== 'incorrect' ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.body,
                    result.status === 'correct' && styles.correctText,
                  ]}
                >
                  {result.status === 'correct'
                    ? 'Bạn đã trả lời đúng.'
                    : `Bạn chưa trả lời câu này. Đáp án đúng: ${
                        result.correct_index + 1
                      }.`}
                </Text>
              ) : null}
              {!grade && draft.answers[question.id] !== undefined ? (
                <AuthButton
                  label="Bỏ chọn đáp án"
                  onPress={() =>
                    setDraft(value => {
                      if (
                        timed &&
                        (!value.timing ||
                          !canAnswer(exam, value.timing, question.id))
                      )
                        return value;
                      const answers = { ...value.answers };
                      delete answers[question.id];
                      return { ...value, answers };
                    })
                  }
                  variant="text"
                  size="compact"
                  disabled={busy || draft.submitted || timedLocked}
                />
              ) : null}
            </View>
            <View style={styles.questionNavigation}>
              <AuthButton
                label="Câu trước"
                onPress={() => previous !== undefined && move(previous)}
                variant="outline"
                size="compact"
                disabled={previous === undefined || timedLocked}
              />
              <AuthButton
                label="Câu tiếp"
                onPress={() => next !== undefined && move(next)}
                size="compact"
                disabled={next === undefined || timedLocked}
              />
            </View>
          </View>
          {wide || mapOpen ? (
            <View
              nativeID={wide ? 'jlpt-question-map' : 'jlpt-question-map-mobile'}
              style={[styles.map, wide && styles.wideMap]}
            >
              <Text accessibilityRole="header" style={styles.heading}>
                Bảng câu hỏi
              </Text>
              <Text style={styles.caption}>
                {answered}/{exam.total} câu đã trả lời
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(answered / exam.total) * 100}%` },
                  ]}
                />
              </View>
              <View style={styles.legend}>
                <Text style={styles.legendText}>
                  {grade
                    ? '✓ Đúng · ✕ Sai · — Chưa trả lời'
                    : '● Đã chọn · ○ Chưa chọn · ⚑ Xem lại'}
                </Text>
              </View>
              <ScrollView
                style={wide ? styles.mapScroll : undefined}
                showsVerticalScrollIndicator
              >
                {exam.sections.map(s => (
                  <View key={s.id} style={styles.mapSection}>
                    <Text style={styles.label}>{s.label}</Text>
                    {[...new Set(s.questions.map(q => q.group))].map(group => (
                      <View key={group} style={styles.mapGroup}>
                        <Text style={styles.caption}>問題{group}</Text>
                        <View style={styles.questionGrid}>
                          {s.questions
                            .filter(q => q.group === group)
                            .map(q => {
                              const index = entries.findIndex(
                                e => e.question.id === q.id,
                              );
                              const selected =
                                draft.answers[q.id] !== undefined;
                              const status = grade?.results[q.id].status;
                              const marked = draft.flagged.includes(q.id);
                              const current = q.id === question.id;
                              return (
                                <Pressable
                                  key={q.id}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${
                                    s.label
                                  }, 問題${group}, ${questionLabel(q)}番, ${
                                    status === 'correct'
                                      ? 'đúng'
                                      : status === 'incorrect'
                                      ? 'sai'
                                      : selected
                                      ? 'đã trả lời'
                                      : 'chưa trả lời'
                                  }${marked ? ', đánh dấu xem lại' : ''}`}
                                  accessibilityState={{ selected: current }}
                                  disabled={
                                    timed &&
                                    !grade &&
                                    (!timing ||
                                      !canAnswer(exam, timing, q.id, now))
                                  }
                                  onPress={() => move(index)}
                                  style={[
                                    styles.questionNumber,
                                    selected && !grade && styles.answeredNumber,
                                    marked && !grade && styles.flaggedNumber,
                                    status === 'correct' &&
                                      styles.correctNumber,
                                    status === 'incorrect' &&
                                      styles.incorrectNumber,
                                    current && styles.currentNumber,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.numberText,
                                      selected && !grade && styles.activeText,
                                      status === 'correct' &&
                                        styles.correctText,
                                      status === 'incorrect' &&
                                        styles.incorrectText,
                                    ]}
                                  >
                                    {questionLabel(q)}
                                  </Text>
                                  <Text style={styles.miniStatus}>
                                    {status === 'correct'
                                      ? '✓'
                                      : status === 'incorrect'
                                      ? '✕'
                                      : marked && !grade
                                      ? '⚑'
                                      : selected
                                      ? '•'
                                      : '—'}
                                  </Text>
                                </Pressable>
                              );
                            })}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
              {!grade && !draft.submitted ? (
                <>
                  {confirming ? (
                    <View style={styles.confirm}>
                      <Text style={styles.label}>Nộp bài luyện tập?</Text>
                      <Text style={styles.caption}>
                        {exam.total - answered} câu chưa trả lời. Sau khi nộp,
                        bạn sẽ xem đáp án và kết quả.
                      </Text>
                      {nextUnanswered >= 0 ? (
                        <AuthButton
                          label="Đến câu chưa làm"
                          onPress={() => {
                            setConfirming(false);
                            move(nextUnanswered);
                          }}
                          variant="text"
                          size="compact"
                          disabled={busy}
                        />
                      ) : null}
                      <AuthButton
                        label="Xác nhận nộp bài"
                        onPress={submit}
                        busy={busy}
                        size="compact"
                      />
                      <AuthButton
                        label="Tiếp tục làm bài"
                        onPress={() => setConfirming(false)}
                        variant="text"
                        size="compact"
                        disabled={busy}
                      />
                    </View>
                  ) : (
                    <AuthButton
                      label="Nộp bài"
                      onPress={() => {
                        if (timed && timing?.phase === 'complete') submit();
                        else setConfirming(true);
                      }}
                      size="compact"
                    />
                  )}
                </>
              ) : null}
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.caption,
                  saveState === 'error' && styles.incorrectText,
                ]}
              >
                {saveState === 'saving'
                  ? 'Đang lưu…'
                  : saveState === 'saved'
                  ? 'Đã lưu trên thiết bị này'
                  : 'Chưa lưu được trên thiết bị. Hãy thử lưu lại.'}
              </Text>
              {saveState === 'error' ? (
                <AuthButton
                  label="Lưu lại bài làm"
                  variant="text"
                  size="compact"
                  onPress={() => setDraft(value => ({ ...value }))}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  clock: {
    ...typography.label,
    fontSize: 16,
    color: colors.focus,
    fontVariant: ['tabular-nums'],
  },
  questionImage: { width: '100%' },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(21, 53, 73, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.surface,
    gap: 20,
  },
  workspace: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  flex: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: {
    ...typography.title,
    fontSize: 21,
    lineHeight: 29,
    color: colors.dark,
  },
  heading: { ...typography.heading, color: colors.dark, fontSize: 17 },
  label: { ...typography.label, color: colors.dark },
  caption: { ...typography.caption, color: colors.muted, lineHeight: 20 },
  body: { ...typography.body, color: colors.body },
  catalogGrid: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 12,
  },
  examCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
    flexBasis: '23%',
    flexGrow: 1,
    minWidth: 0,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    gap: 16,
  },
  examCardTop: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  examActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  examMainAction: { flex: 1, minWidth: 0 },
  examRestart: {
    minHeight: 34,
    minWidth: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  examRestartPressed: { backgroundColor: colors.badgeBg },
  examRestartText: {
    ...typography.label,
    fontSize: 12,
    color: colors.primaryText,
  },
  examProgress: { minHeight: 56, gap: 4 },
  resultScore: { ...typography.label, lineHeight: 20, color: colors.body },
  cardProgressTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  visibleProgressFill: { minWidth: 12 },
  latestExam: { borderColor: colors.primary },
  examState: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 14,
    maxWidth: 68,
    flexShrink: 0,
    color: colors.focus,
    backgroundColor: colors.badgeBg,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  completedState: { color: colors.success, backgroundColor: colors.successBg },
  resumeHint: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 16,
    color: colors.focus,
  },
  twoColumnExam: { flexBasis: '48%' },
  singleColumnExam: { flexBasis: '100%' },
  sampleLabel: { ...typography.caption, color: colors.muted },
  examTitle: {
    ...typography.label,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
    minWidth: 0,
    color: colors.dark,
  },
  catalogHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  level: {
    backgroundColor: colors.badgeBg,
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { ...typography.label, color: colors.focus },
  sectionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  stacked: { flexDirection: 'column-reverse' },
  questionColumn: { flex: 1, minWidth: 0, width: '100%', gap: 16 },
  stackedQuestion: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionTabActive: {
    backgroundColor: colors.badgeBg,
    borderColor: colors.primary,
  },
  activeText: { color: colors.focus },
  questionCard: {
    padding: 24,
    gap: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  questionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  instruction: { ...typography.body, color: colors.muted, lineHeight: 26 },
  mondaiHeading: { flex: 1, minWidth: 0 },
  flagButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  flagActive: { backgroundColor: colors.badgeBg },
  flagText: { ...typography.caption, color: colors.focus },
  passage: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  japanese: { fontSize: 17, lineHeight: 34, color: colors.dark },
  prompt: {
    fontSize: 21,
    lineHeight: 36,
    color: colors.dark,
    fontWeight: '500',
  },
  promptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  promptCopy: { flex: 1, minWidth: 0 },
  questionMark: {
    fontSize: 18,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.dark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    minWidth: 34,
    textAlign: 'center',
  },
  underlined: { textDecorationLine: 'underline', fontWeight: '700' },
  options: { gap: 10 },
  numberOptions: { flexDirection: 'row', flexWrap: 'wrap' },
  numberOption: {
    minWidth: 72,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.badgeBg,
  },
  optionCorrect: {
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  optionIncorrect: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  optionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberSelected: { backgroundColor: colors.primary },
  numberCorrect: { backgroundColor: colors.success },
  numberIncorrect: { backgroundColor: colors.danger },
  numberText: { ...typography.label, color: colors.body },
  whiteText: { color: colors.onPrimary },
  optionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    lineHeight: 28,
    color: colors.dark,
  },
  correctText: { color: colors.success },
  incorrectText: { color: colors.danger },
  pressed: { opacity: 0.8 },
  questionNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  map: {
    width: '100%',
    padding: 20,
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wideMap: { width: 288, flexShrink: 0 },
  mapScroll: { maxHeight: 400 },
  mapSection: { gap: 12, marginBottom: 20 },
  mapGroup: { gap: 6 },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  questionNumber: {
    width: 44,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answeredNumber: {
    backgroundColor: colors.badgeBg,
    borderColor: colors.primary,
  },
  flaggedNumber: { borderColor: colors.focus, borderStyle: 'dashed' },
  currentNumber: { borderColor: colors.dark, borderWidth: 2 },
  correctNumber: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  incorrectNumber: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
  },
  miniStatus: { fontSize: 10, lineHeight: 12, color: colors.muted },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  legend: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  legendText: { ...typography.caption, fontSize: 11, color: colors.muted },
  confirm: {
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  summary: {
    padding: 24,
    gap: 18,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  score: { ...typography.title, fontSize: 40, color: colors.focus },
  scoreDenominator: { fontSize: 20, color: colors.muted },
  stat: {
    flex: 1,
    minWidth: 160,
    gap: 6,
    padding: 14,
    backgroundColor: colors.background,
    borderRadius: 14,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});

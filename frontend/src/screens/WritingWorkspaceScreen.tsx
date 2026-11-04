import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WritingSessionTimer } from '../components/WritingSessionTimer';
import { GenkoEditor } from '../components/GenkoEditor';
import { AuthButton } from '../components/AuthForm';
import { WritingShell } from '../components/WritingShell';
import {
  WritingAssessmentView,
  WritingCriteriaGuide,
} from '../components/WritingAssessmentView';
import { WritingVersionComparison } from '../components/WritingVersionComparison';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from '../components/icons';
import { useDefaultJlptLevel } from '../hooks/useLearningLevel';
import { useWebLayout } from '../hooks/useWebLayout';
import { useWritingDocuments } from '../hooks/useWritingDocuments';
import { useWebNavigation } from '../navigation/webNavigation';
import { writingService } from '../services/writingService';
import type {
  WritingDraft,
  WritingPrompt,
  WritingSubmissionApi,
} from '../services/writingService';
import { colors, radius, spacing, typography } from '../theme/theme';

type Library = 'prompts' | 'drafts' | 'submissions';
type Mode = 'write' | 'review' | 'compare';
const levels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
const groupKey = (item: WritingSubmissionApi) =>
  item.prompt_id || item.prompt_title;

export function WritingWorkspaceScreen() {
  const { desktop, contentWidth } = useWebLayout();
  const web = useWebNavigation();
  const defaultLevel = useDefaultJlptLevel();
  const [prompts, setPrompts] = useState<WritingPrompt[]>([]);
  const [drafts, setDrafts] = useState<WritingDraft[]>([]);
  const [submissions, setSubmissions] = useState<WritingSubmissionApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState<Library>('prompts');
  const [catalogPrompts, setCatalogPrompts] = useState<WritingPrompt[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [pagination, setPagination] = useState({ total: 0, has_more: false });
  const [level, setLevel] = useState<string>(defaultLevel);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('write');
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [composing, setComposing] = useState(false);
  const sending = useRef(false);
  const documentSequence = useRef(0);
  const writingTimes = useRef(new Map<string, number>());
  const [reevaluating, setReevaluating] = useState(false);
  const [message, setMessage] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectingComparison, setSelectingComparison] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const onSaved = useCallback((draft: WritingDraft) => {
    setDrafts(current => [
      draft,
      ...current.filter(item => item.id !== draft.id),
    ]);
  }, []);
  const editor = useWritingDocuments(onSaved, composing);
  const { open } = editor;
  const document = editor.active;
  const hasDocument = Boolean(document);
  const currentSubmission = submissions.find(
    item => item.id === currentSubmissionId,
  );
  const sameAsGraded = Boolean(
    currentSubmission &&
      document?.text.trim() === currentSubmission.text.trim(),
  );
  const locked = submitting || reevaluating;
  const goBack = useCallback(() => web?.navigate('/practice'), [web]);

  useEffect(() => {
    let alive = true;
    Promise.all([writingService.drafts(), writingService.submissions()])
      .then(([draftResult, submissionResult]) => {
        if (!alive) return;
        const nextDrafts = draftResult.items ?? [];
        setDrafts(nextDrafts);
        setSubmissions(submissionResult.items ?? []);
      })
      .catch(error => {
        if (alive)
          setMessage(
            error instanceof Error ? error.message : 'Chưa tải được bài viết.',
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if ((hasDocument && !libraryOpen) || library !== 'prompts') return;
    let alive = true;
    setCatalogLoading(true);
    setCatalogError('');
    writingService
      .prompts({ page, level, category, q: query })
      .then(result => {
        if (!alive) return;
        const items = result.items ?? [];
        setCatalogPrompts(items);
        setPagination(
          result.pagination ?? { total: items.length, has_more: false },
        );
        setPrompts(current => [
          ...current.filter(item => !items.some(next => next.id === item.id)),
          ...items,
        ]);
      })
      .catch(error => {
        if (alive) {
          setCatalogPrompts([]);
          setCatalogError(
            error instanceof Error ? error.message : 'Chưa tải được đề bài.',
          );
        }
      })
      .finally(() => {
        if (alive) setCatalogLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [
    hasDocument,
    libraryOpen,
    library,
    page,
    level,
    category,
    query,
    catalogRetry,
  ]);

  const showLibrary = (section: Library) => {
    setLibrary(section);
    setLibraryOpen(true);
  };

  const afterOpen = () => {
    setMode('write');
    setMessage('');
    setLibraryOpen(false);
    setDetailsOpen(false);
    setCurrentSubmissionId(null);
  };
  const openPrompt = (prompt: WritingPrompt) => {
    if (locked) return;
    const draft = drafts.find(item => item.prompt_id === prompt.id);
    open({
      key: `prompt:${prompt.id}`,
      title: prompt.title,
      level: prompt.level,
      prompt,
      draftId: draft?.id,
      text: draft?.text ?? '',
    });
    afterOpen();
  };
  const openDraft = (draft: WritingDraft) => {
    if (locked) return;
    const prompt =
      draft.prompt ?? prompts.find(item => item.id === draft.prompt_id);
    open({
      key: `draft:${draft.id}`,
      title: prompt?.title ?? '自由作文',
      level: levels.some(item => item === prompt?.level)
        ? prompt!.level
        : defaultLevel,
      prompt,
      draftId: draft.id,
      text: draft.text,
    });
    afterOpen();
  };
  const freeWriting = () => {
    if (locked || loading) return;
    open({
      key: `free:${++documentSequence.current}`,
      title: '自由作文',
      level: defaultLevel,
      text: '',
    });
    afterOpen();
  };
  const openSubmission = (submission: WritingSubmissionApi) => {
    if (locked) return;
    const prompt =
      submission.prompt ??
      prompts.find(item => item.id === submission.prompt_id);
    open({
      key: `submission:${submission.id}`,
      title: submission.prompt_title,
      level: submission.assessment?.level ?? prompt?.level ?? defaultLevel,
      prompt,
      text: submission.text,
    });
    setCurrentSubmissionId(submission.id);
    setMode('review');
    setMessage('');
    setLibraryOpen(false);
  };
  const submit = async () => {
    if (
      composing ||
      sending.current ||
      !document ||
      document.text.trim().length < 4 ||
      sameAsGraded
    )
      return;
    sending.current = true;
    setSubmitting(true);
    setMessage('');
    const snapshot = {
      text: document.text.trim(),
      prompt_id: document.prompt?.id,
      prompt_title: document.title,
      level: document.level,
    };
    try {
      const saved = await editor.save();
      if (!saved) {
        setMessage('Chưa lưu được bản nháp. Hãy lưu lại trước khi nộp bài.');
        return;
      }
      const { submission } = await writingService.submitWriting(snapshot);
      setSubmissions(current => [
        submission,
        ...current.filter(item => item.id !== submission.id),
      ]);
      setCurrentSubmissionId(submission.id);
      setMode('review');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Chưa nhận được nhận xét. Bài viết của bạn vẫn được giữ lại.',
      );
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };
  const reevaluate = async () => {
    if (sending.current || !currentSubmission) return;
    sending.current = true;
    setReevaluating(true);
    setMessage('');
    try {
      const { submission } = await writingService.evaluateSubmission(
        currentSubmission.id,
      );
      setSubmissions(current =>
        current.map(item => (item.id === submission.id ? submission : item)),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Chưa chấm lại được bài.',
      );
    } finally {
      sending.current = false;
      setReevaluating(false);
    }
  };
  const removeDraft = async (draft: WritingDraft) => {
    if (editor.busy || locked || deletingId) return;
    setDeletingId(draft.id);
    setMessage('');
    const wasActive = document?.draftId === draft.id;
    try {
      await writingService.deleteDraft(draft.id);
      editor.forget(draft.id);
      setDrafts(current => current.filter(item => item.id !== draft.id));
      if (wasActive) {
        open({
          key: `empty:${++documentSequence.current}`,
          title: document!.title,
          level: document!.level,
          prompt: document!.prompt,
          text: '',
        });
        setMode('write');
        setCurrentSubmissionId(null);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Chưa xóa được bản nháp.',
      );
    } finally {
      setDeletingId(null);
    }
  };
  const toggleComparison = (item: WritingSubmissionApi) => {
    if (compareIds.includes(item.id)) {
      setCompareIds(current => current.filter(id => id !== item.id));
      return;
    }
    const first = submissions.find(
      submission => submission.id === compareIds[0],
    );
    if (first && groupKey(first) !== groupKey(item)) {
      setMessage('Hãy chọn hai phiên bản thuộc cùng một đề.');
      return;
    }
    if (compareIds.length >= 2) return;
    setCompareIds(current => [...current, item.id]);
    setMessage('');
  };

  const libraryContent = (
    <View testID="writing-library" style={styles.library}>
      <View style={styles.row}>
        <Text style={styles.heading}>Thư viện đề bài</Text>
        {document ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng danh sách bài viết"
            onPress={() => setLibraryOpen(false)}
            style={styles.iconButton}
          >
            <XIcon size={18} color={colors.body} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.libraryTabs}>
        {(
          [
            ['prompts', 'Bài tập'],
            ['drafts', 'Bản nháp'],
            ['submissions', 'Bài đã nộp'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: library === value }}
            onPress={() => setLibrary(value)}
            style={[styles.libraryTab, library === value && styles.selectedTab]}
          >
            <Text
              style={[styles.small, library === value && styles.selectedText]}
            >
              {value === 'submissions' ? 'Đã nộp' : label}
            </Text>
          </Pressable>
        ))}
      </View>
      {library === 'prompts' ? (
        <View style={styles.filters}>
          <TextInput
            accessibilityLabel="Tìm đề bài"
            placeholder="Tìm đề bài…"
            placeholderTextColor={colors.placeholder}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            autoCorrect={false}
          />
          <View style={styles.levels}>
            {levels.map(value => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Chủ đề ${value}`}
                accessibilityState={{ selected: level === value }}
                onPress={() => {
                  setLevel(value);
                  setPage(1);
                }}
                style={[styles.level, level === value && styles.selectedTab]}
              >
                <Text
                  style={[styles.small, level === value && styles.selectedText]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.categories}>
            {[
              ['', 'Tất cả'],
              ['daily', 'Đời sống'],
              ['study', 'Học tập'],
              ['work', 'Công việc'],
              ['society', 'Xã hội'],
            ].map(([id, label]) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`Nhóm ${label}`}
                accessibilityState={{ selected: category === id }}
                onPress={() => {
                  setCategory(id);
                  setPage(1);
                }}
                style={[
                  styles.categoryButton,
                  category === id && styles.selectedTab,
                ]}
              >
                <Text
                  style={[styles.small, category === id && styles.selectedText]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {library === 'submissions' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            selectingComparison ? 'Hủy chọn so sánh' : 'Chọn bài để so sánh'
          }
          onPress={() => {
            setSelectingComparison(!selectingComparison);
            setCompareIds([]);
          }}
        >
          <Text style={styles.link}>
            {selectingComparison ? 'Hủy chọn so sánh' : 'So sánh hai phiên bản'}
          </Text>
        </Pressable>
      ) : null}
      <ScrollView
        style={styles.libraryScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.list,
            library === 'prompts' && desktop && styles.promptGrid,
          ]}
        >
          {loading ? <Text style={styles.muted}>Đang tải...</Text> : null}
          {library === 'prompts' && catalogLoading ? (
            <Text style={styles.muted}>Đang tải…</Text>
          ) : null}
          {library === 'prompts' && !catalogLoading && catalogError ? (
            <View>
              <Text style={styles.error}>{catalogError}</Text>
              <AuthButton
                size="compact"
                label="Thử lại"
                variant="outline"
                onPress={() => setCatalogRetry(current => current + 1)}
              />
            </View>
          ) : null}
          {library === 'prompts' && !catalogLoading && !catalogError
            ? catalogPrompts.map(prompt => {
                const status = submissions.some(
                  item => item.prompt_id === prompt.id,
                )
                  ? 'Đã nộp'
                  : drafts.some(item => item.prompt_id === prompt.id) ||
                    (document?.prompt?.id === prompt.id &&
                      document.text.trim().length > 0)
                  ? 'Có nháp'
                  : 'Chưa làm';
                return (
                  <Pressable
                    key={prompt.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn đề ${prompt.title}`}
                    disabled={locked || loading}
                    onPress={() => openPrompt(prompt)}
                    style={({ pressed }) => [
                      styles.listItem,
                      desktop && styles.promptCard,
                      document?.prompt?.id === prompt.id && styles.activeItem,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.row}>
                      <Text style={styles.badge}>{prompt.level}</Text>
                      <Text style={styles.muted}>{status}</Text>
                    </View>
                    <Text style={styles.label}>{prompt.title}</Text>
                    <Text style={styles.muted} numberOfLines={2}>
                      {prompt.instruction}
                    </Text>
                  </Pressable>
                );
              })
            : null}
          {library === 'prompts' &&
          !catalogLoading &&
          !catalogError &&
          !catalogPrompts.length ? (
            <Text style={styles.muted}>Không có đề phù hợp.</Text>
          ) : null}
          {library === 'drafts'
            ? drafts.map(draft => (
                <View
                  key={draft.id}
                  style={[
                    styles.draftRow,
                    document?.draftId === draft.id && styles.activeItem,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mở bản nháp ${
                      draft.prompt?.title ?? '自由作文'
                    }`}
                    disabled={locked}
                    onPress={() => openDraft(draft)}
                    style={styles.draftOpen}
                  >
                    <Text style={styles.label}>
                      {draft.prompt?.title ?? '自由作文'}
                    </Text>
                    <Text style={styles.muted} numberOfLines={2}>
                      {draft.text}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa bản nháp ${
                      draft.prompt?.title ?? '自由作文'
                    }`}
                    disabled={editor.busy || locked || Boolean(deletingId)}
                    onPress={() => removeDraft(draft)}
                    style={styles.iconButton}
                  >
                    <TrashIcon size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ))
            : null}
          {!loading && library === 'drafts' && !drafts.length ? (
            <Text style={styles.muted}>Chưa có bản nháp.</Text>
          ) : null}
          {library === 'submissions'
            ? submissions.map(item => (
                <Pressable
                  key={item.id}
                  accessibilityRole={
                    selectingComparison ? 'checkbox' : 'button'
                  }
                  accessibilityState={{
                    checked: selectingComparison
                      ? compareIds.includes(item.id)
                      : undefined,
                    selected:
                      !selectingComparison && currentSubmissionId === item.id,
                  }}
                  accessibilityLabel={`${
                    selectingComparison ? 'Chọn phiên bản' : 'Mở bài nộp'
                  } ${item.prompt_title} ngày ${new Date(
                    item.submitted_at * 1000,
                  ).toLocaleDateString('vi-VN')}`}
                  disabled={locked}
                  onPress={() =>
                    selectingComparison
                      ? toggleComparison(item)
                      : openSubmission(item)
                  }
                  style={({ pressed }) => [
                    styles.listItem,
                    (selectingComparison
                      ? compareIds.includes(item.id)
                      : currentSubmissionId === item.id) && styles.activeItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.row}>
                    <Text style={[styles.label, styles.flex]}>
                      {item.prompt_title}
                    </Text>
                    <Text style={styles.link}>{item.score}</Text>
                  </View>
                  <Text style={styles.muted}>
                    {new Date(item.submitted_at * 1000).toLocaleDateString(
                      'vi-VN',
                    )}
                  </Text>
                  <Text style={styles.muted} numberOfLines={2}>
                    {item.text}
                  </Text>
                </Pressable>
              ))
            : null}
          {!loading && library === 'submissions' && !submissions.length ? (
            <Text style={styles.muted}>Chưa có bài đã nộp.</Text>
          ) : null}
        </View>
      </ScrollView>
      {library === 'prompts' ? (
        <View style={styles.row}>
          <Text style={styles.muted}>{pagination.total} đề</Text>
          <View style={styles.categories}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Trang đề trước"
              disabled={page === 1 || catalogLoading}
              onPress={() => setPage(current => current - 1)}
              style={styles.iconButton}
            >
              <ChevronLeftIcon
                size={18}
                color={
                  page === 1 || catalogLoading
                    ? colors.disabledText
                    : colors.primaryText
                }
              />
            </Pressable>
            <Text style={styles.small}>{page}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Trang đề sau"
              disabled={!pagination.has_more || catalogLoading}
              onPress={() => setPage(current => current + 1)}
              style={styles.iconButton}
            >
              <ChevronRightIcon
                size={18}
                color={
                  !pagination.has_more || catalogLoading
                    ? colors.disabledText
                    : colors.primaryText
                }
              />
            </Pressable>
          </View>
        </View>
      ) : null}
      {selectingComparison && library === 'submissions' ? (
        <AuthButton
          size="compact"
          label="So sánh 2 bài đã chọn"
          disabled={compareIds.length !== 2 || locked}
          onPress={() => {
            const selected = submissions.find(item =>
              compareIds.includes(item.id),
            );
            if (selected) openSubmission(selected);
            setMode('compare');
            setLibraryOpen(false);
          }}
          secondary
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Viết tự do"
        onPress={freeWriting}
        disabled={locked || loading}
        style={styles.freeButton}
      >
        <PencilIcon size={16} color={colors.primaryText} />
        <Text style={styles.link}>Viết tự do</Text>
      </Pressable>
    </View>
  );
  const status = !document
    ? ''
    : document.pending
    ? 'Đang lưu nháp…'
    : document.error
    ? 'Chưa lưu được nháp'
    : document.draftId && document.text.trim() === document.savedText
    ? 'Đã lưu nháp'
    : document.text.trim().length >= 4
    ? 'Chưa lưu thay đổi'
    : '';

  return (
    <WritingShell
      onBack={goBack}
      title="Luyện viết"
      hideHeader={desktop}
      subtitle=""
      card={false}
      footer={
        !desktop ? (
          <AuthButton label="Về Luyện tập" variant="text" onPress={goBack} />
        ) : undefined
      }
    >
      <View style={styles.workspace} testID="writing-workspace">
        <View style={styles.main} testID="writing-main-panel">
          {!document ? (
            <View testID="tour-writing-start" style={styles.initialLibrary}>
              {libraryContent}
            </View>
          ) : null}
          {document ? (
            <View style={styles.details}>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đề bài và gợi ý"
                  accessibilityState={{ expanded: detailsOpen }}
                  onPress={() => setDetailsOpen(!detailsOpen)}
                  style={styles.row}
                >
                  <Text style={styles.label}>Đề bài & gợi ý</Text>
                  <ChevronDownIcon size={16} color={colors.primaryText} />
                </Pressable>
                <View testID="tour-writing-start">
                  <AuthButton
                    size="compact"
                    label="Đổi đề"
                    variant="outline"
                    onPress={() => showLibrary('prompts')}
                    disabled={locked}
                  />
                </View>
              </View>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{document.title}</Text>
                <Text style={styles.badge}>{document.level}</Text>
              </View>
              <Text style={styles.body}>
                {document.prompt?.instruction ||
                  '好きなテーマについて、日本語で書いてください。'}
              </Text>
              {detailsOpen && document.prompt?.model_hint ? (
                <Text style={styles.muted}>{document.prompt.model_hint}</Text>
              ) : null}
            </View>
          ) : null}
          {message ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {message}
            </Text>
          ) : null}
          {mode === 'write' && document ? (
            <View
              style={[
                styles.editingLayout,
                desktop && contentWidth >= 1000 && styles.editingColumns,
              ]}
            >
              <View
                testID="writing-criteria-panel"
                style={[
                  styles.criteriaColumn,
                  desktop && contentWidth >= 1000 && styles.criteriaSidebar,
                ]}
              >
                <WritingCriteriaGuide />
                <View style={styles.sessionTools}>
                  <WritingSessionTimer
                    documentKey={document.key}
                    running={!locked && !libraryOpen}
                    elapsedByDocument={writingTimes.current}
                  />
                  <View style={styles.submitAction}>
                    <AuthButton
                      label={document.pending ? 'Đang lưu…' : 'Lưu nháp'}
                      size="compact"
                      variant="outline"
                      onPress={() => {
                        editor.save();
                      }}
                      disabled={
                        locked ||
                        composing ||
                        document.text.trim().length < 4 ||
                        Boolean(document.pending)
                      }
                    />
                    {sameAsGraded ? (
                      <AuthButton
                        label="Xem nhận xét đã có"
                        size="compact"
                        disabled={locked || composing}
                        onPress={() => setMode('review')}
                      />
                    ) : (
                      <AuthButton
                        label={submitting ? 'Đang nhận xét…' : 'Nộp bài'}
                        size="compact"
                        onPress={submit}
                        busy={submitting}
                        disabled={
                          locked ||
                          composing ||
                          !document ||
                          document.text.trim().length < 4
                        }
                      />
                    )}
                  </View>
                  {status || composing || submitting ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={document.error ? styles.error : styles.muted}
                    >
                      {submitting
                        ? 'AI đang nhận xét…'
                        : composing
                        ? 'Đang nhập…'
                        : status}
                    </Text>
                  ) : null}
                  {document.error ? (
                    <View style={styles.section}>
                      <Text style={styles.error}>{document.error}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.writingArea}>
                <GenkoEditor
                  key={document?.key}
                  value={document?.text ?? ''}
                  onChangeText={editor.setText}
                  onComposingChange={setComposing}
                  editable={!locked && Boolean(document)}
                />
              </View>
            </View>
          ) : null}
          {mode === 'review' && currentSubmission ? (
            <View style={styles.section}>
              <View style={styles.toolbar}>
                <Text style={styles.heading}>
                  Nhận xét · {currentSubmission.score}/100
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chỉnh sửa bài"
                  disabled={locked}
                  onPress={() => setMode('write')}
                  style={styles.libraryToggle}
                >
                  <PencilIcon size={16} color={colors.primaryText} />
                  <Text style={styles.link}>Chỉnh sửa bài</Text>
                </Pressable>
              </View>
              <WritingAssessmentView
                key={currentSubmission.id}
                text={currentSubmission.text}
                correctedText={
                  currentSubmission.corrected_text ||
                  currentSubmission.correctedText ||
                  ''
                }
                feedback={currentSubmission.feedback}
                assessment={currentSubmission.assessment}
                stacked={desktop && Math.min(contentWidth, 1160) < 780}
                mobileSheet
              />
              <View style={styles.regrade}>
                <AuthButton
                  label={
                    reevaluating
                      ? 'Đang phân tích bài…'
                      : 'Phân tích lại bằng AI'
                  }
                  secondary
                  onPress={reevaluate}
                  busy={reevaluating}
                  disabled={locked}
                />
              </View>
            </View>
          ) : null}
          {mode === 'compare' ? (
            <WritingVersionComparison
              items={submissions.filter(item => compareIds.includes(item.id))}
            />
          ) : null}
        </View>
      </View>
      <Modal
        visible={hasDocument && libraryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLibraryOpen(false)}
      >
        <View style={[styles.modalBackdrop, desktop && styles.desktopBackdrop]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng thư viện"
            onPress={() => setLibraryOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, desktop && styles.desktopSheet]}>
            {libraryContent}
          </View>
        </View>
      </Modal>
    </WritingShell>
  );
}

const styles = StyleSheet.create({
  workspace: { gap: spacing.xxl, alignItems: 'stretch' },
  initialLibrary: {
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  main: { flex: 1, minWidth: 0, gap: spacing.lg },
  section: { gap: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  flex: { flex: 1, minWidth: 0 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  title: { ...typography.title, color: colors.dark, flexShrink: 1 },
  heading: { ...typography.heading, color: colors.dark },
  label: { ...typography.label, color: colors.dark },
  body: { ...typography.body, color: colors.body, lineHeight: 22 },
  muted: { ...typography.caption, color: colors.muted, lineHeight: 20 },
  small: {
    ...typography.label,
    fontSize: 11,
    lineHeight: 16,
    color: colors.body,
  },
  link: { ...typography.caption, color: colors.primaryText },
  error: { ...typography.caption, color: colors.danger, lineHeight: 20 },
  badge: {
    ...typography.caption,
    color: colors.badgeText,
    backgroundColor: colors.badgeBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  library: {
    minHeight: 0,
    flexShrink: 1,
    backgroundColor: colors.surface,
    gap: spacing.lg,
  },
  libraryTabs: { flexDirection: 'row', gap: spacing.xs },
  libraryTab: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  selectedTab: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedText: { color: colors.onPrimary },
  levels: { flexDirection: 'row', gap: spacing.xs },
  level: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: { gap: spacing.sm },
  searchInput: {
    ...typography.body,
    fontSize: 14,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceTint,
    color: colors.dark,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  promptGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  promptCard: { width: '49%', flexGrow: 1 },
  desktopBackdrop: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  desktopSheet: { width: '100%', maxWidth: 880, borderRadius: radius.card },
  libraryScroll: { maxHeight: 400, flexShrink: 1 },
  list: { gap: spacing.sm },
  listItem: {
    padding: spacing.md,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: spacing.xs,
  },
  activeItem: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
  },
  pressed: { backgroundColor: colors.surfaceTint },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
  },
  draftOpen: { flex: 1, minWidth: 0, padding: spacing.md, gap: spacing.xs },
  iconButton: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  freeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  libraryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeTabs: { flexDirection: 'row', gap: spacing.xs },
  modeTab: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  details: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  editingLayout: { flexDirection: 'column-reverse', gap: spacing.lg },
  editingColumns: { flexDirection: 'row', alignItems: 'flex-start' },
  criteriaSidebar: { width: 240, flexShrink: 0 },
  writingArea: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
  },
  criteriaColumn: { gap: spacing.lg },
  sessionTools: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
  },
  submitAction: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  regrade: { alignSelf: 'flex-start' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(37,37,38,0.32)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.section,
  },
});

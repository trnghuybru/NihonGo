import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WritingWorkspaceScreen } from './WritingWorkspaceScreen';
import { AuthButton } from '../components/AuthForm';
import {
  WritingAssessmentView,
  WritingCriteriaGuide,
} from '../components/WritingAssessmentView';
import { useDefaultJlptLevel } from '../hooks/useLearningLevel';
import type { WritingAssessment } from '../services/writingService';
import { WritingShell } from '../components/WritingShell';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { useWebLayout } from '../hooks/useWebLayout';
import { useWebNavigation } from '../navigation/webNavigation';
import { NihongoMascot } from '../components/NihongoMascot';
import {
  ArrowRightIcon,
  CheckIcon,
  PencilIcon,
  RefreshIcon,
  TrashIcon,
} from '../components/icons';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import {
  WritingDraft,
  WritingPrompt,
  writingService,
} from '../services/writingService';

type WritingView =
  | 'dashboard'
  | 'exercise'
  | 'editor'
  | 'drafts'
  | 'submissions'
  | 'submission-detail'
  | 'compare-select-prompt'
  | 'compare-select-versions'
  | 'compare-result'
  | 'progress';

type WritingSubmission = {
  id: string;
  promptId: string;
  promptTitle: string;
  text: string;
  correctedText: string;
  score: number;
  feedback: string;
  assessment?: WritingAssessment | null;
  submittedAt: string;
};

const getWritingSentences = (text: string) =>
  text
    .split(/[。.!?！？\n]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

const getWritingCharacterCount = (text: string) =>
  Array.from(text.replace(/\s/g, '')).length;

const normalizeSubmissionDate = (value: number | string) => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(
        numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue,
      )
    : new Date(value);
  return date.toISOString();
};

const CUSTOM_WRITING_ID = '__custom__';

export function WritingScreen() {
  return Platform.OS === 'web' ? (
    <WritingWorkspaceScreen />
  ) : (
    <NativeWritingScreen />
  );
}

function NativeWritingScreen() {
  const { desktop, contentWidth } = useWebLayout();
  const web = useWebNavigation();
  const defaultLevel = useDefaultJlptLevel();
  const [submitting, setSubmitting] = useState(false);
  const submitPending = useRef(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [view, setView] = useState<WritingView>('dashboard');
  const goBack = useCallback(() => {
    if (view === 'dashboard') web?.navigate('/practice');
    else setView('dashboard');
  }, [view, web]);
  const promptColumns = contentWidth >= 1120 ? 3 : 2;
  const promptCardWidth =
    (Math.min(contentWidth, 1160) - 40 - 16 * (promptColumns - 1)) /
    promptColumns;
  const [prompts, setPrompts] = useState<WritingPrompt[]>([]);
  const [drafts, setDrafts] = useState<WritingDraft[]>([]);
  const [submissions, setSubmissions] = useState<WritingSubmission[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('');
  const [isSelectingForComparison, setIsSelectingForComparison] =
    useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [comparePromptId, setComparePromptId] = useState<string>('');
  const [compareOldId, setCompareOldId] = useState<string>('');
  const [compareNewId, setCompareNewId] = useState<string>('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [reevaluatingSubmissionId, setReevaluatingSubmissionId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const groupedPrompts = useMemo(() => {
    const groups = new Map<string, WritingPrompt[]>();
    for (const prompt of prompts) {
      const existing = groups.get(prompt.level) ?? [];
      existing.push(prompt);
      groups.set(prompt.level, existing);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => {
      const order = { N5: 1, N4: 2, N3: 3 } as Record<string, number>;
      return (order[left] ?? 99) - (order[right] ?? 99);
    });
  }, [prompts]);

  const selectedPrompt = useMemo(
    () =>
      prompts.find(prompt => prompt.id === selectedPromptId) ??
      (selectedPromptId === CUSTOM_WRITING_ID ? undefined : prompts[0]),
    [prompts, selectedPromptId],
  );

  const selectedSubmission = useMemo(
    () =>
      submissions.find(item => item.id === selectedSubmissionId) ??
      submissions[0],
    [submissions, selectedSubmissionId],
  );

  const getSubmissionGroupKey = useCallback(
    (item: Pick<WritingSubmission, 'promptId' | 'promptTitle'>) => {
      if (
        item.promptId &&
        prompts.some(prompt => prompt.id === item.promptId)
      ) {
        return item.promptId;
      }
      return item.promptTitle.trim() || 'custom';
    },
    [prompts],
  );

  const toggleSubmissionComparison = (item: WritingSubmission) => {
    setMessage('');
    if (selectedCompareIds.includes(item.id)) {
      setSelectedCompareIds(selectedCompareIds.filter(id => id !== item.id));
      return;
    }

    if (selectedCompareIds.length >= 2) {
      setMessage('Chỉ có thể chọn tối đa 2 bài để so sánh.');
      return;
    }

    const firstSelected = submissions.find(
      submission => submission.id === selectedCompareIds[0],
    );
    if (
      firstSelected &&
      getSubmissionGroupKey(firstSelected) !== getSubmissionGroupKey(item)
    ) {
      setMessage('Chỉ có thể so sánh hai bài thuộc cùng một đề.');
      return;
    }

    setSelectedCompareIds([...selectedCompareIds, item.id]);
  };

  const compareSelectedSubmissions = () => {
    const selected = selectedCompareIds
      .map(id => submissions.find(item => item.id === id))
      .filter((item): item is WritingSubmission => Boolean(item));

    if (selected.length !== 2) {
      return;
    }

    const [older, newer] = [...selected].sort(
      (left, right) =>
        new Date(left.submittedAt).getTime() -
        new Date(right.submittedAt).getTime(),
    );
    setComparePromptId(getSubmissionGroupKey(older));
    setCompareOldId(older.id);
    setCompareNewId(newer.id);
    setSelectedCompareIds([]);
    setIsSelectingForComparison(false);
    setMessage('');
    setView('compare-result');
  };

  const reevaluateSubmission = async (submissionId: string) => {
    if (reevaluatingSubmissionId) {
      return;
    }

    setReevaluatingSubmissionId(submissionId);
    setMessage('');
    try {
      const { submission } = await writingService.evaluateSubmission(
        submissionId,
      );
      setSubmissions(current =>
        current.map(item =>
          item.id === submissionId
            ? {
                ...item,
                correctedText:
                  submission.corrected_text ||
                  submission.correctedText ||
                  item.correctedText,
                score: submission.score,
                feedback: submission.feedback,
                assessment: submission.assessment,
              }
            : item,
        ),
      );
      setMessage('Đã phân tích lại bài bằng AI.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Không phân tích lại được bài viết. Vui lòng thử lại.',
      );
    } finally {
      setReevaluatingSubmissionId(null);
    }
  };

  const compareGroups = useMemo(() => {
    const groups = new Map<string, WritingSubmission[]>();

    for (const item of submissions) {
      const groupKey = getSubmissionGroupKey(item);
      const existing = groups.get(groupKey) ?? [];
      existing.push(item);
      groups.set(groupKey, existing);
    }

    return Array.from(groups.entries())
      .map(([key, items]) => ({
        key,
        title: items[0]?.promptTitle ?? 'Bài viết',
        versions: [...items].sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() -
            new Date(b.submittedAt).getTime(),
        ),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [submissions, getSubmissionGroupKey]);

  const compareOptions = useMemo(
    () =>
      submissions
        .filter(item => getSubmissionGroupKey(item) === comparePromptId)
        .sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() -
            new Date(b.submittedAt).getTime(),
        ),
    [submissions, comparePromptId, getSubmissionGroupKey],
  );

  const comparePrompt = useMemo(
    () =>
      prompts.find(prompt => prompt.id === comparePromptId) ??
      compareGroups.find(group => group.key === comparePromptId),
    [prompts, comparePromptId, compareGroups],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [promptResult, draftResult, submissionResult] = await Promise.all([
        writingService.prompts(),
        writingService.drafts(),
        writingService.submissions(),
      ]);
      const nextPrompts = promptResult.items ?? [];
      const nextSubmissions = (submissionResult.items ?? []).map(item => ({
        id: item.id,
        promptId: item.prompt_id ?? `custom-${item.id}`,
        promptTitle: item.prompt_title || 'Bài viết tự do',
        text: item.text,
        correctedText: item.corrected_text || item.correctedText || '',
        score: item.score ?? 0,
        assessment: item.assessment,
        feedback: item.feedback || 'Bài viết đã được nộp thành công.',
        submittedAt: normalizeSubmissionDate(
          item.submittedAt ?? item.submitted_at,
        ),
      }));
      setPrompts(nextPrompts);
      setDrafts(draftResult.items ?? []);
      setSubmissions(nextSubmissions);
      if (nextSubmissions.length) {
        setSelectedSubmissionId(current => current || nextSubmissions[0].id);
      }
      if (nextPrompts.length) {
        setSelectedPromptId(current => current || nextPrompts[0].id);
      }
    } catch (error) {
      const text =
        error instanceof Error ? error.message : 'Không tải được bài viết.';
      setMessage(
        text.includes('unauthorized') || text.includes('hết hạn')
          ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục viết.'
          : text,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (view !== 'editor' || !selectedPrompt) {
      return;
    }
    const currentDraft = drafts.find(
      item => item.prompt_id === selectedPrompt.id,
    );
    if (currentDraft) {
      setAnswer(currentDraft.text);
    }
  }, [selectedPrompt, drafts, view]);

  const handleSave = async () => {
    const trimmed = answer.trim();
    if (!trimmed) {
      setMessage('Hãy viết ít nhất vài câu trước khi lưu nháp.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const previous = selectedPrompt
        ? drafts.find(item => item.prompt_id === selectedPrompt.id)
        : undefined;

      const result = previous
        ? await writingService.updateDraft(previous.id, trimmed)
        : selectedPrompt
        ? await writingService.saveDraft(selectedPrompt.id, trimmed)
        : await writingService.saveCustomDraft(trimmed, 'Bài viết tự do');

      setDrafts(current => {
        const next = current.filter(item => item.id !== result.draft.id);
        return [result.draft, ...next];
      });
      setMessage(previous ? 'Đã cập nhật bản nháp.' : 'Đã lưu bản nháp.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Không lưu được bản nháp.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      await writingService.deleteDraft(draftId);
      setDrafts(current => current.filter(item => item.id !== draftId));
      setMessage('Đã xóa bản nháp.');
      if (
        selectedPrompt &&
        drafts.some(
          item => item.id === draftId && item.prompt_id === selectedPrompt.id,
        )
      ) {
        setAnswer('');
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Không xóa được bản nháp.',
      );
    }
  };

  const handleSubmit = async () => {
    if (submitPending.current) return;
    const trimmed = answer.trim();
    if (!trimmed) {
      setMessage('Hãy viết trước khi nộp bài.');
      return;
    }

    submitPending.current = true;
    setSubmitting(true);
    setMessage('');
    try {
      const response = await writingService.submitWriting({
        prompt_id: selectedPrompt?.id,
        prompt_title: selectedPrompt?.title ?? 'Bài viết tự do',
        text: trimmed,
        level: defaultLevel,
      });

      const newSubmission: WritingSubmission = {
        id: response.submission.id,
        promptId:
          response.submission.prompt_id ?? `custom-${response.submission.id}`,
        promptTitle: response.submission.prompt_title || 'Bài viết tự do',
        text: response.submission.text,
        correctedText:
          response.submission.corrected_text ||
          response.submission.correctedText ||
          '',
        score: response.submission.score ?? 0,
        assessment: response.submission.assessment,
        feedback:
          response.submission.feedback || 'Bài viết đã được nộp thành công.',
        submittedAt: normalizeSubmissionDate(
          response.submission.submittedAt ?? response.submission.submitted_at,
        ),
      };

      setSubmissions(current => [newSubmission, ...current]);
      setSelectedSubmissionId(newSubmission.id);
      setComparePromptId(newSubmission.promptId);
      setCompareOldId(current => current || newSubmission.id);
      setCompareNewId(newSubmission.id);
      setMessage('Bài viết đã được nộp và chấm điểm thành công.');
      setView('submission-detail');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Không gửi được bài viết. Vui lòng thử lại.',
      );
    } finally {
      submitPending.current = false;
      setSubmitting(false);
    }
  };

  const beginCustomWriting = () => {
    setSelectedPromptId(CUSTOM_WRITING_ID);
    setAnswer('');
    setMessage('');
    setView('editor');
  };

  const beginCompareFlow = () => {
    if (submissions.length < 2) {
      setMessage('Cần ít nhất 2 bài nộp để so sánh.');
      setView('submissions');
      return;
    }

    const firstGroup =
      compareGroups.find(group => group.versions.length >= 2) ??
      compareGroups[0];

    if (!firstGroup) {
      setMessage('Bạn chưa có đủ bài nộp để so sánh.');
      setView('submissions');
      return;
    }

    setComparePromptId(firstGroup.key);
    setCompareOldId(firstGroup.versions[0]?.id ?? '');
    setCompareNewId(
      firstGroup.versions[1]?.id ?? firstGroup.versions[0]?.id ?? '',
    );
    setView('compare-select-prompt');
  };

  const startDraft = (promptId?: string) => {
    const targetId = promptId ?? prompts[0]?.id;
    if (!targetId) {
      setView('exercise');
      return;
    }
    setSelectedPromptId(targetId);
    const currentDraft = drafts.find(item => item.prompt_id === targetId);
    setAnswer(currentDraft?.text ?? '');
    setView('editor');
  };

  const renderBackButton = () => (
    <AuthButton
      label="Quay lại"
      variant="text"
      onPress={() => setView('dashboard')}
    />
  );

  if (view === 'exercise') {
    return (
      <WritingShell
        onBack={goBack}
        title="Bài tập viết"
        subtitle="Chọn đề bài gợi ý hoặc bắt đầu viết theo ý của bạn."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chủ đề có sẵn</Text>
          {loading ? (
            <Text style={styles.empty}>Đang tải đề bài...</Text>
          ) : groupedPrompts.length === 0 ? (
            <Text style={styles.empty}>Chưa có bài tập nào để hiển thị.</Text>
          ) : (
            groupedPrompts.map(([level, levelPrompts]) => (
              <View key={level} style={styles.levelGroup}>
                <Text style={styles.levelGroupTitle}>{level}</Text>
                <View style={desktop ? styles.promptGrid : styles.levelGroup}>
                  {levelPrompts.map(prompt => (
                    <Pressable
                      key={prompt.id}
                      accessibilityRole="button"
                      onPress={() => startDraft(prompt.id)}
                      style={({ pressed }) => [
                        styles.promptCard,
                        desktop && { width: promptCardWidth },
                        pressed && styles.promptCardPressed,
                      ]}
                    >
                      <Text style={styles.promptTitle}>{prompt.title}</Text>
                      <Text style={styles.promptMeta}>{prompt.level}</Text>
                      <Text style={styles.promptHint} numberOfLines={3}>
                        {prompt.instruction}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          )}

          <View style={styles.separator} />
          <Text style={styles.sectionTitle}>Viết theo ý của bạn</Text>
          <View style={desktop ? styles.inlineAction : undefined}>
            <AuthButton
              label="Viết bài theo ý của tôi"
              onPress={beginCustomWriting}
            />
          </View>
        </View>
      </WritingShell>
    );
  }

  if (view === 'editor') {
    return (
      <WritingShell
        onBack={goBack}
        title={selectedPrompt?.title ?? 'Viết tiếng Nhật'}
        subtitle="Viết câu trả lời của bạn và lưu bản nháp để tiếp tục sau."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={[styles.editorLayout, desktop && styles.editorDesktop]}>
          <View
            style={[
              styles.editorSidebar,
              desktop && styles.editorSidebarDesktop,
            ]}
          >
            <View style={styles.promptPanel}>
              <View style={styles.draftHeader}>
                <Text style={styles.sectionTitle}>Đề bài</Text>
                {selectedPrompt ? (
                  <Text style={styles.levelBadge}>{selectedPrompt.level}</Text>
                ) : null}
              </View>
              <Text style={styles.promptInstruction}>
                {selectedPrompt?.instruction ||
                  'Viết về một chủ đề bạn quan tâm bằng tiếng Nhật.'}
              </Text>
              {selectedPrompt?.model_hint ? (
                <>
                  <View style={styles.separator} />
                  <Text style={styles.promptTitle}>Gợi ý</Text>
                  <Text style={styles.promptHint}>
                    {selectedPrompt.model_hint}
                  </Text>
                </>
              ) : null}
            </View>
            <WritingCriteriaGuide />
            <Text style={styles.promptHint}>
              Lưu bản nháp để viết tiếp sau. Nộp bài khi bạn muốn nhận điểm và
              nhận xét từ AI.
            </Text>
          </View>
          <View
            style={[styles.editorPaper, desktop && styles.editorPaperDesktop]}
          >
            <View style={styles.draftHeader}>
              <Text style={styles.sectionTitle}>Nội dung bài viết</Text>
              <Text style={styles.quickMeta}>
                {getWritingCharacterCount(answer)} ký tự
              </Text>
            </View>
            <TextInput
              accessibilityLabel="Nội dung bài viết"
              multiline
              numberOfLines={desktop ? 16 : 8}
              value={answer}
              onChangeText={setAnswer}
              onFocus={() => setEditorFocused(true)}
              onBlur={() => setEditorFocused(false)}
              editable={!submitting && !saving}
              placeholder="Viết bằng tiếng Nhật ở đây..."
              placeholderTextColor={colors.placeholder}
              textAlignVertical="top"
              style={[
                styles.textArea,
                desktop && styles.desktopTextArea,
                editorFocused && styles.textAreaFocused,
              ]}
            />
            <View style={[styles.actionRow, desktop && styles.editorActions]}>
              <View
                style={desktop ? styles.compactAction : styles.actionButtonWrap}
              >
                <AuthButton
                  label={saving ? 'Đang lưu...' : 'Lưu nháp'}
                  onPress={handleSave}
                  busy={saving}
                  disabled={submitting || saving}
                  secondary
                />
              </View>
              <View
                style={desktop ? styles.compactAction : styles.actionButtonWrap}
              >
                <AuthButton
                  label={submitting ? 'Đang chấm bài...' : 'Nộp bài'}
                  onPress={handleSubmit}
                  busy={submitting}
                  disabled={submitting || saving}
                />
              </View>
            </View>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {message}
              </Text>
            ) : null}
          </View>
        </View>
      </WritingShell>
    );
  }

  if (view === 'drafts') {
    return (
      <WritingShell
        onBack={goBack}
        title="Bản nháp"
        subtitle="Tiếp tục bài viết đang ở giữa chừng hoặc xóa bản nháp không cần thiết."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          {drafts.length === 0 ? (
            <Text style={styles.empty}>Bạn chưa có bản nháp nào.</Text>
          ) : (
            drafts.map(draft => (
              <Pressable
                key={draft.id}
                accessibilityRole="button"
                onPress={() => {
                  setSelectedPromptId(draft.prompt_id || CUSTOM_WRITING_ID);
                  setAnswer(draft.text);
                  setView('editor');
                }}
                style={({ pressed }) => [
                  styles.draftCard,
                  pressed && styles.promptCardPressed,
                ]}
              >
                <View style={styles.draftHeader}>
                  <Text style={styles.draftPrompt}>
                    {draft.prompt?.title ?? 'Bài viết'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={event => {
                      event.stopPropagation();
                      handleDeleteDraft(draft.id);
                    }}
                    style={styles.deleteDraftButton}
                  >
                    <TrashIcon size={16} color={colors.muted} />
                  </Pressable>
                </View>
                <Text style={styles.draftText} numberOfLines={3}>
                  {draft.text}
                </Text>
                <Text style={styles.draftMeta}>{draft.word_count} từ</Text>
              </Pressable>
            ))
          )}
        </View>
      </WritingShell>
    );
  }

  if (view === 'submissions') {
    return (
      <WritingShell
        onBack={goBack}
        title="Bài đã nộp"
        subtitle="Xem bài đã gửi, nhận xét AI và các lần làm lại trước đó."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          {submissions.length === 0 ? (
            <Text style={styles.empty}>
              Chưa có bài nộp nào. Hãy nộp bài viết đầu tiên để xem điểm và nhận
              xét.
            </Text>
          ) : (
            <>
              <AuthButton
                label={
                  isSelectingForComparison
                    ? 'Hủy chọn bài'
                    : 'Chọn bài để so sánh'
                }
                onPress={() => {
                  setIsSelectingForComparison(!isSelectingForComparison);
                  setSelectedCompareIds([]);
                  setMessage('');
                }}
                secondary
              />
              {isSelectingForComparison ? (
                <>
                  <Text style={styles.submissionSelectionHint}>
                    Đã chọn {selectedCompareIds.length}/2 bài. Hãy chọn hai lần
                    nộp cùng đề.
                  </Text>
                  <AuthButton
                    label="So sánh 2 bài đã chọn"
                    onPress={compareSelectedSubmissions}
                    disabled={selectedCompareIds.length !== 2}
                  />
                </>
              ) : null}
              {message ? <Text style={styles.message}>{message}</Text> : null}
              {submissions.map(item => {
                const isSelected = selectedCompareIds.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole={
                      isSelectingForComparison ? 'checkbox' : 'button'
                    }
                    accessibilityLabel={
                      isSelectingForComparison
                        ? `${item.promptTitle}, ${new Date(
                            item.submittedAt,
                          ).toLocaleDateString('vi-VN')}`
                        : `Mở bài nộp ${item.promptTitle} ngày ${new Date(
                            item.submittedAt,
                          ).toLocaleDateString('vi-VN')}`
                    }
                    accessibilityState={
                      isSelectingForComparison
                        ? { checked: isSelected }
                        : undefined
                    }
                    onPress={() => {
                      if (isSelectingForComparison) {
                        toggleSubmissionComparison(item);
                        return;
                      }
                      setSelectedSubmissionId(item.id);
                      setView('submission-detail');
                    }}
                    style={({ pressed }) => [
                      styles.submissionCard,
                      isSelected && styles.submissionCardSelected,
                      pressed && styles.promptCardPressed,
                    ]}
                  >
                    <View style={styles.rowBetween}>
                      <View style={styles.submissionTitleRow}>
                        {isSelectingForComparison ? (
                          <View
                            style={[
                              styles.submissionSelectionIndicator,
                              isSelected &&
                                styles.submissionSelectionIndicatorSelected,
                            ]}
                          >
                            <Text style={styles.submissionSelectionCheck}>
                              {isSelected ? '✓' : ''}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.submissionTitle} numberOfLines={1}>
                          {item.promptTitle}
                        </Text>
                      </View>
                      <Text style={styles.scoreBadge}>{item.score} điểm</Text>
                    </View>
                    <Text style={styles.submissionText} numberOfLines={2}>
                      {item.text}
                    </Text>
                    <Text style={styles.draftMeta}>
                      {new Date(item.submittedAt).toLocaleDateString('vi-VN')}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </WritingShell>
    );
  }

  if (view === 'submission-detail' && selectedSubmission) {
    return (
      <WritingShell
        onBack={goBack}
        title="Kết quả AI"
        subtitle="Nhận xét chi tiết và bản sửa đề xuất của hệ thống."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>
              {selectedSubmission.promptTitle}
            </Text>
            <Text style={styles.scoreBadgeLarge}>
              {selectedSubmission.score} điểm
            </Text>
          </View>

          <WritingAssessmentView
            key={selectedSubmission.id}
            text={selectedSubmission.text}
            correctedText={selectedSubmission.correctedText}
            feedback={selectedSubmission.feedback}
            assessment={selectedSubmission.assessment}
          />

          <View style={desktop ? styles.inlineAction : undefined}>
            <AuthButton
              secondary
              label={
                reevaluatingSubmissionId === selectedSubmission.id
                  ? 'Đang phân tích bài...'
                  : 'Phân tích lại bằng AI'
              }
              onPress={() => reevaluateSubmission(selectedSubmission.id)}
              busy={reevaluatingSubmissionId === selectedSubmission.id}
              disabled={
                Boolean(reevaluatingSubmissionId) &&
                reevaluatingSubmissionId !== selectedSubmission.id
              }
            />
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={desktop ? styles.inlineAction : undefined}>
            <AuthButton
              secondary
              label="So sánh với phiên bản trước"
              onPress={() => {
                const compareGroupKey =
                  selectedSubmission.promptId &&
                  prompts.some(
                    prompt => prompt.id === selectedSubmission.promptId,
                  )
                    ? selectedSubmission.promptId
                    : selectedSubmission.promptTitle.trim() || 'custom';
                const previous = submissions.find(
                  item =>
                    item.id !== selectedSubmission.id &&
                    getSubmissionGroupKey(item) === compareGroupKey,
                );
                if (previous) {
                  setComparePromptId(compareGroupKey);
                  setCompareOldId(previous.id);
                  setCompareNewId(selectedSubmission.id);
                  setView('compare-result');
                } else {
                  setMessage('Bạn chưa có đủ phiên bản để so sánh cho đề này.');
                }
              }}
            />
          </View>
        </View>
      </WritingShell>
    );
  }

  if (view === 'compare-select-prompt') {
    const availablePrompts = compareGroups.filter(
      group => group.versions.length >= 2,
    );

    return (
      <WritingShell
        onBack={goBack}
        title="So sánh bài viết"
        subtitle="Chọn một nhóm bài viết hoặc đề bài bạn muốn đối chiếu giữa các lần nộp."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <Text style={styles.empty}>
            Chọn một nhóm bài để tiếp tục chọn 2 phiên bản cần so sánh.
          </Text>

          {availablePrompts.length === 0 ? (
            <Text style={styles.empty}>
              Bạn chưa có đủ bài nộp nào để so sánh.
            </Text>
          ) : (
            availablePrompts.map(group => (
              <Pressable
                key={group.key}
                accessibilityRole="button"
                onPress={() => {
                  setComparePromptId(group.key);
                  setCompareOldId(group.versions[0].id);
                  setCompareNewId(group.versions[1].id);
                  setView('compare-select-versions');
                }}
                style={({ pressed }) => [
                  styles.comparePromptCard,
                  pressed && styles.promptCardPressed,
                ]}
              >
                <Text style={styles.comparePromptTitle}>{group.title}</Text>
                <Text style={styles.comparePromptMeta}>
                  {group.versions.length} phiên bản
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </WritingShell>
    );
  }

  if (view === 'compare-select-versions') {
    const versions = compareOptions.length > 0 ? compareOptions : submissions;
    const oldVersion =
      versions.find(item => item.id === compareOldId) ?? versions[0];
    const newVersion =
      versions.find(item => item.id === compareNewId) ??
      versions[1] ??
      versions[0];

    return (
      <WritingShell
        onBack={goBack}
        title="Chọn phiên bản cần so sánh"
        subtitle="Chọn 2 bài khác nhau để đối chiếu tiến bộ."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {typeof comparePrompt === 'string'
              ? comparePrompt
              : comparePrompt?.title ?? 'So sánh bài viết'}
          </Text>

          <View style={styles.compareSectionLabel}>Chọn phiên bản cũ</View>
          {versions.map(item => (
            <Pressable
              key={`old-${item.id}`}
              accessibilityRole="button"
              onPress={() => {
                if (item.id === compareNewId) {
                  setMessage('Vui lòng chọn 2 phiên bản khác nhau.');
                  return;
                }
                setCompareOldId(item.id);
              }}
              style={({ pressed }) => [
                styles.compareVersionCard,
                compareOldId === item.id && styles.compareVersionCardSelected,
                pressed && styles.promptCardPressed,
              ]}
            >
              <View style={styles.compareVersionRow}>
                <Text style={styles.compareVersionTitle}>
                  Lần {versions.indexOf(item) + 1}
                </Text>
                <Text style={styles.compareVersionScore}>
                  {item.score} điểm
                </Text>
              </View>
              <Text style={styles.compareVersionMeta}>
                Nộp ngày{' '}
                {new Date(item.submittedAt).toLocaleDateString('vi-VN')}
              </Text>
              <Text style={styles.compareVersionText} numberOfLines={2}>
                {item.text}
              </Text>
            </Pressable>
          ))}

          <View style={styles.compareSectionLabel}>Chọn phiên bản mới</View>
          {versions.map(item => (
            <Pressable
              key={`new-${item.id}`}
              accessibilityRole="button"
              onPress={() => {
                if (item.id === compareOldId) {
                  setMessage('Vui lòng chọn 2 phiên bản khác nhau.');
                  return;
                }
                setCompareNewId(item.id);
              }}
              style={({ pressed }) => [
                styles.compareVersionCard,
                compareNewId === item.id && styles.compareVersionCardSelected,
                pressed && styles.promptCardPressed,
              ]}
            >
              <View style={styles.compareVersionRow}>
                <Text style={styles.compareVersionTitle}>
                  Lần {versions.indexOf(item) + 1}
                </Text>
                <Text style={styles.compareVersionScore}>
                  {item.score} điểm
                </Text>
              </View>
              <Text style={styles.compareVersionMeta}>
                Nộp ngày{' '}
                {new Date(item.submittedAt).toLocaleDateString('vi-VN')}
              </Text>
              <Text style={styles.compareVersionText} numberOfLines={2}>
                {item.text}
              </Text>
            </Pressable>
          ))}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          {oldVersion && newVersion && oldVersion.id !== newVersion.id ? (
            <AuthButton
              label="So sánh hai phiên bản"
              onPress={() => {
                setMessage('');
                setView('compare-result');
              }}
            />
          ) : null}
        </View>
      </WritingShell>
    );
  }

  if (view === 'compare-result') {
    const old =
      compareOptions.find(item => item.id === compareOldId) ??
      compareOptions[0];
    const next =
      compareOptions.find(item => item.id === compareNewId) ??
      compareOptions[1] ??
      compareOptions[0];

    if (!old || !next) {
      return (
        <WritingShell
          onBack={goBack}
          title="So sánh bài viết"
          subtitle="Chưa đủ phiên bản để đối chiếu."
          icon="check"
          card={false}
          headerAccessory={
            <NihongoMascot pose="writing" size={96} decorative />
          }
          footer={renderBackButton()}
        >
          <View style={styles.section}>
            <Text style={styles.empty}>Chưa có đủ dữ liệu để so sánh.</Text>
          </View>
        </WritingShell>
      );
    }

    const scoreGain = next.score - old.score;
    const oldCharacterCount = getWritingCharacterCount(old.text);
    const nextCharacterCount = getWritingCharacterCount(next.text);
    const oldSentences = getWritingSentences(old.text);
    const nextSentences = getWritingSentences(next.text);
    const oldSentenceSet = new Set(oldSentences);
    const nextSentenceSet = new Set(nextSentences);
    const addedSentences = nextSentences.filter(
      sentence => !oldSentenceSet.has(sentence),
    );
    const removedSentences = oldSentences.filter(
      sentence => !nextSentenceSet.has(sentence),
    );
    const characterDelta = nextCharacterCount - oldCharacterCount;
    const sentenceDelta = nextSentences.length - oldSentences.length;

    return (
      <WritingShell
        onBack={goBack}
        title="Kết quả so sánh"
        subtitle="Bạn đang đối chiếu sự tiến bộ giữa hai phiên bản."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>
              {comparePrompt?.title ?? 'So sánh bài viết'}
            </Text>
          </View>

          <View style={styles.compareSummaryGrid}>
            <View style={styles.compareSummaryCard}>
              <Text style={styles.compareSummaryLabel}>Phiên bản cũ</Text>
              <Text style={styles.compareSummaryValue}>{old.score}</Text>
              <Text style={styles.compareSummarySmall}>Điểm / 100</Text>
            </View>
            <View style={styles.compareSummaryCard}>
              <Text style={styles.compareSummaryLabel}>Phiên bản mới</Text>
              <Text style={styles.compareSummaryValueAccent}>{next.score}</Text>
              <Text
                style={[
                  scoreGain >= 0
                    ? styles.compareSummarySmallSuccess
                    : styles.compareSummarySmallLoss,
                ]}
              >
                {scoreGain > 0 ? '+' : ''}
                {scoreGain} điểm
              </Text>
            </View>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Chi tiết bài viết</Text>
            <View style={styles.compareMetricsGrid}>
              <View style={styles.compareMetricCard}>
                <Text style={styles.compareMetricLabel}>Số ký tự</Text>
                <Text style={styles.compareMetricValue}>
                  {oldCharacterCount} → {nextCharacterCount}
                </Text>
                <Text style={styles.compareMetricDelta}>
                  {characterDelta > 0 ? '+' : ''}
                  {characterDelta} ký tự
                </Text>
              </View>
              <View style={styles.compareMetricCard}>
                <Text style={styles.compareMetricLabel}>Số câu</Text>
                <Text style={styles.compareMetricValue}>
                  {oldSentences.length} → {nextSentences.length}
                </Text>
                <Text style={styles.compareMetricDelta}>
                  {sentenceDelta > 0 ? '+' : ''}
                  {sentenceDelta} câu
                </Text>
              </View>
            </View>
            <Text style={styles.compareMetricNote}>
              Số ký tự không tính khoảng trắng. Đây là chỉ số độ dài, không tự
              đánh giá nội dung hay hơn.
            </Text>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Nội dung thay đổi</Text>
            <Text style={styles.compareChangeTitle}>Câu có trong bài mới</Text>
            {addedSentences.length ? (
              addedSentences.map((sentence, _index) => (
                <Text
                  key={`added-${_index}-${sentence}`}
                  style={styles.compareAddedText}
                >
                  + {sentence}
                </Text>
              ))
            ) : (
              <Text style={styles.compareMetricNote}>
                Không có câu mới hoàn toàn so với bài trước.
              </Text>
            )}
            <Text style={styles.compareChangeTitle}>
              Câu không còn trong bài mới
            </Text>
            {removedSentences.length ? (
              removedSentences.map((sentence, _index) => (
                <Text
                  key={`removed-${_index}-${sentence}`}
                  style={styles.compareRemovedText}
                >
                  − {sentence}
                </Text>
              ))
            ) : (
              <Text style={styles.compareMetricNote}>
                Các câu cũ đều được giữ lại.
              </Text>
            )}
          </View>

          <View style={styles.resultPanel}>
            <View style={styles.compareSideRow}>
              <View style={styles.compareSideColumn}>
                <Text style={styles.sectionTitle}>Bài trước</Text>
                <Text style={styles.compareDate}>
                  Nộp ngày{' '}
                  {new Date(old.submittedAt).toLocaleDateString('vi-VN')}
                </Text>
              </View>
              <View style={styles.compareSideColumn}>
                <Text style={styles.sectionTitle}>Bài mới</Text>
                <Text style={styles.compareDate}>
                  Nộp ngày{' '}
                  {new Date(next.submittedAt).toLocaleDateString('vi-VN')}
                </Text>
              </View>
            </View>
            <View style={styles.compareTextGrid}>
              <Text style={styles.compareText}>{old.text}</Text>
              <Text style={styles.compareText}>{next.text}</Text>
            </View>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Nhận xét AI từng lần</Text>
            <View style={styles.compareFeedbackBlock}>
              <Text style={styles.compareChangeTitle}>Bài trước</Text>
              <Text style={styles.resultText}>
                {old.feedback || 'Không có nhận xét được lưu.'}
              </Text>
              <AuthButton
                label={
                  reevaluatingSubmissionId === old.id
                    ? 'Đang phân tích bài trước...'
                    : 'Phân tích lại bài trước'
                }
                onPress={() => reevaluateSubmission(old.id)}
                busy={reevaluatingSubmissionId === old.id}
                disabled={
                  Boolean(reevaluatingSubmissionId) &&
                  reevaluatingSubmissionId !== old.id
                }
                secondary
              />
            </View>
            <View style={styles.compareFeedbackBlock}>
              <Text style={styles.compareChangeTitle}>Bài mới</Text>
              <Text style={styles.resultText}>
                {next.feedback || 'Không có nhận xét được lưu.'}
              </Text>
              <AuthButton
                label={
                  reevaluatingSubmissionId === next.id
                    ? 'Đang phân tích bài mới...'
                    : 'Phân tích lại bài mới'
                }
                onPress={() => reevaluateSubmission(next.id)}
                busy={reevaluatingSubmissionId === next.id}
                disabled={
                  Boolean(reevaluatingSubmissionId) &&
                  reevaluatingSubmissionId !== next.id
                }
                secondary
              />
            </View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        </View>
      </WritingShell>
    );
  }

  if (view === 'progress') {
    const averageScore = submissions.length
      ? Math.round(
          submissions.reduce((sum, item) => sum + item.score, 0) /
            submissions.length,
        )
      : 0;

    return (
      <WritingShell
        onBack={goBack}
        title="Tiến độ viết"
        subtitle="Theo dõi số lượng bài đã làm, số bản nháp và điểm trung bình của bạn."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <View style={styles.metricGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{submissions.length}</Text>
              <Text style={styles.metricLabel}>Bài nộp</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{drafts.length}</Text>
              <Text style={styles.metricLabel}>Bản nháp</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{averageScore || '-'}</Text>
              <Text style={styles.metricLabel}>Điểm TB</Text>
            </View>
          </View>
        </View>
      </WritingShell>
    );
  }

  return (
    <WritingShell
      onBack={goBack}
      title="Luyện viết tiếng Nhật"
      subtitle=""
      icon="check"
      card={false}
    >
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={[styles.dashboardLayout, desktop && styles.editorDesktop]}>
        <View style={styles.dashboardMain}>
          <View style={styles.section}>
            <View style={styles.heroCard}>
              <View style={styles.heroRow}>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>Bắt đầu viết</Text>
                  <Text style={styles.heroText}>
                    Chọn bài tập theo trình độ hoặc viết tự do.
                  </Text>
                </View>
                <NihongoMascot pose="writing" size={88} decorative />
              </View>
              <View style={styles.heroActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chọn bài tập viết"
                  testID="tour-writing-start"
                  onPress={() => setView('exercise')}
                  style={({ pressed }) => [
                    styles.startButton,
                    pressed && styles.startButtonPressed,
                  ]}
                >
                  <PencilIcon size={16} color={colors.onPrimary} />
                  <Text style={styles.startButtonText}>Chọn bài tập</Text>
                  <ArrowRightIcon size={16} color={colors.onPrimary} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Viết tự do"
                  onPress={beginCustomWriting}
                  style={({ pressed }) => [
                    styles.freeButton,
                    pressed && styles.promptCardPressed,
                  ]}
                >
                  <Text style={styles.freeButtonText}>Viết tự do</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bài viết gần đây</Text>
            {submissions.length === 0 && drafts.length === 0 ? (
              <View style={styles.recentEmpty}>
                <Text style={styles.empty}>Chưa có bài viết nào.</Text>
                <Text style={styles.empty}>
                  Hãy chọn bài tập đầu tiên để bắt đầu hành trình luyện viết.
                </Text>
              </View>
            ) : (
              [...submissions.slice(0, 2), ...drafts.slice(0, 2)]
                .slice(0, 4)
                .map(item => {
                  const isDraft = 'prompt_id' in item;
                  const title = isDraft
                    ? item.prompt?.title ?? 'Bài viết tự do'
                    : item.promptTitle;
                  const text = item.text;
                  return (
                    <Pressable
                      key={isDraft ? `draft-${item.id}` : item.id}
                      accessibilityRole="button"
                      onPress={() => {
                        if (isDraft) {
                          setSelectedPromptId(
                            item.prompt_id || CUSTOM_WRITING_ID,
                          );
                          setAnswer(item.text);
                          setView('editor');
                        } else {
                          setSelectedSubmissionId(item.id);
                          setView('submission-detail');
                        }
                      }}
                      style={({ pressed }) => [
                        styles.draftCard,
                        pressed && styles.promptCardPressed,
                      ]}
                    >
                      <Text style={styles.draftPrompt}>{title}</Text>
                      <Text style={styles.draftText} numberOfLines={2}>
                        {text}
                      </Text>
                      {isDraft ? (
                        <Text style={styles.draftMeta}>
                          {getWritingCharacterCount(item.text)} ký tự · Bản nháp
                        </Text>
                      ) : (
                        <Text style={styles.draftMeta}>{item.score} điểm</Text>
                      )}
                    </Pressable>
                  );
                })
            )}
          </View>
        </View>
        <View
          style={[styles.managementPanel, desktop && styles.managementDesktop]}
        >
          <Text style={styles.sectionTitle}>Quản lý bài viết</Text>
          <View style={styles.managementList}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.managementLink,
                pressed && styles.promptCardPressed,
              ]}
              onPress={() => setView('drafts')}
            >
              <PencilIcon size={18} color={colors.primaryText} />
              <Text style={styles.quickLabel}>Bản nháp</Text>
              <Text style={styles.quickMeta}>{drafts.length} mục</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bài đã nộp"
              style={({ pressed }) => [
                styles.managementLink,
                pressed && styles.promptCardPressed,
              ]}
              onPress={() => setView('submissions')}
            >
              <CheckIcon size={18} color={colors.primaryText} />
              <Text style={styles.quickLabel}>Bài đã nộp</Text>
              <Text style={styles.quickMeta}>{submissions.length} bài</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.managementLink,
                pressed && styles.promptCardPressed,
              ]}
              onPress={beginCompareFlow}
            >
              <RefreshIcon size={18} color={colors.primaryText} />
              <Text style={styles.quickLabel}>So sánh bài viết</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.managementLink,
                pressed && styles.promptCardPressed,
              ]}
              onPress={() => setView('progress')}
            >
              <HomeFeatureIcon
                name="reading"
                size={18}
                color={colors.primaryText}
              />
              <Text style={styles.quickLabel}>Tiến độ viết</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </WritingShell>
  );
}

const styles = StyleSheet.create({
  inlineAction: { alignSelf: 'flex-start', minWidth: 180 },
  desktopResultText: { fontSize: 16, lineHeight: 28 },
  dashboardLayout: { gap: spacing.xxl, alignItems: 'stretch' },
  dashboardMain: { flex: 1, minWidth: 0 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  startButtonPressed: { backgroundColor: colors.primaryPressed },
  startButtonText: { ...typography.button, color: colors.onPrimary },
  freeButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeButtonText: { ...typography.button, color: colors.primaryText },
  managementPanel: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.lg,
    alignSelf: 'stretch',
  },
  managementDesktop: { width: 300, alignSelf: 'flex-start' },
  managementList: { gap: spacing.sm },
  managementLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radius.small,
  },
  promptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  editorLayout: { gap: spacing.xxl },
  editorDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  editorSidebar: { gap: spacing.lg },
  editorSidebarDesktop: { width: 280 },
  editorPaper: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.lg,
    boxShadow: shadowMd,
  },
  editorPaperDesktop: { flex: 1, minWidth: 0 },
  desktopTextArea: { minHeight: 380, fontSize: 16, lineHeight: 28 },
  textAreaFocused: { borderColor: colors.focus },
  editorActions: { justifyContent: 'flex-end' },
  compactAction: { minWidth: 136 },
  levelBadge: {
    ...typography.caption,
    color: colors.primaryText,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  resultColumns: { gap: spacing.lg, alignItems: 'stretch' },
  resultColumn: { flex: 1, minWidth: 0 },
  section: { gap: spacing.lg, marginBottom: spacing.xl },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadowMd,
    gap: spacing.sm,
  },
  heroTitle: { ...typography.title, color: colors.dark },
  heroText: { ...typography.body, color: colors.body },
  sectionTitle: { ...typography.heading, color: colors.dark },
  quickLabel: { ...typography.label, color: colors.dark },
  quickMeta: { ...typography.caption, color: colors.muted },
  levelGroup: { gap: spacing.md },
  levelGroupTitle: {
    ...typography.label,
    color: colors.primaryText,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.xs,
  },
  promptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    boxShadow: shadowMd,
    gap: spacing.xs,
  },
  promptCardPressed: { backgroundColor: colors.background },
  promptTitle: { ...typography.label, color: colors.dark, fontWeight: '700' },
  promptMeta: { ...typography.caption, color: colors.primaryText },
  promptPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    gap: spacing.sm,
    boxShadow: shadowMd,
  },
  promptInstruction: { ...typography.body, color: colors.dark },
  promptHint: { ...typography.caption, color: colors.muted, lineHeight: 20 },
  textArea: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.input,
    padding: spacing.lg,
    color: colors.dark,
    ...typography.body,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  actionButtonWrap: { flex: 1 },
  message: { ...typography.caption, color: colors.primaryText },
  empty: { ...typography.body, color: colors.muted },
  recentEmpty: {
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  draftCard: {
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
    boxShadow: shadowMd,
  },
  draftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteDraftButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftPrompt: { ...typography.label, color: colors.primaryText },
  draftText: { ...typography.body, color: colors.dark },
  draftMeta: { ...typography.caption, color: colors.muted },
  submissionCard: {
    borderRadius: radius.small,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: spacing.xs,
    boxShadow: shadowMd,
  },
  submissionCardSelected: {
    borderColor: colors.primaryText,
    backgroundColor: colors.surfaceTint,
  },
  submissionTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  submissionSelectionHint: {
    ...typography.caption,
    color: colors.muted,
  },
  submissionSelectionIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submissionSelectionIndicatorSelected: {
    borderColor: colors.primaryText,
    backgroundColor: colors.primaryText,
  },
  submissionSelectionCheck: {
    ...typography.caption,
    color: colors.onPrimary,
    fontWeight: '700',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  submissionTitle: { ...typography.label, color: colors.dark },
  submissionText: { ...typography.body, color: colors.body },
  scoreBadge: {
    ...typography.caption,
    color: colors.primaryText,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  scoreBadgeLarge: {
    ...typography.title,
    color: colors.primaryText,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultTitle: { ...typography.heading, color: colors.dark },
  resultPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    gap: spacing.sm,
    boxShadow: shadowMd,
  },
  resultText: { ...typography.body, color: colors.dark, lineHeight: 20 },
  comparePromptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    boxShadow: shadowMd,
    gap: spacing.xs,
  },
  comparePromptTitle: { ...typography.label, color: colors.dark },
  comparePromptMeta: { ...typography.caption, color: colors.muted },
  compareSectionLabel: {
    ...typography.label,
    color: colors.dark,
    marginTop: spacing.sm,
  },
  compareVersionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    gap: spacing.xs,
    boxShadow: shadowMd,
  },
  compareVersionCardSelected: {
    borderColor: colors.primaryText,
    backgroundColor: colors.surfaceTint,
  },
  compareVersionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compareVersionTitle: { ...typography.label, color: colors.dark },
  compareVersionScore: {
    ...typography.caption,
    color: colors.primaryText,
    fontWeight: '700',
  },
  compareVersionMeta: { ...typography.caption, color: colors.muted },
  compareVersionText: { ...typography.body, color: colors.dark },
  compareSummaryGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  compareSummaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    boxShadow: shadowMd,
    gap: spacing.xs,
  },
  compareSummaryLabel: { ...typography.caption, color: colors.muted },
  compareSummaryValue: { ...typography.title, color: colors.dark },
  compareSummaryValueAccent: { ...typography.title, color: colors.primaryText },
  compareSummarySmall: { ...typography.caption, color: colors.muted },
  compareSummarySmallSuccess: { ...typography.caption, color: '#2E7D32' },
  compareSummarySmallLoss: { ...typography.caption, color: '#B54747' },
  compareMetricsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  compareMetricCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    padding: spacing.md,
    gap: spacing.xs,
  },
  compareMetricLabel: { ...typography.caption, color: colors.muted },
  compareMetricValue: { ...typography.label, color: colors.dark },
  compareMetricDelta: { ...typography.caption, color: colors.primaryText },
  compareMetricNote: { ...typography.caption, color: colors.muted },
  compareChangeTitle: { ...typography.label, color: colors.dark },
  compareAddedText: { ...typography.body, color: '#2E7D32', lineHeight: 20 },
  compareRemovedText: { ...typography.body, color: '#B54747', lineHeight: 20 },
  compareFeedbackBlock: {
    gap: spacing.xs,
  },
  compareSideRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: spacing.md,
  },
  compareSideColumn: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  compareDate: { ...typography.caption, color: colors.muted },
  compareTextGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  compareText: {
    ...typography.body,
    color: colors.dark,
    lineHeight: 20,
    flex: 1,
  },
  metricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    alignItems: 'center',
    boxShadow: shadowMd,
    gap: spacing.xs,
  },
  metricValue: { ...typography.title, color: colors.dark },
  metricLabel: { ...typography.caption, color: colors.muted },
});

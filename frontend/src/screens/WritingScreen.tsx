import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AuthButton, AuthShell } from '../components/AuthForm';
import { NihongoMascot } from '../components/NihongoMascot';
import { TrashIcon } from '../components/icons';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { WritingDraft, WritingPrompt, writingService } from '../services/writingService';

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
  submittedAt: string;
};

const seedSubmissions: WritingSubmission[] = [
  {
    id: 'sub-demo-1',
    promptId: 'demo-1',
    promptTitle: 'Mô tả về cuộc sống hằng ngày',
    text: 'Hằng ngày tôi thức dậy lúc 6 giờ. Tôi ăn sáng và đi học ở trường.',
    correctedText:
      'Hằng ngày tôi thức dậy lúc 6 giờ. Sau khi ăn sáng, tôi đi học ở trường và học rất chăm chỉ.',
    score: 88,
    feedback: 'Bài viết rõ ràng, nhưng bạn nên thêm chi tiết về thói quen và dùng từ vựng phong phú hơn.',
    submittedAt: '2025-04-03T08:00:00.000Z',
  },
  {
    id: 'sub-demo-2',
    promptId: 'demo-2',
    promptTitle: 'Viết thư cảm ơn',
    text: 'Cảm ơn cô giáo đã giúp tôi. Tôi rất hạnh phúc vì đã học tiếng Nhật.',
    correctedText:
      'Cảm ơn cô giáo đã luôn giúp đỡ tôi trong suốt thời gian học tiếng Nhật. Tôi rất hạnh phúc và biết ơn vì sự hướng dẫn của cô.',
    score: 91,
    feedback: 'Cấu trúc câu mạch lạc, cách diễn đạt lịch sự phù hợp. Hãy thêm ví dụ cụ thể để tăng độ sâu.',
    submittedAt: '2025-04-10T08:00:00.000Z',
  },
];

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
    ? new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue)
    : new Date(value);
  return date.toISOString();
};

const CUSTOM_WRITING_ID = '__custom__';

export function WritingScreen() {
  const [view, setView] = useState<WritingView>('dashboard');
  const [prompts, setPrompts] = useState<WritingPrompt[]>([]);
  const [drafts, setDrafts] = useState<WritingDraft[]>([]);
  const [submissions, setSubmissions] = useState<WritingSubmission[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('');
  const [isSelectingForComparison, setIsSelectingForComparison] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [comparePromptId, setComparePromptId] = useState<string>('');
  const [compareOldId, setCompareOldId] = useState<string>('');
  const [compareNewId, setCompareNewId] = useState<string>('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [reevaluatingSubmissionId, setReevaluatingSubmissionId] = useState<string | null>(null);
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
    () => submissions.find(item => item.id === selectedSubmissionId) ?? submissions[0],
    [submissions, selectedSubmissionId],
  );

  const getSubmissionGroupKey = (item: Pick<WritingSubmission, 'promptId' | 'promptTitle'>) => {
    if (item.promptId && prompts.some(prompt => prompt.id === item.promptId)) {
      return item.promptId;
    }
    return item.promptTitle.trim() || 'custom';
  };

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

    const firstSelected = submissions.find(submission => submission.id === selectedCompareIds[0]);
    if (firstSelected && getSubmissionGroupKey(firstSelected) !== getSubmissionGroupKey(item)) {
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
      (left, right) => new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime(),
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
      const { submission } = await writingService.evaluateSubmission(submissionId);
      setSubmissions(current =>
        current.map(item =>
          item.id === submissionId
            ? {
                ...item,
                correctedText: submission.corrected_text || submission.correctedText || item.correctedText,
                score: submission.score,
                feedback: submission.feedback,
              }
            : item,
        ),
      );
      setMessage('Đã phân tích lại bài bằng AI.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không phân tích lại được bài viết. Vui lòng thử lại.');
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
          (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
        ),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [submissions, prompts]);

  const compareOptions = useMemo(
    () =>
      submissions
        .filter(item => getSubmissionGroupKey(item) === comparePromptId)
        .sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
        ),
    [submissions, comparePromptId, prompts],
  );

  const comparePrompt = useMemo(
    () =>
      prompts.find(prompt => prompt.id === comparePromptId) ??
      compareGroups.find(group => group.key === comparePromptId),
    [prompts, comparePromptId, compareGroups],
  );

  const compareOld = useMemo(
    () => compareOptions.find(item => item.id === compareOldId) ?? compareOptions[0],
    [compareOldId, compareOptions],
  );

  const compareNew = useMemo(
    () => compareOptions.find(item => item.id === compareNewId) ?? compareOptions[1] ?? compareOptions[0],
    [compareNewId, compareOptions],
  );

  const loadData = async () => {
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
        feedback: item.feedback || 'Bài viết đã được nộp thành công.',
        submittedAt: normalizeSubmissionDate(item.submittedAt ?? item.submitted_at),
      }));
      setPrompts(nextPrompts);
      setDrafts(draftResult.items ?? []);
      setSubmissions(nextSubmissions);
      if (!selectedSubmissionId && nextSubmissions.length) {
        setSelectedSubmissionId(nextSubmissions[0].id);
      }
      if (nextPrompts.length && !selectedPromptId) {
        setSelectedPromptId(nextPrompts[0].id);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Không tải được bài viết.';
      setMessage(
        text.includes('unauthorized') || text.includes('hết hạn')
          ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục viết.'
          : text,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selectedPrompt) {
      return;
    }
    const currentDraft = drafts.find(item => item.prompt_id === selectedPrompt.id);
    if (currentDraft) {
      setAnswer(currentDraft.text);
    } else if (!answer && view === 'editor') {
      setAnswer('');
    }
  }, [selectedPrompt, drafts, view, answer]);

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
      if (selectedPrompt && drafts.some(item => item.id === draftId && item.prompt_id === selectedPrompt.id)) {
        setAnswer('');
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Không xóa được bản nháp.',
      );
    }
  };

  const handleSubmit = async () => {
    const trimmed = answer.trim();
    if (!trimmed) {
      setMessage('Hãy viết trước khi nộp bài.');
      return;
    }

    try {
      const response = await writingService.submitWriting({
        prompt_id: selectedPrompt?.id,
        prompt_title: selectedPrompt?.title ?? 'Bài viết tự do',
        text: trimmed,
      });

      const newSubmission: WritingSubmission = {
        id: response.submission.id,
        promptId: response.submission.prompt_id ?? `custom-${response.submission.id}`,
        promptTitle: response.submission.prompt_title || 'Bài viết tự do',
        text: response.submission.text,
        correctedText: response.submission.corrected_text || response.submission.correctedText || '',
        score: response.submission.score ?? 0,
        feedback: response.submission.feedback || 'Bài viết đã được nộp thành công.',
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
        error instanceof Error ? error.message : 'Không gửi được bài viết. Vui lòng thử lại.',
      );
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

    const firstGroup = compareGroups.find(group => group.versions.length >= 2) ?? compareGroups[0];

    if (!firstGroup) {
      setMessage('Bạn chưa có đủ bài nộp để so sánh.');
      setView('submissions');
      return;
    }

    setComparePromptId(firstGroup.key);
    setCompareOldId(firstGroup.versions[0]?.id ?? '');
    setCompareNewId(firstGroup.versions[1]?.id ?? firstGroup.versions[0]?.id ?? '');
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
    <AuthButton label="Quay lại" variant="text" onPress={() => setView('dashboard')} />
  );

  if (view === 'exercise') {
    return (
      <AuthShell
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
                {levelPrompts.map(prompt => (
                  <Pressable
                    key={prompt.id}
                    accessibilityRole="button"
                    onPress={() => startDraft(prompt.id)}
                    style={({ pressed }) => [
                      styles.promptCard,
                      pressed && styles.promptCardPressed,
                    ]}
                  >
                    <Text style={styles.promptTitle}>{prompt.title}</Text>
                    <Text style={styles.promptMeta}>{prompt.level}</Text>
                    <Text style={styles.promptHint} numberOfLines={3}>{prompt.instruction}</Text>
                  </Pressable>
                ))}
              </View>
            ))
          )}

          <View style={styles.separator} />
          <Text style={styles.sectionTitle}>Viết theo ý của bạn</Text>
          <AuthButton label="Viết bài theo ý của tôi" onPress={beginCustomWriting} />
        </View>
      </AuthShell>
    );
  }

  if (view === 'editor') {
    return (
      <AuthShell
        title={selectedPrompt?.title ?? 'Viết tiếng Nhật'}
        subtitle="Viết câu trả lời của bạn và lưu bản nháp để tiếp tục sau."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          {selectedPrompt ? (
            <View style={styles.promptPanel}>
              <Text style={styles.promptTitle}>{selectedPrompt.title}</Text>
              <Text style={styles.promptInstruction}>{selectedPrompt.instruction}</Text>
              <Text style={styles.promptHint}>{selectedPrompt.model_hint}</Text>
            </View>
          ) : null}

          <TextInput
            multiline
            numberOfLines={8}
            value={answer}
            onChangeText={setAnswer}
            placeholder="Viết câu trả lời của bạn ở đây..."
            placeholderTextColor={colors.placeholder}
            textAlignVertical="top"
            style={styles.textArea}
          />
          <View style={styles.actionRow}>
            <View style={styles.actionButtonWrap}>
              <AuthButton
                label={saving ? 'Đang lưu...' : 'Lưu'}
                onPress={handleSave}
                disabled={saving}
              />
            </View>
            <View style={styles.actionButtonWrap}>
              <AuthButton label="Nộp bài" onPress={handleSubmit} secondary />
            </View>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </AuthShell>
    );
  }

  if (view === 'drafts') {
    return (
      <AuthShell
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
                  setSelectedPromptId(draft.prompt_id);
                  setAnswer(draft.text);
                  setView('editor');
                }}
                style={({ pressed }) => [styles.draftCard, pressed && styles.promptCardPressed]}
              >
                <View style={styles.draftHeader}>
                  <Text style={styles.draftPrompt}>{draft.prompt?.title ?? 'Bài viết'}</Text>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={event => {
                      event.stopPropagation();
                      void handleDeleteDraft(draft.id);
                    }}
                    style={styles.deleteDraftButton}
                  >
                    <TrashIcon size={16} color={colors.muted} />
                  </Pressable>
                </View>
                <Text style={styles.draftText} numberOfLines={3}>{draft.text}</Text>
                <Text style={styles.draftMeta}>{draft.word_count} từ</Text>
              </Pressable>
            ))
          )}
        </View>
      </AuthShell>
    );
  }

  if (view === 'submissions') {
    return (
      <AuthShell
        title="Bài đã nộp"
        subtitle="Xem bài đã gửi, nhận xét AI và các lần làm lại trước đó."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          {submissions.length === 0 ? (
            <Text style={styles.empty}>Chưa có bài nộp nào. Hãy nộp bài viết đầu tiên để xem điểm và nhận xét.</Text>
          ) : (
            <>
              <AuthButton
                label={isSelectingForComparison ? 'Hủy chọn bài' : 'Chọn bài để so sánh'}
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
                    Đã chọn {selectedCompareIds.length}/2 bài. Hãy chọn hai lần nộp cùng đề.
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
                    accessibilityRole={isSelectingForComparison ? 'checkbox' : 'button'}
                    accessibilityLabel={
                      isSelectingForComparison
                        ? `${item.promptTitle}, ${new Date(item.submittedAt).toLocaleDateString('vi-VN')}`
                        : `Mở bài nộp ${item.promptTitle} ngày ${new Date(item.submittedAt).toLocaleDateString('vi-VN')}`
                    }
                    accessibilityState={isSelectingForComparison ? { checked: isSelected } : undefined}
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
                          <View style={[styles.submissionSelectionIndicator, isSelected && styles.submissionSelectionIndicatorSelected]}>
                            <Text style={styles.submissionSelectionCheck}>{isSelected ? '✓' : ''}</Text>
                          </View>
                        ) : null}
                        <Text style={styles.submissionTitle} numberOfLines={1}>{item.promptTitle}</Text>
                      </View>
                      <Text style={styles.scoreBadge}>{item.score} điểm</Text>
                    </View>
                    <Text style={styles.submissionText} numberOfLines={2}>{item.text}</Text>
                    <Text style={styles.draftMeta}>{new Date(item.submittedAt).toLocaleDateString('vi-VN')}</Text>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </AuthShell>
    );
  }

  if (view === 'submission-detail' && selectedSubmission) {
    return (
      <AuthShell
        title="Kết quả AI"
        subtitle="Nhận xét chi tiết và bản sửa đề xuất của hệ thống."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>{selectedSubmission.promptTitle}</Text>
            <Text style={styles.scoreBadgeLarge}>{selectedSubmission.score} điểm</Text>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Bài viết của bạn</Text>
            <Text style={styles.resultText}>{selectedSubmission.text}</Text>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Bản sửa đề xuất</Text>
            <Text style={styles.resultText}>{selectedSubmission.correctedText}</Text>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Nhận xét AI</Text>
            <Text style={styles.resultText}>{selectedSubmission.feedback}</Text>
          </View>

          <AuthButton
            label={reevaluatingSubmissionId === selectedSubmission.id ? 'Đang phân tích bài...' : 'Phân tích lại bằng AI'}
            onPress={() => reevaluateSubmission(selectedSubmission.id)}
            busy={reevaluatingSubmissionId === selectedSubmission.id}
            disabled={Boolean(reevaluatingSubmissionId) && reevaluatingSubmissionId !== selectedSubmission.id}
          />
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <AuthButton
            label="So sánh với phiên bản trước"
            onPress={() => {
              const compareGroupKey =
                selectedSubmission.promptId && prompts.some(prompt => prompt.id === selectedSubmission.promptId)
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
      </AuthShell>
    );
  }

  if (view === 'compare-select-prompt') {
    const availablePrompts = compareGroups.filter(group => group.versions.length >= 2);

    return (
      <AuthShell
        title="So sánh bài viết"
        subtitle="Chọn một nhóm bài viết hoặc đề bài bạn muốn đối chiếu giữa các lần nộp."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <Text style={styles.empty}>Chọn một nhóm bài để tiếp tục chọn 2 phiên bản cần so sánh.</Text>

          {availablePrompts.length === 0 ? (
            <Text style={styles.empty}>Bạn chưa có đủ bài nộp nào để so sánh.</Text>
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
                style={({ pressed }) => [styles.comparePromptCard, pressed && styles.promptCardPressed]}
              >
                <Text style={styles.comparePromptTitle}>{group.title}</Text>
                <Text style={styles.comparePromptMeta}>{group.versions.length} phiên bản</Text>
              </Pressable>
            ))
          )}
        </View>
      </AuthShell>
    );
  }

  if (view === 'compare-select-versions') {
    const versions = compareOptions.length > 0 ? compareOptions : submissions;
    const oldVersion = versions.find(item => item.id === compareOldId) ?? versions[0];
    const newVersion = versions.find(item => item.id === compareNewId) ?? versions[1] ?? versions[0];

    return (
      <AuthShell
        title="Chọn phiên bản cần so sánh"
        subtitle="Chọn 2 bài khác nhau để đối chiếu tiến bộ."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{typeof comparePrompt === 'string' ? comparePrompt : comparePrompt?.title ?? 'So sánh bài viết'}</Text>

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
                <Text style={styles.compareVersionTitle}>Lần {versions.indexOf(item) + 1}</Text>
                <Text style={styles.compareVersionScore}>{item.score} điểm</Text>
              </View>
              <Text style={styles.compareVersionMeta}>Nộp ngày {new Date(item.submittedAt).toLocaleDateString('vi-VN')}</Text>
              <Text style={styles.compareVersionText} numberOfLines={2}>{item.text}</Text>
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
                <Text style={styles.compareVersionTitle}>Lần {versions.indexOf(item) + 1}</Text>
                <Text style={styles.compareVersionScore}>{item.score} điểm</Text>
              </View>
              <Text style={styles.compareVersionMeta}>Nộp ngày {new Date(item.submittedAt).toLocaleDateString('vi-VN')}</Text>
              <Text style={styles.compareVersionText} numberOfLines={2}>{item.text}</Text>
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
      </AuthShell>
    );
  }

  if (view === 'compare-result') {
    const old = compareOptions.find(item => item.id === compareOldId) ?? compareOptions[0];
    const next = compareOptions.find(item => item.id === compareNewId) ?? compareOptions[1] ?? compareOptions[0];

    if (!old || !next) {
      return (
        <AuthShell
          title="So sánh bài viết"
          subtitle="Chưa đủ phiên bản để đối chiếu."
          icon="check"
          card={false}
          headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
          footer={renderBackButton()}
        >
          <View style={styles.section}><Text style={styles.empty}>Chưa có đủ dữ liệu để so sánh.</Text></View>
        </AuthShell>
      );
    }

    const scoreGain = next.score - old.score;
    const oldCharacterCount = getWritingCharacterCount(old.text);
    const nextCharacterCount = getWritingCharacterCount(next.text);
    const oldSentences = getWritingSentences(old.text);
    const nextSentences = getWritingSentences(next.text);
    const oldSentenceSet = new Set(oldSentences);
    const nextSentenceSet = new Set(nextSentences);
    const addedSentences = nextSentences.filter(sentence => !oldSentenceSet.has(sentence));
    const removedSentences = oldSentences.filter(sentence => !nextSentenceSet.has(sentence));
    const characterDelta = nextCharacterCount - oldCharacterCount;
    const sentenceDelta = nextSentences.length - oldSentences.length;

    return (
      <AuthShell
        title="Kết quả so sánh"
        subtitle="Bạn đang đối chiếu sự tiến bộ giữa hai phiên bản."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>{comparePrompt?.title ?? 'So sánh bài viết'}</Text>
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
                {scoreGain > 0 ? '+' : ''}{scoreGain} điểm
              </Text>
            </View>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Chi tiết bài viết</Text>
            <View style={styles.compareMetricsGrid}>
              <View style={styles.compareMetricCard}>
                <Text style={styles.compareMetricLabel}>Số ký tự</Text>
                <Text style={styles.compareMetricValue}>{oldCharacterCount} → {nextCharacterCount}</Text>
                <Text style={styles.compareMetricDelta}>
                  {characterDelta > 0 ? '+' : ''}{characterDelta} ký tự
                </Text>
              </View>
              <View style={styles.compareMetricCard}>
                <Text style={styles.compareMetricLabel}>Số câu</Text>
                <Text style={styles.compareMetricValue}>{oldSentences.length} → {nextSentences.length}</Text>
                <Text style={styles.compareMetricDelta}>
                  {sentenceDelta > 0 ? '+' : ''}{sentenceDelta} câu
                </Text>
              </View>
            </View>
            <Text style={styles.compareMetricNote}>
              Số ký tự không tính khoảng trắng. Đây là chỉ số độ dài, không tự đánh giá nội dung hay hơn.
            </Text>
          </View>

          <View style={styles.resultPanel}>
            <Text style={styles.sectionTitle}>Nội dung thay đổi</Text>
            <Text style={styles.compareChangeTitle}>Câu có trong bài mới</Text>
            {addedSentences.length ? (
              addedSentences.map((sentence, _index) => (
                <Text key={`added-${_index}-${sentence}`} style={styles.compareAddedText}>+ {sentence}</Text>
              ))
            ) : (
              <Text style={styles.compareMetricNote}>Không có câu mới hoàn toàn so với bài trước.</Text>
            )}
            <Text style={styles.compareChangeTitle}>Câu không còn trong bài mới</Text>
            {removedSentences.length ? (
              removedSentences.map((sentence, _index) => (
                <Text key={`removed-${_index}-${sentence}`} style={styles.compareRemovedText}>− {sentence}</Text>
              ))
            ) : (
              <Text style={styles.compareMetricNote}>Các câu cũ đều được giữ lại.</Text>
            )}
          </View>

          <View style={styles.resultPanel}>
            <View style={styles.compareSideRow}>
              <View style={styles.compareSideColumn}>
                <Text style={styles.sectionTitle}>Bài trước</Text>
                <Text style={styles.compareDate}>
                  Nộp ngày {new Date(old.submittedAt).toLocaleDateString('vi-VN')}
                </Text>
              </View>
              <View style={styles.compareSideColumn}>
                <Text style={styles.sectionTitle}>Bài mới</Text>
                <Text style={styles.compareDate}>
                  Nộp ngày {new Date(next.submittedAt).toLocaleDateString('vi-VN')}
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
              <Text style={styles.resultText}>{old.feedback || 'Không có nhận xét được lưu.'}</Text>
              <AuthButton
                label={reevaluatingSubmissionId === old.id ? 'Đang phân tích bài trước...' : 'Phân tích lại bài trước'}
                onPress={() => reevaluateSubmission(old.id)}
                busy={reevaluatingSubmissionId === old.id}
                disabled={Boolean(reevaluatingSubmissionId) && reevaluatingSubmissionId !== old.id}
                secondary
              />
            </View>
            <View style={styles.compareFeedbackBlock}>
              <Text style={styles.compareChangeTitle}>Bài mới</Text>
              <Text style={styles.resultText}>{next.feedback || 'Không có nhận xét được lưu.'}</Text>
              <AuthButton
                label={reevaluatingSubmissionId === next.id ? 'Đang phân tích bài mới...' : 'Phân tích lại bài mới'}
                onPress={() => reevaluateSubmission(next.id)}
                busy={reevaluatingSubmissionId === next.id}
                disabled={Boolean(reevaluatingSubmissionId) && reevaluatingSubmissionId !== next.id}
                secondary
              />
            </View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        </View>
      </AuthShell>
    );
  }

  if (view === 'progress') {
    const averageScore = submissions.length
      ? Math.round(submissions.reduce((sum, item) => sum + item.score, 0) / submissions.length)
      : 0;

    return (
      <AuthShell
        title="Tiến độ viết"
        subtitle="Theo dõi số lượng bài đã làm, số bản nháp và điểm trung bình của bạn."
        icon="check"
        card={false}
        headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
        footer={renderBackButton()}
      >
        <View style={styles.section}>
          <View style={styles.metricGrid}>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{submissions.length}</Text><Text style={styles.metricLabel}>Bài nộp</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{drafts.length}</Text><Text style={styles.metricLabel}>Bản nháp</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{averageScore || '-'}</Text><Text style={styles.metricLabel}>Điểm TB</Text></View>
          </View>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Luyện viết tiếng Nhật"
      subtitle="Viết mỗi ngày một chút, tiến bộ từng bước."
      icon="check"
      card={false}
      headerAccessory={<NihongoMascot pose="writing" size={96} decorative />}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setView('exercise')}
            style={({ pressed }) => [styles.heroCard, pressed && styles.promptCardPressed]}
          >
            <Text style={styles.heroTitle}>Bắt đầu viết</Text>
            <Text style={styles.heroText}>Khám phá đề bài theo trình độ của bạn.</Text>
            <Text style={styles.heroAction}>Chọn bài tập viết →</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quản lý bài viết</Text>
          <View style={styles.quickGrid}>
            <Pressable style={styles.quickCard} onPress={() => setView('drafts')}>
              <Text style={styles.quickLabel}>Bản nháp</Text>
              <Text style={styles.quickMeta}>{drafts.length} mục</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bài đã nộp"
              style={styles.quickCard}
              onPress={() => setView('submissions')}
            >
              <Text style={styles.quickLabel}>Bài đã nộp</Text>
              <Text style={styles.quickMeta}>{submissions.length} bài</Text>
            </Pressable>
            <Pressable style={styles.quickCard} onPress={beginCompareFlow}>
              <Text style={styles.quickLabel}>So sánh bài viết</Text>
              <Text style={styles.quickMeta}>Lịch sử phiên bản</Text>
            </Pressable>
            <Pressable style={styles.quickCard} onPress={() => setView('progress')}>
              <Text style={styles.quickLabel}>Tiến độ viết</Text>
              <Text style={styles.quickMeta}>Theo dõi tiến bộ</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bài viết gần đây</Text>
          {submissions.length === 0 && drafts.length === 0 ? (
            <View style={styles.recentEmpty}>
              <Text style={styles.empty}>Chưa có bài viết nào.</Text>
              <Text style={styles.empty}>Hãy chọn bài tập đầu tiên để bắt đầu hành trình luyện viết.</Text>
            </View>
          ) : (
            [...submissions.slice(0, 2), ...drafts.slice(0, 2)].slice(0, 4).map((item, index) => {
              const isDraft = 'prompt_id' in item;
              const title = isDraft ? (item.prompt?.title ?? 'Bài viết') : item.promptTitle;
              const text = isDraft ? item.text : item.text;
              return (
                <Pressable
                  key={isDraft ? `draft-${item.id}` : item.id}
                  onPress={() => {
                    if (isDraft) {
                      setSelectedPromptId(item.prompt_id);
                      setAnswer(item.text);
                      setView('editor');
                    } else {
                      setSelectedSubmissionId(item.id);
                      setView('submission-detail');
                    }
                  }}
                  style={({ pressed }) => [styles.draftCard, pressed && styles.promptCardPressed]}
                >
                  <Text style={styles.draftPrompt}>{title}</Text>
                  <Text style={styles.draftText} numberOfLines={2}>{text}</Text>
                  {isDraft ? <Text style={styles.draftMeta}>{item.word_count} từ</Text> : <Text style={styles.draftMeta}>{item.score} điểm</Text>}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
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
  heroAction: {
    ...typography.label,
    color: colors.primaryText,
    marginTop: spacing.xs,
  },
  sectionTitle: { ...typography.heading, color: colors.dark },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  quickCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    boxShadow: shadowMd,
    gap: spacing.xs,
  },
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
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    borderRadius: radius.small,
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
  compareText: { ...typography.body, color: colors.dark, lineHeight: 20, flex: 1 },
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

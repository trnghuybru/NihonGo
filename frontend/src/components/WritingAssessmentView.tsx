import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  WritingAssessment,
  WritingCorrection,
} from '../services/writingService';
import { WritingRadarChart } from './WritingRadarChart';
import { useWebLayout } from '../hooks/useWebLayout';
import {
  EyeIcon,
  CheckIcon,
  PencilIcon,
  MessageSquareIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from './icons';
import { colors, radius, spacing, typography } from '../theme/theme';

const rubricTitles = [
  'Đáp ứng đề bài',
  'Tổ chức và liên kết',
  'Ngữ pháp',
  'Từ vựng và chính tả',
];
const noCorrections: WritingCorrection[] = [];

export function WritingCriteriaGuide() {
  return (
    <View style={styles.guide}>
      <Text style={styles.heading}>Tiêu chí chấm bài</Text>
      {rubricTitles.map(title => (
        <View key={title} style={styles.row}>
          <Text style={[styles.body, styles.flex]}>{title}</Text>
          <Text style={styles.muted}>25 điểm</Text>
        </View>
      ))}
    </View>
  );
}

type Segment = { text: string; correction?: WritingCorrection; index?: number };

// API offsets count Unicode code points, including emoji as a single character.
export function writingCorrectionSegments(
  text: string,
  corrections: WritingCorrection[],
): Segment[] | null {
  const characters = Array.from(text);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const [index, correction] of corrections.entries()) {
    if (
      !Number.isInteger(correction.start) ||
      !Number.isInteger(correction.end) ||
      correction.start < cursor ||
      correction.end <= correction.start ||
      correction.end > characters.length ||
      characters.slice(correction.start, correction.end).join('') !==
        correction.original
    )
      return null;
    segments.push({
      text: characters.slice(cursor, correction.start).join(''),
    });
    segments.push({ text: correction.original, correction, index });
    cursor = correction.end;
  }
  segments.push({ text: characters.slice(cursor).join('') });
  return segments;
}

type Props = {
  text: string;
  correctedText: string;
  feedback: string;
  assessment?: WritingAssessment | null;
  stacked?: boolean;
  mobileSheet?: boolean;
};
type Mode = 'changes' | 'original' | 'corrected';

export function WritingAssessmentView({
  text,
  correctedText,
  feedback,
  assessment,
  stacked = false,
  mobileSheet = false,
}: Props) {
  const { desktop, contentWidth } = useWebLayout();
  const split = desktop && !stacked;
  const wideCriteria = desktop && contentWidth >= 1100;
  const renderAsSheet = mobileSheet && !desktop;
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('changes');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openCriterion, setOpenCriterion] = useState<string | null>('task');
  const corrections = assessment?.corrections ?? noCorrections;
  const segments = useMemo(
    () => writingCorrectionSegments(text, corrections),
    [text, corrections],
  );
  const activeIndex = Math.min(
    selectedIndex,
    Math.max(0, corrections.length - 1),
  );
  const selected = corrections[activeIndex];
  const criterionTitle =
    selected?.criterion_id === 'vocabulary'
      ? 'Từ vựng và chính tả'
      : assessment?.criteria.find(item => item.id === selected?.criterion_id)
          ?.title;

  const explanation = (
    <View style={[styles.paper, split && styles.explanationDesktop]}>
      <View style={styles.row}>
        <Text style={styles.heading}>Giải thích</Text>
        <Text style={styles.muted}>
          {corrections.length
            ? `${activeIndex + 1}/${corrections.length}`
            : '0'}
        </Text>
      </View>
      {selected ? (
        <>
          <View style={styles.numberList}>
            {corrections.map((_, index) => (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={`Chỗ sửa ${index + 1}`}
                accessibilityState={{ selected: index === activeIndex }}
                onPress={() => {
                  setSelectedIndex(index);
                  setMode('changes');
                }}
                style={({ pressed }) => [
                  styles.number,
                  index === activeIndex && styles.modeActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    index === activeIndex && styles.modeTextActive,
                  ]}
                >
                  {index + 1}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.tags}>
            <Text style={styles.tag}>
              {selected.kind === 'error' ? 'Lỗi cần sửa' : 'Gợi ý diễn đạt'}
            </Text>
            <Text style={styles.muted}>{criterionTitle}</Text>
          </View>
          <Text style={styles.muted}>Trong bài gốc</Text>
          <Text selectable style={styles.originalQuote}>
            {selected.original}
          </Text>
          <Text style={styles.muted}>Đề xuất</Text>
          <Text selectable style={styles.replacementQuote}>
            {selected.replacement || '(Bỏ phần này)'}
          </Text>
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {selected.explanation}
          </Text>
          <View style={styles.navigation}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chỗ sửa trước"
              disabled={activeIndex === 0}
              onPress={() => setSelectedIndex(activeIndex - 1)}
              style={[styles.arrow, activeIndex === 0 && styles.disabled]}
            >
              <ChevronLeftIcon size={18} color={colors.primaryText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chỗ sửa tiếp theo"
              disabled={activeIndex === corrections.length - 1}
              onPress={() => setSelectedIndex(activeIndex + 1)}
              style={[
                styles.arrow,
                activeIndex === corrections.length - 1 && styles.disabled,
              ]}
            >
              <ChevronRightIcon size={18} color={colors.primaryText} />
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={styles.body}>
          Không có gợi ý sửa cụ thể trong lượt nhận xét này. Bạn có thể xem nhận
          xét theo tiêu chí bên dưới.
        </Text>
      )}
    </View>
  );

  if (!assessment) {
    return (
      <View style={styles.section}>
        <Text style={styles.muted}>
          Bài này chưa có điểm theo tiêu chí. Chọn “Phân tích lại bằng AI” để
          cập nhật.
        </Text>
        <View style={[styles.section, split && styles.columns]}>
          <View style={[styles.paper, split && styles.flex]}>
            <Text style={styles.heading}>Bài viết của bạn</Text>
            <Text selectable style={styles.essay}>
              {text}
            </Text>
          </View>
          <View style={[styles.paper, split && styles.flex]}>
            <Text style={styles.heading}>Bản sửa đề xuất</Text>
            <Text selectable style={styles.essay}>
              {correctedText}
            </Text>
          </View>
        </View>
        <View style={styles.paper}>
          <Text style={styles.heading}>Nhận xét AI</Text>
          <Text style={styles.body}>{feedback}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={[styles.section, split && styles.columns]}>
        <View style={[styles.paper, split && styles.flex]}>
          <View style={styles.toolbar}>
            <Text style={styles.heading}>Bài viết của bạn</Text>
            <View style={styles.modes}>
              {(
                [
                  ['changes', 'Chỉnh sửa', PencilIcon],
                  ['original', 'Bản gốc', EyeIcon],
                  ['corrected', 'Đã sửa', CheckIcon],
                ] as const
              ).map(([value, label, Icon]) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: mode === value }}
                  onPress={() => setMode(value)}
                  style={({ pressed }) => [
                    styles.mode,
                    mode === value && styles.modeActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon
                    size={14}
                    color={
                      mode === value ? colors.onPrimary : colors.primaryText
                    }
                  />
                  <Text
                    style={[
                      styles.modeText,
                      mode === value && styles.modeTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {mode === 'changes' ? (
            <View style={styles.legend}>
              <Text style={styles.removedLegend}>Bỏ / thay thế</Text>
              <Text style={styles.addedLegend}>Đề xuất mới</Text>
              <Text style={styles.muted}>Chọn chỗ sửa để xem giải thích.</Text>
            </View>
          ) : null}
          <Text selectable style={styles.essay} testID="writing-review-text">
            {mode === 'original'
              ? text
              : mode === 'corrected'
              ? correctedText
              : segments
              ? segments.map((segment, index) =>
                  segment.correction ? (
                    <Text
                      key={index}
                      accessibilityRole="button"
                      accessibilityLabel={`Xem giải thích chỗ sửa ${
                        segment.index! + 1
                      }`}
                      onPress={() => {
                        setSelectedIndex(segment.index!);
                        if (renderAsSheet) setExplanationOpen(true);
                      }}
                      style={
                        segment.index === activeIndex
                          ? styles.activeCorrection
                          : undefined
                      }
                    >
                      <Text style={styles.removed}>{segment.text}</Text>
                      <Text style={styles.added}>
                        {segment.correction.replacement}
                      </Text>
                    </Text>
                  ) : (
                    segment.text
                  ),
                )
              : text}
          </Text>
          <Text style={styles.muted}>
            {Array.from(text.replace(/\s/g, '')).length} ký tự ·{' '}
            {corrections.length} gợi ý sửa ưu tiên
          </Text>
        </View>
        {renderAsSheet ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem giải thích"
            onPress={() => setExplanationOpen(true)}
            style={styles.sheetTrigger}
          >
            <MessageSquareIcon size={16} color={colors.primaryText} />
            <Text style={styles.modeText}>Giải thích</Text>
            <ChevronRightIcon size={16} color={colors.primaryText} />
          </Pressable>
        ) : (
          explanation
        )}
        {renderAsSheet ? (
          <Modal
            visible={explanationOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setExplanationOpen(false)}
          >
            <View style={styles.sheetBackdrop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng giải thích"
                onPress={() => setExplanationOpen(false)}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.sheetContainer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đóng giải thích"
                  onPress={() => setExplanationOpen(false)}
                  style={styles.sheetClose}
                >
                  <XIcon size={18} color={colors.body} />
                </Pressable>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {explanation}
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
      <View style={styles.paper}>
        <View style={styles.row}>
          <Text style={styles.heading}>Nhận xét theo tiêu chí</Text>
          <Text style={styles.tag}>{assessment.level}</Text>
        </View>
        <View style={[styles.criteriaLayout, wideCriteria && styles.columns]}>
          <View style={[styles.chartPanel, wideCriteria && styles.chartSide]}>
            <WritingRadarChart criteria={assessment.criteria} />
          </View>
          <View style={[styles.criteriaList, wideCriteria && styles.flex]}>
            {assessment.criteria.map(criterion => (
              <View key={criterion.id} style={styles.criterion}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tiêu chí ${
                    criterion.id === 'vocabulary'
                      ? 'Từ vựng và chính tả'
                      : criterion.title
                  }`}
                  accessibilityState={{
                    expanded: openCriterion === criterion.id,
                  }}
                  onPress={() =>
                    setOpenCriterion(
                      openCriterion === criterion.id ? null : criterion.id,
                    )
                  }
                  style={styles.row}
                >
                  <Text style={[styles.label, styles.flex]}>
                    {criterion.id === 'vocabulary'
                      ? 'Từ vựng và chính tả'
                      : criterion.title}
                  </Text>
                  <Text style={styles.criterionScore}>
                    {criterion.score}
                    <Text style={styles.muted}>/25</Text>
                  </Text>
                  <View
                    style={
                      openCriterion === criterion.id
                        ? styles.chevronOpen
                        : undefined
                    }
                  >
                    <ChevronDownIcon size={16} color={colors.primaryText} />
                  </View>
                </Pressable>
                <View style={styles.scoreTrack}>
                  <View
                    style={[
                      styles.scoreFill,
                      {
                        width: `${
                          Math.max(0, Math.min(25, criterion.score)) * 4
                        }%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.body}>{criterion.comment}</Text>
                {openCriterion === criterion.id ? (
                  <View style={styles.subscores}>
                    {criterion.subcriteria.map(sub => (
                      <View key={sub.id} style={styles.row}>
                        <Text style={[styles.body, styles.flex]}>
                          {sub.title}
                        </Text>
                        <Text style={styles.subscore}>{sub.score}/5</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.guide}>
        <Text style={styles.heading}>Bài tập tiếp theo</Text>
        <Text style={styles.body}>{assessment.next_step}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(37,37,38,0.32)',
  },
  sheetContainer: {
    maxHeight: '80%',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingBottom: spacing.section,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  sheetClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    borderRadius: radius.pill,
  },
  section: { gap: spacing.lg },
  columns: { flexDirection: 'row', alignItems: 'stretch' },
  flex: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  heading: { ...typography.heading, color: colors.dark },
  body: { ...typography.body, color: colors.body, lineHeight: 21 },
  muted: { ...typography.caption, color: colors.muted, lineHeight: 19 },
  paper: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.lg,
    minWidth: 0,
  },
  guide: {
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceTint,
    padding: spacing.lg,
    gap: spacing.md,
  },
  essay: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 32,
    color: colors.dark,
    minHeight: 160,
  },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mode: {
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: {
    ...typography.label,
    fontSize: 11,
    lineHeight: 16,
    color: colors.body,
  },
  modeTextActive: { color: colors.onPrimary },
  pressed: { opacity: 0.8 },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  removedLegend: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.xs,
  },
  addedLegend: {
    ...typography.caption,
    color: colors.success,
    backgroundColor: colors.successBg,
    paddingHorizontal: spacing.xs,
  },
  removed: {
    backgroundColor: colors.dangerBg,
    color: colors.danger,
    textDecorationLine: 'line-through',
  },
  added: {
    backgroundColor: colors.successBg,
    color: colors.success,
    textDecorationLine: 'underline',
  },
  activeCorrection: {
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary,
  },
  explanationDesktop: { width: 300, alignSelf: 'flex-start' },
  numberList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  number: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    ...typography.caption,
    color: colors.badgeText,
    backgroundColor: colors.badgeBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  originalQuote: {
    ...typography.label,
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.sm,
    borderRadius: radius.small,
    lineHeight: 24,
  },
  replacementQuote: {
    ...typography.label,
    color: colors.success,
    backgroundColor: colors.successBg,
    padding: spacing.sm,
    borderRadius: radius.small,
    lineHeight: 24,
  },
  navigation: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  arrow: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  criteriaLayout: { gap: spacing.xxl },
  chartPanel: { minWidth: 0 },
  chartSide: { width: 280, flexShrink: 0 },
  criteriaList: { minWidth: 0, gap: spacing.lg },
  criterion: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  label: { ...typography.label, color: colors.dark },
  criterionScore: { ...typography.heading, color: colors.dark },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  scoreTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  subscores: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  subscore: { ...typography.caption, color: colors.dark },
});

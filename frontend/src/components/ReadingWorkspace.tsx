import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import {
  ReadingAnalysis,
  ReadingAnchor,
  ReadingPassage,
  ReadingSentence,
  ReadingSentenceAnalysis,
  readingService,
} from '../services/readingService';
import type { ShadowingToken } from '../services/shadowingService';
import { colors, radius, spacing, typography } from '../theme/theme';
import { ReadingScrollRegion } from './ReadingScrollRegion';
import { ReadingAnalysisPanel } from './ReadingAnalysisPanel';
import { ReadingQuiz } from './ReadingQuiz';
import { ReadingTips } from './ReadingTips';
import { LightbulbIcon } from './icons';
import { ShadowingTokenText } from './ShadowingWordLookup';

export function sliceReadingTokens(
  tokens: ShadowingToken[],
  start: number,
  end: number,
): ShadowingToken[] {
  let cursor = 0;
  return tokens.flatMap(token => {
    const offset = cursor;
    cursor += token.text.length;
    const text = token.text.slice(
      Math.max(0, start - offset),
      Math.max(0, Math.min(token.text.length, end - offset)),
    );
    return text && offset < end && cursor > start ? [{ ...token, text }] : [];
  });
}
export function ReadingWorkspace({
  passage,
  accountId,
  showFurigana,
  split,
  selectedKey,
  onWordPress,
  onScrollTo,
}: {
  passage: ReadingPassage;
  accountId: string;
  showFurigana: boolean;
  split: boolean;
  selectedKey?: string | null;
  onWordPress: (key: string, y: number) => void;
  onScrollTo: (y: number) => void;
}) {
  const [hoveredSentence, setHoveredSentence] = useState<string | null>(null);
  const [tab, setTab] = useState<'questions' | 'analysis' | 'tips'>(
    passage.quiz.questions.length ? 'questions' : 'analysis',
  );
  const [highlight, setHighlight] = useState<ReadingAnchor | null>(null);
  const [analysis, setAnalysis] = useState<ReadingAnalysis | null>(
    passage.study_analysis ?? null,
  );
  const [sentenceData, setSentenceData] = useState<
    Record<string, ReadingSentenceAnalysis>
  >({});
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const alive = useRef(true),
    pending = useRef(new Set<string>());
  const left = useRef<ComponentRef<typeof ScrollView>>(null),
    right = useRef<ComponentRef<typeof ScrollView>>(null);
  const rightOffset = useRef(0),
    bodyOffset = useRef(0);
  const sentenceOffsets = useRef<Record<string, number>>({});
  const paragraphOffsets = useRef<Record<string, number>>({});
  const sentences = passage.sentences ?? [];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run<T>(
    key: string,
    request: () => Promise<T>,
    accept: (data: T) => void,
  ) {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setBusy(current => ({ ...current, [key]: true }));
    setErrors(current => ({ ...current, [key]: '' }));
    try {
      const data = await request();
      if (alive.current) accept(data);
    } catch (cause) {
      if (alive.current)
        setErrors(current => ({ ...current, [key]: errorMessage(cause) }));
    } finally {
      pending.current.delete(key);
      if (alive.current) setBusy(current => ({ ...current, [key]: false }));
    }
  }
  const focus = (anchor: ReadingAnchor) => {
    setHighlight(anchor);
    const y =
      bodyOffset.current + (sentenceOffsets.current[anchor.sentence_id] ?? 0);
    if (split) left.current?.scrollTo({ y, animated: true });
    else onScrollTo(y);
  };
  const selectSentence = (sentence: ReadingSentence) => {
    focus({
      sentence_id: sentence.id,
      paragraph_id: sentence.paragraph_id,
      quote: sentence.text,
      start: sentence.start,
      end: sentence.end,
    });
    setSelectedSentence(sentence.id);
    setTab('analysis');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (split) right.current?.scrollTo({ y: 0, animated: true });
        else onScrollTo(rightOffset.current);
      }),
    );
    const existing = analysis?.sentences.find(
      item => item.sentence_id === sentence.id,
    );
    if (existing?.segments?.length) {
      setSentenceData(current => ({ ...current, [sentence.id]: existing }));
      return;
    }
    if (!sentenceData[sentence.id])
      run(
        sentence.id,
        () => readingService.analyzeSentence(passage.id, sentence.id),
        data =>
          setSentenceData(current => ({ ...current, [sentence.id]: data })),
      );
  };
  // Keep source anchors aligned when text layout changes (for example, furigana).
  const sentenceLayout = (sentence: ReadingSentence, y: number) => {
    sentenceOffsets.current[sentence.id] = y;
    if (highlight?.sentence_id === sentence.id) {
      const offset = bodyOffset.current + y;
      if (split) left.current?.scrollTo({ y: offset, animated: true });
      else onScrollTo(offset);
    }
  };
  const activeDetail = selectedSentence
    ? sentenceData[selectedSentence] ??
      analysis?.sentences.find(
        s => s.sentence_id === selectedSentence && s.segments?.length,
      ) ??
      null
    : null;
  return (
    <View
      style={[styles.layout, split && styles.split]}
      testID="reading-layout"
    >
      <ReadingScrollRegion
        testID="reading-passage-pane"
        accessibilityLabel="Nội dung bài đọc"
        scrollRef={left}
        scrollable={split}
        style={[styles.stacked, split && styles.left]}
        contentContainerStyle={split && styles.pane}
      >
        <View style={styles.article}>
          <View style={styles.meta}>
            {passage.level ? (
              <Text style={styles.badge}>
                {/^N[1-5]$/.test(passage.level)
                  ? `JLPT ${passage.level}`
                  : passage.level}
              </Text>
            ) : null}
            <Text style={styles.caption}>{passage.kind_label}</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {passage.title}
          </Text>
          <View
            style={styles.paragraphs}
            onLayout={event => {
              bodyOffset.current = event.nativeEvent.layout.y;
            }}
          >
            {passage.paragraphs.map(paragraph => (
              <View
                key={paragraph.id}
                testID={`reading-paragraph-${paragraph.id}`}
                style={styles.paragraph}
                onLayout={event => {
                  paragraphOffsets.current[paragraph.id] =
                    event.nativeEvent.layout.y;
                }}
              >
                {paragraph.text ? (
                  <ShadowingTokenText
                    text={paragraph.text}
                    tokens={paragraph.tokens}
                    words={passage.words}
                    showFurigana={showFurigana}
                    preserveLayout
                    selectedKey={selectedKey}
                    onWordPress={onWordPress}
                    interactiveRanges={sentences.flatMap((sentence, index) =>
                      sentence.paragraph_id === paragraph.id
                        ? [
                            {
                              id: sentence.id,
                              start: sentence.start,
                              end: sentence.end,
                              label: `Xem cấu trúc câu ${index + 1}`,
                              onPress: () => selectSentence(sentence),
                            },
                          ]
                        : [],
                    )}
                    activeRangeId={hoveredSentence}
                    onRangeHover={setHoveredSentence}
                    onRangeLayout={(id, y) => {
                      const sentence = sentences.find(item => item.id === id);
                      if (sentence)
                        sentenceLayout(
                          sentence,
                          (paragraphOffsets.current[paragraph.id] ?? 0) + y,
                        );
                    }}
                    highlightRanges={
                      highlight?.paragraph_id === paragraph.id
                        ? [{ start: highlight.start, end: highlight.end }]
                        : []
                    }
                    style={styles.japanese}
                  />
                ) : null}
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Nguồn bài đọc"
            {...(Platform.OS === 'web'
              ? {
                  href: passage.source_url,
                  hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' },
                }
              : {
                  onPress: () => {
                    Linking.openURL(passage.source_url).catch(() => undefined);
                  },
                })}
          >
            <Text style={styles.cta}>Nguồn bài đọc ↗</Text>
          </Pressable>
        </View>
      </ReadingScrollRegion>
      <ReadingScrollRegion
        testID="reading-question-pane"
        accessibilityLabel="Câu hỏi và phân tích"
        scrollRef={right}
        scrollable={split}
        style={[styles.stacked, split && styles.right]}
        contentContainerStyle={[styles.studyPane, split && styles.pane]}
        onLayout={event => {
          rightOffset.current = event.nativeEvent.layout.y;
        }}
      >
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Nội dung hỗ trợ đọc"
          style={styles.modes}
        >
          {(['questions', 'analysis', 'tips'] as const)
            .filter(
              value => value !== 'questions' || passage.quiz.questions.length,
            )
            .map(value => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityLabel={
                  value === 'questions'
                    ? 'Câu hỏi'
                    : value === 'analysis'
                    ? 'Phân tích bài đọc'
                    : 'Tips đọc hiểu'
                }
                accessibilityState={{ selected: tab === value }}
                aria-selected={tab === value}
                onPress={() => setTab(value)}
                style={[styles.modeButton, tab === value && styles.selected]}
              >
                {value === 'tips' ? (
                  <LightbulbIcon
                    size={20}
                    color={tab === value ? colors.focus : colors.muted}
                  />
                ) : (
                  <Text
                    style={[styles.label, tab === value && styles.selectedText]}
                  >
                    {value === 'questions' ? 'Câu hỏi' : 'Phân tích'}
                  </Text>
                )}
              </Pressable>
            ))}
        </View>
        {tab === 'tips' ? <ReadingTips text={passage.text} /> : null}
        <View style={tab !== 'questions' && styles.hidden}>
          <ReadingQuiz
            key={`${accountId}:${passage.id}:${passage.quiz.version}`}
            passageId={passage.id}
            quiz={passage.quiz}
            onFocusEvidence={focus}
            onGraded={() => {
              if (split) right.current?.scrollTo({ y: 0, animated: true });
              else onScrollTo(rightOffset.current);
            }}
          />
        </View>
        <View style={tab !== 'analysis' && styles.hidden}>
          <ReadingAnalysisPanel
            analysis={analysis}
            busy={Boolean(busy.analysis)}
            error={errors.analysis ?? ''}
            onLoad={() => {
              run(
                'analysis',
                () => readingService.analyze(passage.id),
                setAnalysis,
              );
            }}
            onFocus={focus}
            sentences={sentences}
            selectedSentence={selectedSentence}
            detail={activeDetail}
            sentenceBusy={Boolean(selectedSentence && busy[selectedSentence])}
            sentenceError={
              selectedSentence ? errors[selectedSentence] ?? '' : ''
            }
            onSelectSentence={selectSentence}
          />
        </View>
      </ReadingScrollRegion>
    </View>
  );
}
const styles = StyleSheet.create({
  layout: { gap: 20 },
  split: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'stretch' },
  stacked: { flexGrow: 0, flexShrink: 0 },
  left: {
    flexGrow: 1.15,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
  },
  right: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
  },
  pane: { paddingBottom: spacing.xxl },
  studyPane: { gap: spacing.md },
  article: {
    padding: 20,
    gap: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: {
    ...typography.caption,
    color: colors.focus,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  title: { ...typography.title, color: colors.dark },
  caption: { ...typography.caption, color: colors.muted },
  label: { ...typography.label, color: colors.body },
  cta: { ...typography.button, color: colors.primaryText },
  paragraphs: { gap: spacing.md },
  paragraph: { minHeight: 30 },
  japanese: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 28,
    color: colors.dark,
  },
  modes: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selected: { borderBottomColor: colors.primaryText },
  selectedText: { color: colors.focus },
  hidden: { display: 'none' },
});

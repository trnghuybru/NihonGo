import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ReadingAnchor,
  ReadingSentenceAnalysis,
  ReadingSentenceSegment,
} from '../services/readingService';
import {
  colors,
  radius,
  sentenceRoles,
  spacing,
  typography,
} from '../theme/theme';

export function ReadingSentenceDetail({
  detail,
  onFocus,
}: {
  detail: ReadingSentenceAnalysis;
  onFocus: (anchor: ReadingAnchor) => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ReadingSentenceSegment | null>(null);
  const segments = detail.segments ?? [];
  const coreText =
    detail.core_text ?? detail.layers[0]?.text ?? detail.original;
  const coreTranslation =
    detail.core_translation_vi ?? detail.layers[0]?.meaning ?? detail.main_idea;
  const collapsible = segments.filter(segment => !segment.is_core);
  const fullSentence =
    showFull ||
    (collapsible.length > 0 &&
      collapsible.every(segment => expanded.has(segment.id)));
  const choose = (segment: ReadingSentenceSegment) => {
    if (!segment.is_core) {
      setShowFull(false);
      setExpanded(current => {
        const next = new Set(current);
        if (next.has(segment.id)) next.delete(segment.id);
        else next.add(segment.id);
        return next;
      });
    }
    const closing = !segment.is_core && expanded.has(segment.id);
    setSelected(closing ? null : segment);
    if (!closing) onFocus(segment.location);
  };
  return (
    <View style={styles.body} testID="reading-sentence-detail">
      <View style={styles.frame}>
        <View style={styles.row}>
          <Text style={styles.caption}>
            {fullSentence ? 'Câu đầy đủ' : 'Khung câu cốt lõi'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fullSentence ? 'Thu gọn câu' : 'Đầy đủ câu'}
            accessibilityState={{ expanded: fullSentence }}
            aria-expanded={fullSentence}
            onPress={() => {
              setShowFull(!fullSentence);
              setExpanded(
                fullSentence
                  ? new Set()
                  : new Set(collapsible.map(segment => segment.id)),
              );
              setSelected(null);
            }}
            style={styles.fullButton}
          >
            <Text style={styles.fullButtonText}>
              {fullSentence ? 'Thu gọn câu' : 'Đầy đủ câu'}
            </Text>
          </Pressable>
        </View>
        {segments.length ? (
          <View style={styles.flow} testID="sentence-segments">
            {segments.map(segment => {
              const visible =
                showFull || segment.is_core || expanded.has(segment.id);
              const role = sentenceRoles[segment.role];
              return (
                <Pressable
                  key={segment.id}
                  testID={`sentence-part-${segment.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    visible
                      ? `${role.label}: ${segment.text}`
                      : `Mở ${role.label.toLowerCase()}`
                  }
                  accessibilityState={{ expanded: visible }}
                  aria-expanded={visible}
                  onPress={() => choose(segment)}
                  style={[
                    styles.segment,
                    selected?.id === segment.id && styles.selectedSegment,
                    {
                      backgroundColor: role.background,
                      borderColor: role.text,
                    },
                  ]}
                >
                  <Text
                    style={[
                      visible ? styles.japanese : styles.collapsedText,
                      { color: role.text },
                    ]}
                  >
                    {visible ? segment.text : `… ${role.label} +`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text selectable style={styles.original}>
            {fullSentence ? detail.original : coreText}
          </Text>
        )}
        {detail.implicit_subject ? (
          <Text style={styles.caption}>
            Chủ thể ẩn: {detail.implicit_subject}
          </Text>
        ) : null}
      </View>
      {segments.length ? (
        <View style={styles.legend} accessibilityLabel="Màu thành phần câu">
          {Array.from(new Set(segments.map(segment => segment.role))).map(
            key => (
              <View
                key={key}
                style={[
                  styles.roleBadge,
                  { backgroundColor: sentenceRoles[key].background },
                ]}
              >
                <Text
                  style={[styles.caption, { color: sentenceRoles[key].text }]}
                >
                  {sentenceRoles[key].label}
                </Text>
              </View>
            ),
          )}
        </View>
      ) : null}
      <View style={styles.translation}>
        <Text style={styles.label}>
          {fullSentence ? 'Nghĩa đầy đủ' : 'Nghĩa lõi câu'}
        </Text>
        <Text selectable style={styles.meaning}>
          {fullSentence ? detail.translation_vi : coreTranslation}
        </Text>
      </View>
      {detail.caution ? (
        <Text style={styles.caution}>{detail.caution}</Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  body: { gap: spacing.md },
  fullButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.badgeBg,
  },
  fullButtonText: { ...typography.label, color: colors.focus },
  label: { ...typography.label, color: colors.dark },
  caption: { ...typography.caption, color: colors.muted },
  frame: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
  },
  flow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  segment: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '100%',
  },
  selectedSegment: { borderWidth: 2 },
  japanese: {
    ...typography.body,
    fontSize: 18,
    lineHeight: 30,
    color: colors.dark,
  },
  original: {
    ...typography.body,
    fontSize: 20,
    lineHeight: 34,
    color: colors.dark,
  },
  collapsedText: { ...typography.label, fontSize: 12, lineHeight: 20 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },

  translation: {
    padding: spacing.md,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
    gap: spacing.sm,
  },
  meaning: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 24,
    color: colors.body,
  },
  caution: { ...typography.caption, lineHeight: 21, color: colors.danger },
});

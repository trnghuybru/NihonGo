import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { VideoExample } from '../services/videoExamplesService';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';

export function videoTimestamp(seconds: number) {
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function HighlightedCaption({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const parts = query ? text.split(query) : [text];
  return (
    <Text style={styles.sentence}>
      {parts.map((part, index) => (
        <Text key={index}>
          {index > 0 ? <Text style={styles.highlight}>{query}</Text> : null}
          {part}
        </Text>
      ))}
    </Text>
  );
}

export const VideoExampleCard = memo(function VideoExampleCardView({
  example,
  query,
  onOpen,
  selected,
}: {
  example: VideoExample;
  query: string;
  onOpen: (example: VideoExample) => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Xem ví dụ tại ${videoTimestamp(
        example.start_seconds,
      )}`}
      accessibilityState={{ selected }}
      onPress={() => onOpen(example)}
      style={({ pressed }) => [
        styles.card,
        selected ? styles.selected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <HighlightedCaption text={example.search_text} query={query} />
      <Text style={styles.title} numberOfLines={2}>
        {example.video.title}
      </Text>
      <View style={styles.footer}>
        <Text style={styles.caption}>
          {example.video.channel} · {videoTimestamp(example.start_seconds)}
        </Text>
        <View style={styles.action}>
          <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}>
            <Path d="m8 5 11 7-11 7Z" fill={colors.primaryText} />
          </Svg>
          <Text style={styles.link}>
            {selected ? 'Đang chọn' : 'Xem đoạn này'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    boxShadow: shadowMd,
    borderWidth: 1,
    borderColor: colors.divider,
    minHeight: layout.touchTarget,
  },
  pressed: { backgroundColor: colors.surfaceTint },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
  },
  sentence: { ...typography.heading, color: colors.dark, lineHeight: 26 },
  highlight: { color: colors.badgeText, backgroundColor: colors.badgeBg },
  title: { ...typography.body, color: colors.body },
  caption: { ...typography.caption, color: colors.muted, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  link: { ...typography.link, color: colors.primaryText },
});

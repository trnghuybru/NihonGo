import { useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ShadowingLesson } from '../services/shadowingService';
import { ShadowingTokenText } from './ShadowingWordLookup';
import { ChevronDownIcon, PlayCircleIcon } from './icons';
import { colors, radius, spacing, typography } from '../theme/theme';

type Props = {
  lesson: ShadowingLesson;
  currentIndex: number;
  following: boolean;
  selectedWordKey: string | null;
  onBrowse: () => void;
  onFollow: () => void;
  onSelect: (index: number) => void;
  onWordPress: (key: string, pageY: number) => void;
};

export function ShadowingLyrics({
  lesson,
  currentIndex,
  following,
  selectedWordKey,
  onBrowse,
  onFollow,
  onSelect,
  onWordPress,
}: Props) {
  const list = useRef<FlatList>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const browsing = useRef(false);
  const { height } = useWindowDimensions();
  const viewportHeight = Math.min(
    260,
    Math.max(180, Math.round(height * 0.28)),
  );
  const current = Math.max(
    0,
    Math.min(currentIndex, lesson.segments.length - 1),
  );
  const center = useCallback(() => {
    if (!lesson.segments.length || !following || browsing.current) return;
    list.current?.scrollToIndex({
      index: current,
      animated: false,
      viewPosition: 0.5,
    });
  }, [current, following, lesson.segments.length]);
  useEffect(() => {
    attempts.current = 0;
    if (following) browsing.current = false;
    center();
    return () => {
      if (retry.current) clearTimeout(retry.current);
    };
  }, [center, following]);
  const browse = () => {
    browsing.current = true;
    onBrowse();
  };
  return (
    <View
      testID="shadowing-mobile-lyrics"
      style={[styles.container, { height: viewportHeight }]}
    >
      <FlatList
        ref={list}
        testID="shadowing-lyrics-scroll"
        data={lesson.segments}
        extraData={{ current, selectedWordKey }}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={browse}
        onTouchMove={browse}
        {...(Platform.OS === 'web' ? { onWheel: browse } : {})}
        contentContainerStyle={{ paddingVertical: viewportHeight / 3 }}
        onContentSizeChange={center}
        onScrollToIndexFailed={info => {
          if (!following || attempts.current >= 2) return;
          attempts.current += 1;
          list.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: false,
          });
          if (retry.current) clearTimeout(retry.current);
          retry.current = setTimeout(center, 100);
        }}
        renderItem={({ item, index }) =>
          index === current ? (
            <View style={styles.current} testID="shadowing-lyrics-current">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Phát câu đang chọn"
                onPress={() => onSelect(index)}
                hitSlop={8}
                style={styles.play}
              >
                <PlayCircleIcon size={18} color={colors.primaryText} />
              </Pressable>
              <View style={styles.lyricText}>
                <ShadowingTokenText
                  align="left"
                  text={item.text}
                  tokens={lesson.tokens?.segments[item.id]}
                  words={lesson.words}
                  selectedKey={selectedWordKey}
                  onWordPress={onWordPress}
                  style={styles.currentText}
                />
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Phát câu ${index + 1}`}
              onPress={() => onSelect(index)}
              style={styles.other}
            >
              <Text style={styles.otherText}>{item.text}</Text>
            </Pressable>
          )
        }
      />
      {!following ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Về câu đang phát"
          onPress={onFollow}
          style={styles.follow}
          hitSlop={6}
        >
          <ChevronDownIcon size={18} color={colors.primaryText} />
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { minWidth: 0, overflow: 'hidden' },
  lyricText: { flex: 1, minWidth: 0 },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  currentText: {
    ...typography.body,
    fontSize: 18,
    lineHeight: 28,
    color: colors.dark,
    textAlign: 'left',
  },
  other: {
    paddingVertical: spacing.md,
    paddingLeft: 42,
    paddingRight: spacing.sm,
    minHeight: 44,
  },
  otherText: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'left',
    color: colors.muted,
    opacity: 0.55,
  },
  play: {
    flexShrink: 0,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  follow: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

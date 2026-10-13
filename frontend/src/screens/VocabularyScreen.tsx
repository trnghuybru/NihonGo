import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
// @refresh reset
// Remount during Fast Refresh when the screen's hook layout changes.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { AuthIcon } from '../components/AuthIcon';
import { BrandLogo } from '../components/BrandLogo';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import {
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
  VolumeIcon,
  VolumeXIcon,
  XIcon,
} from '../components/icons';
import { VideoExampleCard } from '../components/VideoExampleCard';
import { VideoExamplePlayer } from '../components/VideoExamplePlayer';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import { useVocabularyAudio } from '../hooks/useVocabularyAudio';
import {
  JLPT_LEVELS,
  JlptLevel,
  VocabularyLessonDetail,
  VocabularyLessonSummary,
  VocabularySearchResult,
  VocabularyWord,
  vocabularyService,
} from '../services/vocabularyService';
import {
  VideoExample,
  VideoExamplesResult,
  videoExamplesService,
} from '../services/videoExamplesService';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';

type Route =
  | { kind: 'catalog' }
  | { kind: 'lookup' }
  | {
      kind: 'words';
      lesson: VocabularyLessonSummary;
      displayNumber: number;
      category: string;
    }
  | { kind: 'search'; query: string; page: number }
  | { kind: 'videos'; query: string; after?: string };
type LessonRoute = Extract<Route, { kind: 'catalog' | 'words' }>;
type LookupRoute = Exclude<Route, LessonRoute>;
// The current imported word dataset is N2; lesson selection must not filter lookup.
const LOOKUP_LEVEL: JlptLevel = 'N2';
type Item =
  | {
      id: string;
      kind: 'lesson';
      lesson: VocabularyLessonSummary;
      displayNumber: number;
      category: string;
    }
  | { id: string; kind: 'word'; word: VocabularyWord }
  | { id: string; kind: 'video'; example: VideoExample };
type Data = {
  items: Item[];
  search?: VocabularySearchResult;
  lesson?: VocabularyLessonDetail;
  videos?: VideoExamplesResult;
};
const keyExtractor = (item: Item) => item.id;
function categoryLabel(title: string) {
  if (title.startsWith('名詞')) return 'Danh từ';
  if (title.startsWith('動詞')) return 'Động từ';
  if (title.startsWith('形容詞')) return 'Tính từ';
  if (title.startsWith('カタカナ')) return 'Từ Katakana';
  if (title.includes('接続詞')) return 'Trạng từ & liên từ';
  if (title.includes('連体詞')) return 'Trạng từ & định từ';
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(title)
    ? 'Từ vựng'
    : title || 'Từ vựng';
}
const relationLabels: Record<string, string> = {
  compound: 'Từ ghép',
  synonym: 'Đồng nghĩa',
  antonym: 'Trái nghĩa',
  related: 'Liên quan',
  collocation: 'Cụm từ',
  idiom: 'Thành ngữ',
};

const WordCard = memo(function WordCardView({
  word,
  hideMeaning,
  playing,
  audioLoading,
  audioError,
  onAudio,
}: {
  word: VocabularyWord;
  hideMeaning: boolean;
  playing: boolean;
  audioLoading: boolean;
  audioError: string;
  onAudio: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [hideMeaning]);
  const showMeaning = !hideMeaning || revealed;
  return (
    <View style={[styles.card, styles.wordCard]}>
      <View style={styles.wordHeading}>
        <View style={styles.wordIdentity}>
          <Text style={styles.word} selectable>
            {word.word}
          </Text>
          <Text style={styles.reading} selectable>
            {word.reading}
          </Text>
        </View>
        <View style={styles.wordActions}>
          <Text style={styles.caption}>#{word.number}</Text>
          {word.has_audio ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${playing ? 'Dừng' : 'Nghe'} phát âm ${
                word.word
              }`}
              accessibilityState={{ busy: audioLoading, selected: playing }}
              onPress={() => onAudio(word.id)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.audioButton,
                pressed && styles.pressed,
              ]}
            >
              {audioLoading ? (
                <ActivityIndicator size="small" color={colors.primaryText} />
              ) : playing ? (
                <VolumeXIcon size={18} color={colors.primaryText} />
              ) : (
                <VolumeIcon size={18} color={colors.primaryText} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
      {audioError ? (
        <Text accessibilityRole="alert" style={styles.caption}>
          {audioError}
        </Text>
      ) : null}
      {showMeaning ? (
        <View style={styles.copy}>
          <Text style={styles.meaning} selectable>
            {word.meaning_vi}
          </Text>
          {word.han_viet ? (
            <Text style={styles.caption}>Hán Việt: {word.han_viet}</Text>
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Hiện nghĩa của ${word.word}`}
          onPress={() => setRevealed(true)}
          hitSlop={6}
          style={styles.reveal}
        >
          <Text style={styles.link}>Nhấn để xem nghĩa</Text>
        </Pressable>
      )}
      {word.examples.length || word.related.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ví dụ và từ liên quan của ${word.word}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(value => !value)}
          hitSlop={6}
          style={styles.detailsButton}
        >
          <Text style={styles.link}>
            {expanded
              ? 'Thu gọn'
              : `Ví dụ & liên quan (${word.examples.length})`}
          </Text>
          <Text style={styles.link}>{expanded ? '−' : '+'}</Text>
        </Pressable>
      ) : null}
      {expanded ? (
        <View style={styles.details}>
          {word.examples.length ? (
            <Text style={styles.sectionTitle}>Ví dụ</Text>
          ) : null}
          {word.examples.map((example, index) => (
            <View key={`example-${index}`} style={styles.example}>
              <Text style={styles.japanese} selectable>
                {example.japanese}
              </Text>
              <Text style={styles.caption} selectable>
                {example.reading}
              </Text>
              {showMeaning && example.meaning_vi ? (
                <Text style={styles.body} selectable>
                  {example.meaning_vi}
                </Text>
              ) : null}
            </View>
          ))}
          {word.related.length ? (
            <Text style={styles.sectionTitle}>Từ & cụm từ liên quan</Text>
          ) : null}
          {word.related.map((related, index) => (
            <View key={`related-${index}`} style={styles.example}>
              <Text style={styles.caption}>
                {relationLabels[related.type] || related.label}
              </Text>
              <Text style={styles.japanese} selectable>
                {related.japanese}
              </Text>
              <Text style={styles.caption} selectable>
                {related.reading}
              </Text>
              {showMeaning && related.meaning_vi ? (
                <Text style={styles.body} selectable>
                  {related.meaning_vi}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const BrowseCard = memo(function BrowseCardView({
  item,
  onOpen,
  width,
}: {
  item: Extract<Item, { kind: 'lesson' }>;
  onOpen: (item: Item) => void;
  width: number;
}) {
  const title = `Bài ${item.displayNumber}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở ${title}`}
      accessibilityHint={`${item.category}, ${item.lesson.word_count} từ vựng`}
      onPress={() => onOpen(item)}
      style={({ pressed }) => [
        styles.card,
        styles.browseCard,
        { width },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.lessonCardHeader}>
        <Text style={styles.lessonTitle}>{title}</Text>
        <AuthIcon name="arrow" color={colors.primaryText} size={14} />
      </View>
      <Text style={styles.caption}>{item.category}</Text>
      <View style={styles.lessonCount}>
        <Text style={styles.lessonCountText}>{item.lesson.word_count} từ</Text>
      </View>
    </Pressable>
  );
});

export function VocabularyScreen({
  query = '',
  onExit,
  area,
  active = true,
  compact = false,
}: {
  query?: string;
  onExit?: () => void;
  area?: 'lessons' | 'lookup';
  active?: boolean;
  compact?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const navigationInset = useBottomNavigationInset();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const lessonColumns =
    windowWidth >= 360 && fontScale <= 1.15
      ? 3
      : windowWidth >= 320 && fontScale <= 1.5
      ? 2
      : 1;
  const lessonCardWidth =
    (Math.min(windowWidth - layout.screenGutter * 2, layout.maxContentWidth) -
      spacing.md * (lessonColumns - 1)) /
    lessonColumns;
  const [level, setLevel] = useState<JlptLevel>('N2');
  const [section, setSection] = useState<'lessons' | 'lookup'>(
    area ?? (query.trim() ? 'lookup' : 'lessons'),
  );
  const [lessonRoute, setLessonRoute] = useState<LessonRoute>({
    kind: 'catalog',
  });
  const [lookupRoute, setLookupRoute] = useState<LookupRoute>(() =>
    query.trim()
      ? { kind: 'videos', query: query.trim().slice(0, 100) }
      : { kind: 'lookup' },
  );
  const route = section === 'lessons' ? lessonRoute : lookupRoute;
  const audio = useVocabularyAudio(
    `${section}:${level}:${JSON.stringify(route)}`,
  );
  const setRoute = useCallback((next: Route) => {
    if (next.kind === 'catalog' || next.kind === 'words') setLessonRoute(next);
    else setLookupRoute(next);
  }, []);
  const [searchText, setSearchText] = useState(query.slice(0, 100));
  const [hideMeaning, setHideMeaning] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<'words' | 'videos'>(
    compact ? 'words' : 'videos',
  );
  const [quickLookupOpen, setQuickLookupOpen] = useState(false);
  const closeQuickLookup = useCallback(() => setQuickLookupOpen(false), []);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Item>>(null);
  const openVideo = useCallback((example: VideoExample) => {
    setSelectedVideoId(example.id);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  const load = useCallback(async (): Promise<Data> => {
    if (route.kind === 'lookup') return { items: [] };
    if (route.kind === 'catalog') {
      const result = await vocabularyService.textbooks(level);
      const books = await Promise.all(
        result.items.map(book => vocabularyService.textbook(book.id)),
      );
      let displayNumber = 0;
      const items: Item[] = books.flatMap(book =>
        book.units.flatMap(unit =>
          unit.lessons.map(lesson => ({
            id: lesson.id,
            kind: 'lesson' as const,
            lesson,
            displayNumber: ++displayNumber,
            category: categoryLabel(unit.title),
          })),
        ),
      );
      return { items };
    }
    if (route.kind === 'words') {
      const lesson = await vocabularyService.lesson(route.lesson.id);
      return {
        lesson,
        items: lesson.words.map(word => ({ id: word.id, kind: 'word', word })),
      };
    }
    if (route.kind === 'videos') {
      const videos = await videoExamplesService.search(
        route.query,
        route.after,
      );
      return {
        videos,
        items: videos.items.map(example => ({
          id: example.id,
          kind: 'video',
          example,
        })),
      };
    }
    const search = await vocabularyService.search(
      LOOKUP_LEVEL,
      route.query,
      route.page,
    );
    return {
      search,
      items: search.items.map(word => ({ id: word.id, kind: 'word', word })),
    };
  }, [level, route]);
  const { state, reload } = useRemoteResource(load);
  const stopAudio = audio.stop;
  useEffect(() => {
    if (!active || quickLookupOpen) stopAudio();
  }, [active, quickLookupOpen, stopAudio]);
  const back = useCallback(() => {
    Keyboard.dismiss();
    setSelectedVideoId(null);
    if (section === 'lessons') setLessonRoute({ kind: 'catalog' });
    else {
      setLookupRoute({ kind: 'lookup' });
      setSearchText('');
    }
  }, [section]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!active) return false;
      if (quickLookupOpen) {
        closeQuickLookup();
        return true;
      }
      if (route.kind === 'catalog' || route.kind === 'lookup') {
        if (!onExit) return false;
        onExit();
        return true;
      }
      back();
      return true;
    });
    return () => listener.remove();
  }, [active, quickLookupOpen, closeQuickLookup, back, route.kind, onExit]);
  const open = useCallback(
    (item: Item) => {
      setHideMeaning(false);
      if (item.kind === 'lesson')
        setRoute({
          kind: 'words',
          lesson: item.lesson,
          displayNumber: item.displayNumber,
          category: item.category,
        });
    },
    [setRoute],
  );
  const examples =
    route.kind === 'videos' && state.status === 'ready'
      ? state.data.videos?.items || []
      : [];
  const selectedIndex = Math.max(
    0,
    examples.findIndex(example => example.id === selectedVideoId),
  );
  const selectedVideo = examples[selectedIndex];
  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.kind === 'word' ? (
        <WordCard
          word={item.word}
          hideMeaning={route.kind === 'words' && hideMeaning}
          playing={audio.wordId === item.word.id}
          audioLoading={audio.wordId === item.word.id && audio.loading}
          audioError={
            audio.error?.wordId === item.word.id ? audio.error.message : ''
          }
          onAudio={audio.toggle}
        />
      ) : item.kind === 'video' ? (
        <VideoExampleCard
          example={item.example}
          query={state.status === 'ready' ? state.data.videos?.query || '' : ''}
          onOpen={openVideo}
          selected={item.example.id === selectedVideo?.id}
        />
      ) : (
        <BrowseCard item={item} onOpen={open} width={lessonCardWidth} />
      ),
    [
      audio.wordId,
      audio.loading,
      audio.error,
      audio.toggle,
      hideMeaning,
      lessonCardWidth,
      open,
      openVideo,
      route.kind,
      selectedVideo?.id,
      state,
    ],
  );
  const screenKey =
    route.kind === 'words'
      ? route.lesson.id
      : route.kind === 'videos'
      ? `videos-${route.query}-${route.after || ''}`
      : route.kind === 'search'
      ? `search-${route.query}-${route.page}`
      : route.kind === 'lookup'
      ? 'lookup'
      : `${level}-${route.kind}`;
  const contentStyle = useMemo(
    () => [
      styles.content,
      route.kind === 'catalog' ? styles.gridContent : null,
      {
        paddingTop:
          Platform.OS === 'android' && !compact
            ? insets.top + spacing.lg
            : spacing.lg,
      },
    ],
    [insets.top, route.kind, compact],
  );
  const title =
    route.kind === 'words'
      ? `Bài ${route.displayNumber}`
      : route.kind === 'videos'
      ? 'Ví dụ trong video'
      : route.kind === 'search'
      ? 'Kết quả tìm kiếm'
      : route.kind === 'lookup'
      ? 'Tra cứu từ vựng'
      : 'Bài học từ vựng';
  const subtitle =
    route.kind === 'catalog'
      ? 'Chọn trình độ và bắt đầu học từng bài.'
      : route.kind === 'words'
      ? `${level} · ${route.category} · ${route.lesson.word_count} từ vựng`
      : route.kind === 'videos'
      ? `Nghe cách dùng “${route.query}” trong câu thực tế.`
      : route.kind === 'search'
      ? `“${route.query}”`
      : route.kind === 'lookup'
      ? 'Tìm nghĩa hoặc nghe cách dùng trong video.'
      : '';
  const wordMode = route.kind === 'words';
  const submitSearch = () => {
    if (!searchText.trim()) return;
    Keyboard.dismiss();
    setSelectedVideoId(null);
    setRoute(
      searchMode === 'videos'
        ? { kind: 'videos', query: searchText.trim() }
        : { kind: 'search', query: searchText.trim(), page: 1 },
    );
  };
  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Quay lại"
      onPress={back}
      hitSlop={6}
      style={styles.back}
    >
      <ChevronLeftIcon size={18} color={colors.dark} />
    </Pressable>
  );
  const header = (
    <View style={styles.header}>
      {route.kind !== 'videos' && !compact ? (
        <View style={styles.topBar}>
          <BrandLogo />
          <Text style={styles.language}>日本語</Text>
        </View>
      ) : null}
      {route.kind === 'videos' ? (
        <View style={styles.titleRow}>
          {backButton}
          <Text accessibilityRole="header" style={styles.videoTitle}>
            {title}
          </Text>
        </View>
      ) : null}
      {route.kind !== 'videos' && !compact ? (
        <View style={styles.introduction}>
          <View style={styles.titleRow}>
            {route.kind !== 'catalog' && route.kind !== 'lookup'
              ? backButton
              : null}
            <Text
              accessibilityRole="header"
              style={[styles.title, styles.titleCopy]}
            >
              {title}
            </Text>
            {wordMode ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  hideMeaning ? 'Hiện nghĩa' : 'Ẩn nghĩa để tự ôn'
                }
                accessibilityState={{ selected: hideMeaning }}
                onPress={() => setHideMeaning(value => !value)}
                style={styles.meaningToggle}
              >
                {hideMeaning ? (
                  <EyeIcon size={18} color={colors.primaryText} />
                ) : (
                  <EyeOffIcon size={18} color={colors.primaryText} />
                )}
              </Pressable>
            ) : null}
            {section === 'lessons' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tra cứu nhanh"
                accessibilityHint="Tra từ mà vẫn giữ bài học đang mở"
                onPress={() => setQuickLookupOpen(true)}
                style={styles.back}
                hitSlop={6}
              >
                <HomeFeatureIcon
                  name="search"
                  size={20}
                  color={colors.primaryText}
                />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.body}>{subtitle}</Text>
        </View>
      ) : null}
      {!area && route.kind !== 'words' ? (
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Khu vực từ vựng"
          style={styles.sections}
        >
          {(['lessons', 'lookup'] as const).map(option => (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityLabel={option === 'lessons' ? 'Bài học' : 'Tra cứu'}
              accessibilityState={{ selected: section === option }}
              onPress={() => {
                Keyboard.dismiss();
                setSearchFocused(false);
                setSection(option);
              }}
              style={({ pressed }) => [
                styles.section,
                section === option ? styles.selectedLevel : null,
                pressed
                  ? section === option
                    ? styles.selectedLevelPressed
                    : styles.pressed
                  : null,
              ]}
            >
              <HomeFeatureIcon
                name={option === 'lessons' ? 'vocabulary' : 'search'}
                size={20}
                color={section === option ? colors.onPrimary : colors.body}
              />
              <Text
                style={[
                  styles.levelText,
                  section === option ? styles.selectedLevelText : null,
                ]}
              >
                {option === 'lessons' ? 'Bài học' : 'Tra cứu'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {route.kind === 'catalog' ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Trình độ JLPT"
          style={styles.levels}
        >
          {JLPT_LEVELS.map(option => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={`JLPT ${option}`}
              accessibilityState={{ checked: option === level }}
              onPress={() => {
                setLevel(option);
                setRoute({ kind: 'catalog' });
                setHideMeaning(false);
              }}
              style={({ pressed }) => [
                styles.level,
                option === level ? styles.selectedLevel : null,
                pressed
                  ? option === level
                    ? styles.selectedLevelPressed
                    : styles.pressed
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.levelText,
                  option === level ? styles.selectedLevelText : null,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {section === 'lookup' ? (
        <View style={styles.header}>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Loại tìm kiếm"
            style={styles.levels}
          >
            {(['words', 'videos'] as const).map(mode => (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityLabel={
                  mode === 'videos'
                    ? 'Tìm ví dụ trong video'
                    : 'Tra cứu thông thường'
                }
                accessibilityState={{ checked: searchMode === mode }}
                style={({ pressed }) => [
                  styles.level,
                  searchMode === mode ? styles.selectedLevel : null,
                  pressed
                    ? searchMode === mode
                      ? styles.selectedLevelPressed
                      : styles.pressed
                    : null,
                ]}
                onPress={() => {
                  setSearchMode(mode);
                  setSelectedVideoId(null);
                  if (route.kind === 'search' || route.kind === 'videos')
                    setRoute(
                      mode === 'videos'
                        ? { kind: 'videos', query: route.query }
                        : { kind: 'search', query: route.query, page: 1 },
                    );
                }}
              >
                <Text
                  style={[
                    styles.levelText,
                    searchMode === mode ? styles.selectedLevelText : null,
                  ]}
                >
                  {mode === 'videos' ? 'Video' : 'Từ vựng'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View
            style={[styles.search, searchFocused ? styles.searchFocused : null]}
          >
            <HomeFeatureIcon name="search" size={20} color={colors.muted} />
            <TextInput
              autoFocus={compact && route.kind === 'lookup'}
              accessibilityLabel={
                searchMode === 'videos'
                  ? 'Tìm từ hoặc cụm tiếng Nhật trong video'
                  : 'Tìm từ Nhật, kana hoặc nghĩa tiếng Việt'
              }
              placeholder={
                searchMode === 'videos'
                  ? 'Nhập từ hoặc cụm tiếng Nhật'
                  : 'Từ Nhật, kana hoặc nghĩa tiếng Việt'
              }
              placeholderTextColor={colors.placeholder}
              value={searchText}
              maxLength={100}
              onChangeText={setSearchText}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={submitSearch}
              style={styles.searchInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tìm kiếm"
              disabled={!searchText.trim()}
              accessibilityState={{ disabled: !searchText.trim() }}
              onPress={submitSearch}
              style={styles.searchButton}
            >
              <AuthIcon
                name="arrow"
                color={
                  searchText.trim() ? colors.primaryText : colors.disabledText
                }
              />
            </Pressable>
          </View>
          {searchMode === 'videos' && route.kind === 'lookup' ? (
            <Text style={styles.caption}>
              Tìm nguyên văn trong phụ đề tiếng Nhật.
            </Text>
          ) : null}
          {searchMode === 'words' ? (
            <Text style={styles.caption}>
              Dữ liệu tra cứu hiện có: từ vựng N2.
            </Text>
          ) : null}
        </View>
      ) : null}
      {active && selectedVideo && route.kind === 'videos' ? (
        <VideoExamplePlayer
          key={`${screenKey}-${selectedVideo.id}`}
          example={selectedVideo}
          query={state.status === 'ready' ? state.data.videos?.query || '' : ''}
          position={selectedIndex + 1}
          count={examples.length}
          onPrevious={
            selectedIndex > 0
              ? () => setSelectedVideoId(examples[selectedIndex - 1].id)
              : undefined
          }
          onNext={
            selectedIndex < examples.length - 1
              ? () => setSelectedVideoId(examples[selectedIndex + 1].id)
              : undefined
          }
        />
      ) : null}
      {state.status === 'ready' && state.data.videos ? (
        <Text style={styles.caption}>
          {state.data.videos.items.length} đoạn trên trang này
          {state.data.videos.has_more ? ' · còn ví dụ khác' : ''}
        </Text>
      ) : null}
      {state.status === 'ready' && state.data.search ? (
        <Text style={styles.caption}>
          {state.data.search.pagination.total} từ phù hợp
        </Text>
      ) : null}
      {state.status === 'ready' &&
      route.kind === 'catalog' &&
      state.data.items.length > 0 ? (
        <View style={styles.listHeading}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Bài học {level}
          </Text>
          <Text style={styles.caption}>{state.data.items.length} bài</Text>
        </View>
      ) : null}
      {state.status === 'loading' ? (
        <View accessibilityLabel="Đang tải từ vựng" style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>Đang tải…</Text>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View>
          <AuthNotice error message={state.message} />
          <AuthButton label="Thử lại" variant="outline" onPress={reload} />
        </View>
      ) : null}
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        <Svg
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          viewBox="0 0 400 900"
        >
          <Defs>
            <RadialGradient id="vocabularyRose">
              <Stop offset="0" stopColor="#F9CCD6" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#F9CCD6" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="vocabularyPeach">
              <Stop offset="0" stopColor="#FFDDB7" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#FFDDB7" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx="30"
            cy="410"
            rx="300"
            ry="460"
            fill="url(#vocabularyRose)"
          />
          <Ellipse
            cx="390"
            cy="170"
            rx="210"
            ry="280"
            fill="url(#vocabularyPeach)"
          />
        </Svg>
      </View>
      <FlatList
        ref={listRef}
        key={`${screenKey}-${route.kind === 'catalog' ? lessonColumns : 1}`}
        numColumns={route.kind === 'catalog' ? lessonColumns : 1}
        columnWrapperStyle={
          route.kind === 'catalog' && lessonColumns > 1
            ? styles.lessonGrid
            : undefined
        }
        data={state.status === 'ready' ? state.data.items : []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          contentStyle,
          { paddingBottom: navigationInset + spacing.section },
        ]}
        scrollIndicatorInsets={{ bottom: navigationInset }}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          state.status === 'ready' ? (
            <View style={styles.empty}>
              <HomeFeatureIcon
                name={route.kind === 'lookup' ? 'search' : 'vocabulary'}
                size={40}
                color={colors.muted}
              />
              <Text style={styles.sectionTitle}>
                {route.kind === 'videos'
                  ? 'Chưa tìm thấy ví dụ trong video'
                  : route.kind === 'lookup'
                  ? 'Nhập từ bạn muốn tra cứu'
                  : route.kind === 'search'
                  ? 'Không tìm thấy từ phù hợp'
                  : `${level} chưa có dữ liệu`}
              </Text>
              <Text style={styles.body}>
                {route.kind === 'videos'
                  ? 'Thử từ hoặc cụm tiếng Nhật khác. Hiện kho video còn ít ví dụ.'
                  : route.kind === 'lookup'
                  ? 'Chọn Video để nghe cách dùng hoặc Từ vựng để xem nghĩa.'
                  : route.kind === 'search'
                  ? 'Thử từ khác bằng tiếng Nhật, kana hoặc tiếng Việt.'
                  : 'Các bài học đang được chuẩn bị. Bạn có thể chọn N2 để bắt đầu học.'}
              </Text>
              {route.kind === 'catalog' && level !== 'N2' ? (
                <AuthButton
                  label="Khám phá N2"
                  variant="outline"
                  onPress={() => {
                    setLevel('N2');
                    setRoute({ kind: 'catalog' });
                  }}
                />
              ) : null}
            </View>
          ) : undefined
        }
        ListFooterComponent={
          state.status === 'ready' &&
          state.data.search &&
          route.kind === 'search' ? (
            <View style={styles.pagination}>
              <AuthButton
                label="Trang trước"
                variant="text"
                disabled={route.page <= 1}
                onPress={() => setRoute({ ...route, page: route.page - 1 })}
              />
              <Text style={styles.caption}>
                {route.page}/
                {Math.max(1, state.data.search.pagination.total_pages)}
              </Text>
              <AuthButton
                label="Trang sau"
                variant="text"
                disabled={
                  route.page >= state.data.search.pagination.total_pages
                }
                onPress={() => setRoute({ ...route, page: route.page + 1 })}
              />
            </View>
          ) : state.status === 'ready' &&
            state.data.videos &&
            route.kind === 'videos' ? (
            <View style={styles.pagination}>
              <AuthButton
                label="Về đầu kết quả"
                variant="text"
                disabled={!route.after}
                onPress={() => {
                  setSelectedVideoId(null);
                  setRoute({ kind: 'videos', query: route.query });
                }}
              />
              <AuthButton
                label="Ví dụ khác"
                variant="text"
                disabled={!state.data.videos.has_more}
                onPress={() => {
                  setSelectedVideoId(null);
                  setRoute({
                    ...route,
                    after: state.data.videos?.next_cursor || undefined,
                  });
                }}
              />
            </View>
          ) : undefined
        }
      />
      {quickLookupOpen ? (
        <Modal
          transparent
          animationType="slide"
          visible
          onRequestClose={closeQuickLookup}
          statusBarTranslucent
        >
          <View style={styles.drawerOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Đóng tra cứu nhanh"
              onPress={closeQuickLookup}
            />
            <View
              accessibilityViewIsModal
              style={[styles.drawer, { paddingBottom: insets.bottom }]}
            >
              <View style={styles.drawerHeader}>
                <Text accessibilityRole="header" style={styles.title}>
                  Tra cứu nhanh
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Trở lại bài học"
                  onPress={closeQuickLookup}
                  style={styles.back}
                  hitSlop={6}
                >
                  <XIcon size={18} color={colors.body} />
                </Pressable>
              </View>
              <VocabularyScreen
                area="lookup"
                compact
                onExit={closeQuickLookup}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  drawerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(37,37,38,0.25)',
  },
  drawer: {
    height: '85%',
    maxHeight: '90%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    overflow: 'hidden',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.section,
    gap: spacing.xl,
    width: '100%',
    maxWidth: layout.maxContentWidth + layout.screenGutter * 2,
    alignSelf: 'center',
    flexGrow: 1,
  },
  header: { gap: spacing.lg, paddingBottom: spacing.xs },
  gridContent: { gap: spacing.md },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  language: { ...typography.caption, color: colors.muted, flexShrink: 1 },
  introduction: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleCopy: { flex: 1 },
  videoTitle: {
    ...typography.title,
    color: colors.dark,
    flex: 1,
    textAlign: 'right',
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  title: { ...typography.title, color: colors.dark },
  body: { ...typography.body, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  sectionTitle: { ...typography.heading, color: colors.dark },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levels: { flexDirection: 'row', gap: spacing.sm },
  sections: { flexDirection: 'row', gap: spacing.sm },
  section: {
    flex: 1,
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  level: {
    flex: 1,
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  selectedLevel: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectedLevelPressed: { backgroundColor: colors.primaryPressed },
  levelText: { ...typography.button, color: colors.body },
  selectedLevelText: { color: colors.onPrimary },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.divider,
    boxShadow: shadowMd,
  },
  lessonGrid: { gap: spacing.md, alignItems: 'stretch' },
  browseCard: {
    minHeight: 104,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.small,
  },
  lessonCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  lessonTitle: { ...typography.button, color: colors.dark, flexShrink: 1 },
  lessonCount: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.badgeBg,
  },
  lessonCountText: { ...typography.caption, color: colors.badgeText },
  pressed: { backgroundColor: colors.surfaceTint },
  wordCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.small,
  },
  wordIdentity: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  wordHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  word: {
    ...typography.title,
    color: colors.dark,
    flexShrink: 1,
    maxWidth: '100%',
  },
  wordActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  audioButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
  },
  reading: {
    ...typography.label,
    color: colors.body,
    flexShrink: 1,
    maxWidth: '100%',
  },
  meaning: { ...typography.heading, color: colors.dark },
  copy: { gap: spacing.xs },
  reveal: {
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  link: { ...typography.link, color: colors.primaryText },
  detailsButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: colors.divider,
    marginTop: spacing.xs,
  },
  details: { gap: spacing.md },
  example: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceTint,
    padding: spacing.md,
    borderRadius: radius.small,
  },
  japanese: { ...typography.label, color: colors.dark },
  meaningToggle: {
    width: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    ...typography.input,
    color: colors.dark,
    flex: 1,
    minWidth: 0,
    minHeight: layout.inputHeight,
  },
  searchFocused: { borderColor: colors.focus },
  searchButton: {
    width: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.card,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  pagination: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});

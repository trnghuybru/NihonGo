import { useDefaultJlptLevel, toJlptLevel } from '../hooks/useLearningLevel';
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { DeckPagination } from '../components/DeckPagination';
import { ReadingScrollRegion } from '../components/ReadingScrollRegion';
import { ReadingWorkspace } from '../components/ReadingWorkspace';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { ShadowingWordPopup } from '../components/ShadowingWordLookup';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import { useWebLayout } from '../hooks/useWebLayout';
import {
  decodeRouteParam,
  navigationLink,
  useWebNavigation,
} from '../navigation/webNavigation';
import { readingPreferences } from '../services/readingPreferences';
import { ReadingFilters, readingService } from '../services/readingService';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

const levels = ['', 'N5', 'N4', 'N3', 'N2', 'N1'];
export function ReadingScreen({
  accountId = 'local',
  initialLevel,
  onExit,
}: {
  accountId?: string;
  initialLevel?: string;
  onExit?: () => void;
}) {
  const profileLevel = useDefaultJlptLevel();
  const defaultLevel = initialLevel ? toJlptLevel(initialLevel) : profileLevel;
  const web = useWebNavigation();
  const nav = useRef(web);
  nav.current = web;
  const { desktop } = useWebLayout();
  const insets = useSafeAreaInsets();
  const bottom = useBottomNavigationInset();
  const [localFilters, setLocalFilters] = useState<ReadingFilters>({
    level: defaultLevel,
    type: '',
    q: '',
    page: 1,
  });
  const params = new URLSearchParams(web?.search ?? '');
  const urlLevel = params.get('level');
  const filters: ReadingFilters = web
    ? {
        level:
          urlLevel !== null && levels.includes(urlLevel)
            ? urlLevel
            : defaultLevel,
        type: params.get('type') ?? '',
        q: params.get('q') ?? '',
        page: Math.max(1, Math.min(10000, Number(params.get('page')) || 1)),
      }
    : localFilters;
  const { level, type, q, page } = filters;
  const urlId = web && /^\/practice\/reading\/([^/]+)$/.exec(web.pathname)?.[1];
  const [localId, setLocalId] = useState<string | null>(null);
  const id = web ? (urlId ? decodeRouteParam(urlId) : null) : localId;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = Number(Boolean(level)) + Number(Boolean(type));
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const catalogLoad = useCallback(
    () =>
      id
        ? Promise.resolve(null)
        : readingService.list({ level, type, q, page }),
    [id, level, type, q, page],
  );
  const detailLoad = useCallback(
    () => (id ? readingService.passage(id) : Promise.resolve(null)),
    [id],
  );
  const catalog = useRemoteResource(catalogLoad),
    detail = useRemoteResource(detailLoad);
  const [showFurigana, setShowFurigana] = useState(true);
  const preferenceTouched = useRef(false);
  useEffect(() => {
    let active = true;
    preferenceTouched.current = false;
    setShowFurigana(true);
    readingPreferences
      .load(accountId)
      .then(show => {
        if (active && !preferenceTouched.current) setShowFurigana(show);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accountId]);
  const [selection, setSelection] = useState<{ key: string; y: number } | null>(
    null,
  );
  const closePopup = useCallback(() => setSelection(null), []);
  useEffect(() => setSelection(null), [id]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !selection) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopup();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selection, closePopup]);
  const filterUrl = (next: ReadingFilters) =>
    '/practice/reading?' +
    new URLSearchParams({
      level: next.level,
      type: next.type,
      q: next.q,
      page: String(next.page),
    });
  const updateFilters = (patch: Partial<ReadingFilters>) => {
    const next = { ...filters, ...patch };
    if (web) web.navigate(filterUrl(next));
    else setLocalFilters(next);
  };
  const back = useCallback(() => {
    const current = nav.current;
    if (id) {
      if (current) current.back('/practice/reading' + current.search);
      else setLocalId(null);
    } else if (current) current.navigate('/practice');
    else onExit?.();
  }, [id, onExit]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selection) {
        closePopup();
        return true;
      }
      if (id) {
        back();
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [id, selection, closePopup, back]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [id, level, type, q, page]);
  const passage =
    detail.state.status === 'ready' && detail.state.data?.id === id
      ? detail.state.data
      : null;
  const splitReader = Platform.OS === 'web' && desktop && Boolean(passage);
  const list = catalog.state.status === 'ready' ? catalog.state.data : null;
  const state = id ? detail.state : catalog.state;
  const loading =
    state.status === 'loading' || (id && state.status === 'ready' && !passage);
  return (
    <View style={styles.screen}>
      <View style={[styles.toolbar, desktop && styles.desktopToolbar]}>
        <ScreenBackHeader
          title="Luyện đọc"
          backLabel={id ? 'Thư viện bài đọc' : 'Luyện tập'}
          onBack={back}
        />
        {id ? (
          <View style={styles.toggle}>
            <Text style={styles.label}>Furigana</Text>
            <Switch
              accessibilityLabel="Furigana"
              value={showFurigana}
              thumbColor={colors.surface}
              {...(Platform.OS === 'web'
                ? { activeThumbColor: colors.surface }
                : {})}
              trackColor={{ false: colors.track, true: colors.primary }}
              onValueChange={show => {
                preferenceTouched.current = true;
                setShowFurigana(show);
                readingPreferences.save(accountId, show).catch(() => undefined);
              }}
            />
          </View>
        ) : null}
      </View>
      <ReadingScrollRegion
        testID="reading-scroll-viewport"
        scrollRef={scroll}
        style={styles.viewport}
        scrollable={!splitReader}
        contentContainerStyle={[
          styles.content,
          id && !splitReader && styles.readerContent,
          { paddingBottom: bottom + insets.bottom + spacing.xxl },
          splitReader && styles.splitContent,
        ]}
      >
        {!id ? (
          <>
            <View style={styles.libraryHeader}>
              <Text accessibilityRole="header" style={styles.title}>
                Thư viện bài đọc
              </Text>
            </View>
            <View style={styles.filters}>
              <View style={styles.searchRow}>
                <TextInput
                  accessibilityLabel="Tìm bài đọc"
                  placeholder="Tìm tiêu đề hoặc nội dung bài đọc"
                  placeholderTextColor={colors.placeholder}
                  value={draft}
                  maxLength={100}
                  onChangeText={setDraft}
                  onSubmitEditing={() =>
                    updateFilters({ q: draft.trim(), page: 1 })
                  }
                  returnKeyType="search"
                  style={styles.input}
                />
                <AuthButton
                  label="Tìm"
                  variant="outline"
                  onPress={() => updateFilters({ q: draft.trim(), page: 1 })}
                />
              </View>
              <View style={styles.filterBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Bộ lọc bài đọc"
                  accessibilityState={{ expanded: filtersOpen }}
                  onPress={() => setFiltersOpen(open => !open)}
                  style={styles.filterButton}
                >
                  <Text style={styles.label}>
                    Bộ lọc{activeFilterCount ? ` (${activeFilterCount})` : ''}
                    {filtersOpen ? ' −' : ' +'}
                  </Text>
                </Pressable>
                {level ? <Text style={styles.badge}>JLPT {level}</Text> : null}
                {type && list ? (
                  <Text style={styles.caption}>
                    {list.types.find(item => item.id === type)?.label}
                  </Text>
                ) : null}
                {activeFilterCount || q ? (
                  <AuthButton
                    label="Xóa bộ lọc"
                    variant="text"
                    onPress={() =>
                      updateFilters({ level: '', type: '', q: '', page: 1 })
                    }
                  />
                ) : null}
              </View>
              {filtersOpen ? (
                <View style={styles.filterPanel}>
                  <Text style={styles.label}>Trình độ JLPT</Text>
                  <View style={styles.chips} accessibilityLabel="Trình độ JLPT">
                    {levels.map(value => (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityLabel={value || 'Tất cả trình độ'}
                        aria-selected={level === value}
                        onPress={() => updateFilters({ level: value, page: 1 })}
                        style={[
                          styles.chip,
                          level === value && styles.chipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.label,
                            level === value && styles.selectedText,
                          ]}
                        >
                          {value || 'Tất cả'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.label}>Dạng bài</Text>
                  {list ? (
                    <View
                      style={styles.chips}
                      accessibilityLabel="Dạng bài đọc"
                    >
                      {[
                        { id: '', label: 'Tất cả dạng bài' },
                        ...list.types,
                      ].map(item => (
                        <Pressable
                          key={item.id}
                          accessibilityRole="button"
                          aria-selected={type === item.id}
                          onPress={() =>
                            updateFilters({ type: item.id, page: 1 })
                          }
                          style={[
                            styles.typeChip,
                            type === item.id && styles.chipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.caption,
                              type === item.id && styles.selectedText,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
        {loading ? (
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel="Đang tải bài đọc"
          />
        ) : null}
        {state.status === 'error' ? (
          <View style={styles.error}>
            <AuthNotice error message={state.message} />
            <AuthButton
              label="Thử lại"
              onPress={id ? detail.reload : catalog.reload}
            />
          </View>
        ) : null}
        {!id && list ? (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.heading}>
                {q || activeFilterCount ? 'Kết quả tìm kiếm' : 'Tất cả bài đọc'}
              </Text>
              <Text style={styles.caption}>
                {list.pagination.total} bài đọc
              </Text>
            </View>
            {list.items.length ? (
              <View style={styles.grid}>
                {list.items.map(item => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Mở ${item.title}`}
                    {...navigationLink(
                      web,
                      '/practice/reading/' +
                        item.id +
                        (web?.search ||
                          '?' +
                            new URLSearchParams({
                              level,
                              type,
                              q,
                              page: String(page),
                            })),
                      () => {
                        if (web)
                          web.navigate(
                            '/practice/reading/' +
                              item.id +
                              '?' +
                              new URLSearchParams({
                                level,
                                type,
                                q,
                                page: String(page),
                              }),
                          );
                        else setLocalId(item.id);
                      },
                    )}
                    style={({ pressed }) => [
                      styles.card,
                      desktop && styles.desktopCard,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.meta}>
                      {item.level ? (
                        <Text style={styles.badge}>
                          {/^N[1-5]$/.test(item.level)
                            ? `JLPT ${item.level}`
                            : item.level}
                        </Text>
                      ) : null}
                      <Text style={styles.caption}>{item.kind_label}</Text>
                    </View>
                    <Text style={styles.heading}>{item.title}</Text>
                    <Text numberOfLines={3} style={styles.excerpt}>
                      {item.excerpt}
                    </Text>
                    <Text style={styles.cta}>Đọc bài →</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.heading}>Không có bài đọc phù hợp</Text>
                <AuthButton
                  label="Xóa bộ lọc"
                  variant="text"
                  onPress={() =>
                    updateFilters({ level: '', type: '', q: '', page: 1 })
                  }
                />
              </View>
            )}
            {list.pagination.total_pages > 1 ? (
              <DeckPagination
                itemLabel="bài đọc"
                page={page}
                totalPages={list.pagination.total_pages}
                onChange={next => updateFilters({ page: next })}
              />
            ) : null}
          </>
        ) : null}
        {id && passage ? (
          <ReadingWorkspace
            key={`${accountId}:${passage.id}:${passage.quiz.version}`}
            passage={passage}
            accountId={accountId}
            showFurigana={showFurigana}
            split={splitReader}
            selectedKey={selection?.key}
            onWordPress={(key, y) => setSelection({ key, y })}
            onScrollTo={y =>
              scroll.current?.scrollTo({ y: y + spacing.lg, animated: true })
            }
          />
        ) : null}
      </ReadingScrollRegion>
      <ShadowingWordPopup
        word={
          selection && passage ? passage.words[selection.key] ?? null : null
        }
        anchorY={selection?.y}
        onClose={closePopup}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  toolbar: {
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  desktopToolbar: { justifyContent: 'flex-end' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  viewport: { flex: 1, minHeight: 0 },
  readerContent: { maxWidth: 800 },
  splitContent: { flex: 1, minHeight: 0, paddingBottom: 0 },
  libraryHeader: { gap: spacing.sm },
  filters: { gap: spacing.md },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  filterPanel: {
    padding: 20,
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  typeChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.badgeBg },
  selectedText: { color: colors.focus },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    ...typography.input,
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    color: colors.dark,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  card: {
    width: '100%',
    padding: 20,
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadowSm,
  },
  desktopCard: { width: '48%', flexGrow: 1, maxWidth: '50%' },
  pressed: { opacity: 0.8 },
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
  heading: { ...typography.heading, color: colors.dark },
  label: { ...typography.label, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  excerpt: { ...typography.body, color: colors.body, lineHeight: 24 },
  cta: { ...typography.button, color: colors.primaryText },
  error: { gap: spacing.md },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
});

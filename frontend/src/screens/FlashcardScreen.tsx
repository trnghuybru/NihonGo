import { useWebNavigation } from '../navigation/webNavigation';
import { DeckPagination } from '../components/DeckPagination';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { ChevronRightIcon, PencilIcon } from '../components/icons';
import { WordPronunciation } from '../components/WordPronunciation';
import {
  FlashcardFlip,
  FlashcardFlipHandle,
} from '../components/FlashcardFlip';
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { FlashcardSummaryChart } from '../components/FlashcardSummaryChart';
import { FlashcardBulkImport } from '../components/FlashcardBulkImport';
import { dailyFlashcardService } from '../services/dailyFlashcardService';
import { flashcardSrsService } from '../services/flashcardSrsService';
import { FlashcardSchedulePanel } from '../components/FlashcardSchedulePanel';
import { flashcardDueLabel } from '../utils/flashcardDue';
import { useFlashcardStudy } from '../components/FlashcardStudyProvider';
import { useWebLayout } from '../hooks/useWebLayout';
import { FavoriteWordButton } from '../components/FavoriteWordButton';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import {
  CardDraft,
  DeckCatalog,
  CustomDeck,
  DeckKind,
  DeckRef,
  flashcardService,
  FlashcardSession,
} from '../services/flashcardService';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

const grades = ['Chưa nhớ', 'Mơ hồ', 'Nhớ', 'Rất nhớ'];
const kinds: { id: DeckKind; title: string }[] = [
  { id: 'lesson', title: 'Có sẵn' },
  { id: 'custom', title: 'Của tôi' },
  { id: 'favorites', title: 'Yêu thích' },
];

export function FlashcardScreen({
  onExit,
  active = true,
  initialSession,
  initialEditor,
  startDueReview = false,
  catalogBackLabel = 'Quay lại bài học',
}: {
  onExit: () => void;
  active?: boolean;
  initialSession?: FlashcardSession;
  initialEditor?: CustomDeck | 'new';
  startDueReview?: boolean;
  catalogBackLabel?: string;
}) {
  const webContext = useWebNavigation();
  const web = webContext?.pathname.startsWith('/flashcards')
    ? webContext
    : null;
  const catalogParams = new URLSearchParams(web?.search ?? '');
  const insets = useSafeAreaInsets();
  const study = useFlashcardStudy();
  const { desktop } = useWebLayout();
  const [catalogWidth, setCatalogWidth] = useState(0);
  const catalogColumns = catalogWidth >= 720 ? 3 : 2;
  const deckCardWidth =
    catalogWidth > 0
      ? Math.floor(
          (catalogWidth - spacing.lg * (catalogColumns - 1)) / catalogColumns,
        )
      : undefined;
  const navigationInset = useBottomNavigationInset();
  const [view, setView] = useState<'catalog' | 'session' | 'editor'>(
    initialEditor ? 'editor' : initialSession ? 'session' : 'catalog',
  );
  const [kind, setKind] = useState<DeckKind>(() =>
    ['lesson', 'custom', 'favorites'].includes(catalogParams.get('kind') ?? '')
      ? (catalogParams.get('kind') as DeckKind)
      : 'lesson',
  );
  const [level, setLevel] = useState(() =>
    /^N[1-5]$/.test(catalogParams.get('level') ?? '')
      ? catalogParams.get('level')!
      : 'N5',
  );
  const [page, setPage] = useState(() =>
    Math.max(1, Math.min(10000, Number(catalogParams.get('page')) || 1)),
  );
  const catalogScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [resumeSession, setResumeSession] =
    useState<DeckCatalog['active_session']>(null);
  const [session, setSession] = useState<FlashcardSession | null>(
    initialSession ?? null,
  );
  useEffect(() => {
    if (!web || (web.pathname === '/flashcards/review' && view === 'catalog'))
      return;
    if (view === 'catalog' && web.pathname === '/flashcards') return;
    const target =
      view === 'session' && session
        ? '/flashcards/sessions/' + encodeURIComponent(session.id)
        : view === 'catalog'
        ? typeof web.state?.catalogUrl === 'string' &&
          /^\/flashcards(?:\?|$)/.test(web.state.catalogUrl)
          ? web.state.catalogUrl
          : '/flashcards'
        : null;
    if (target && target !== web.pathname + web.search)
      web.navigate(target, {
        replace: web.pathname === '/flashcards/review',
        state: {
          ...web.state,
          catalogUrl:
            web.pathname === '/flashcards'
              ? web.pathname + web.search
              : web.state?.catalogUrl,
          session: view === 'session' ? session : undefined,
        },
      });
  }, [web, view, session]);
  const [flipped, setFlipped] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const flipControl = useRef<FlashcardFlipHandle>(null);
  const mounted = useRef(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>(
    typeof initialEditor === 'object' ? initialEditor.id : undefined,
  );
  const [title, setTitle] = useState(
    typeof initialEditor === 'object' ? initialEditor.title : '',
  );
  const [cards, setCards] = useState<CardDraft[]>(
    typeof initialEditor === 'object' ? initialEditor.cards : [],
  );
  const [front, setFront] = useState('');
  const [reading, setReading] = useState('');
  const [back, setBack] = useState('');
  const [editorMode, setEditorMode] = useState<'single' | 'bulk'>('single');
  const [importPending, setImportPending] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = useCallback(async (task: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không tải được Flashcard. Thử lại.',
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  const load = useCallback(
    () =>
      active && view === 'catalog'
        ? flashcardService.decks(kind, level, page)
        : Promise.resolve(null),
    [active, view, kind, level, page],
  );
  const { state, reload } = useRemoteResource(load);
  const catalog = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (catalog) setResumeSession(catalog.active_session);
  }, [catalog]);
  const openDue = useCallback(
    () =>
      run(async () => {
        const result = await flashcardSrsService.dueReview();
        if (mounted.current) {
          setSession(result);
          setFlipped(false);
          setView('session');
        }
      }),
    [run],
  );
  const openedDue = useRef(false);
  useEffect(() => {
    if (startDueReview && active && !openedDue.current) {
      openedDue.current = true;
      openDue();
    }
  }, [startDueReview, active, openDue]);
  const goBack = useCallback(() => {
    if (pending.current) return;
    Keyboard.dismiss();
    setFlipping(false);
    setError('');
    if (view === 'catalog') onExit();
    else {
      setView('catalog');
    }
  }, [onExit, view]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!active) return false;
      goBack();
      return true;
    });
    return () => listener.remove();
  }, [active, goBack]);
  const openSession = (deck: DeckRef) =>
    run(async () => {
      const result =
        deck.id.startsWith('review:') && session
          ? await dailyFlashcardService.repeatReview(session.id)
          : await flashcardService.start(deck);
      if (mounted.current) {
        setSession(result);
        setFlipped(false);
        setView('session');
      }
    });
  const edit = (deck?: CustomDeck) => {
    setEditingId(deck?.id);
    setTitle(deck?.title ?? '');
    setCards(deck?.cards ?? []);
    setFront('');
    setReading('');
    setBack('');
    setError('');
    setEditorMode('single');
    setImportPending(false);
    setView('editor');
    if (web)
      web.navigate(
        deck
          ? '/flashcards/decks/' + encodeURIComponent(deck.id) + '/edit'
          : '/flashcards/new',
        {
          state: {
            ...web.state,
            catalogUrl:
              web.pathname === '/flashcards'
                ? web.pathname + web.search
                : web.state?.catalogUrl,
          },
        },
      );
  };
  const addCard = () => {
    if (!front.trim() || !back.trim()) {
      setError('Nhập từ và nghĩa cho thẻ.');
      return;
    }
    if (cards.length >= 100) {
      setError('Mỗi bộ tối đa 100 thẻ.');
      return;
    }
    setCards(previous => [
      ...previous,
      { front: front.trim(), reading: reading.trim(), back: back.trim() },
    ]);
    setFront('');
    setReading('');
    setBack('');
    setError('');
    Keyboard.dismiss();
  };
  const save = () => {
    if (importPending) {
      setError('Thêm các thẻ đang xem trước vào bộ trước khi lưu.');
      setEditorMode('bulk');
      return;
    }
    const hasDraft = Boolean(front.trim() || reading.trim() || back.trim());
    if (hasDraft && (!front.trim() || !back.trim())) {
      setError('Nhập đủ từ và nghĩa của thẻ đang thêm.');
      return;
    }
    const savedCards = hasDraft ? [...cards, { front, reading, back }] : cards;
    if (savedCards.length > 100) {
      setError('Mỗi bộ tối đa 100 thẻ.');
      return;
    }
    if (!title.trim() || !savedCards.length) {
      setError('Nhập tên bộ thẻ và thêm ít nhất một thẻ.');
      return;
    }
    run(async () => {
      await flashcardService.saveDeck(title, savedCards, editingId);
      if (mounted.current) {
        setKind('custom');
        setPage(1);
        if (web)
          web.navigate(
            '/flashcards?' +
              new URLSearchParams({ kind: 'custom', level, page: '1' }),
            { state: { ...web.state } },
          );
        setView('catalog');
      }
    });
  };
  const card = session?.cards.find(item => !(item.id in session.ratings));
  const summary = session?.summary;
  const ratingDisabled = !active || busy || flipping;
  const rateCard = useCallback(
    (grade: number) => {
      if (
        !active ||
        view !== 'session' ||
        !session ||
        session.finished_at ||
        !card ||
        flipping ||
        busy ||
        pending.current
      )
        return;
      return run(async () => {
        const result = await flashcardService.rate(session.id, card.id, grade);
        if (mounted.current) {
          setSession(result);
          setFlipped(false);
        }
      });
    },
    [active, view, session, card, flipping, busy, run],
  );
  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      !active ||
      view !== 'session' ||
      !card ||
      session?.finished_at
    )
      return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        target?.closest?.(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        )
      )
        return;
      const space = event.code === 'Space' || event.key === ' ';
      if (
        space &&
        target?.closest?.(
          '[data-testid="flashcard-favorite-control"], [data-testid="flashcard-audio-control"]',
        )
      )
        return;
      const grade = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : null;
      if (!space && grade === null) return;
      // Prevent scrolling and the focused button's default Space click, even on repeat.
      event.preventDefault();
      if (event.repeat || pending.current || busy || flipping) return;
      if (space) flipControl.current?.flip();
      else if (grade !== null) rateCard(grade);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, view, card, session?.finished_at, busy, flipping, rateCard]);
  return (
    <View style={styles.screen}>
      <ScrollView
        ref={catalogScroll}
        testID="flashcard-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          desktop && view === 'catalog' && styles.catalogContent,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: navigationInset + spacing.section,
          },
        ]}
      >
        {active ? (
          <ScreenBackHeader
            title="Flashcard"
            backLabel={view === 'catalog' ? catalogBackLabel : 'Chọn bộ thẻ'}
            onBack={goBack}
          />
        ) : null}
        <AuthNotice error message={error} />
        {error && view === 'session' && session ? (
          <AuthButton
            label="Tải lại phiên học"
            variant="text"
            disabled={busy}
            onPress={() =>
              run(async () => {
                const result = await flashcardService.session(session.id);
                if (mounted.current) {
                  setSession(result);
                  setFlipped(false);
                }
              })
            }
          />
        ) : null}
        {view === 'catalog' ? (
          <View
            style={[
              styles.catalogLayout,
              desktop && styles.desktopCatalogLayout,
            ]}
          >
            <View style={styles.catalogMain}>
              <View style={styles.row}>
                <Text style={styles.title} accessibilityRole="header">
                  Chọn bộ thẻ
                </Text>
                <AuthButton
                  label="Tạo bộ thẻ"
                  variant="text"
                  disabled={busy}
                  onPress={() => edit()}
                />
              </View>
              <View
                style={styles.tabs}
                accessibilityRole="tablist"
                accessibilityLabel="Nguồn bộ thẻ"
              >
                {kinds.map(item => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityLabel={item.title}
                    accessibilityState={{ selected: kind === item.id }}
                    onPress={() => {
                      if (web)
                        web.navigate(
                          '/flashcards?' +
                            new URLSearchParams({
                              kind: item.id,
                              level,
                              page: '1',
                            }),
                          { state: { ...web.state } },
                        );
                      setKind(item.id);
                      setPage(1);
                      setError('');
                    }}
                    style={[styles.tab, kind === item.id && styles.activeTab]}
                  >
                    <Text
                      style={[
                        styles.label,
                        kind === item.id && styles.activeText,
                      ]}
                    >
                      {item.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {kind === 'lesson' ? (
                <View
                  style={styles.wrap}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Trình độ bộ thẻ"
                >
                  {['N5', 'N4', 'N3', 'N2', 'N1'].map(item => (
                    <Pressable
                      key={item}
                      accessibilityRole="radio"
                      accessibilityLabel={`Flashcard ${item}`}
                      accessibilityState={{ checked: level === item }}
                      onPress={() => {
                        if (web)
                          web.navigate(
                            '/flashcards?' +
                              new URLSearchParams({
                                kind,
                                level: item,
                                page: '1',
                              }),
                            { state: { ...web.state } },
                          );
                        setLevel(item);
                        setPage(1);
                      }}
                      style={[
                        styles.level,
                        level === item && styles.activeLevel,
                      ]}
                    >
                      <Text
                        style={[
                          styles.label,
                          level === item && styles.activeText,
                        ]}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {state.status === 'loading' ? (
                <ActivityIndicator
                  accessibilityLabel="Đang tải bộ thẻ"
                  color={colors.focus}
                />
              ) : null}
              {state.status === 'error' ? (
                <>
                  <AuthNotice error message={state.message} />
                  <AuthButton label="Tải lại bộ thẻ" onPress={reload} />
                </>
              ) : null}
              {catalog && !catalog.items.length ? (
                <Text style={styles.body}>
                  {kind === 'custom'
                    ? 'Chưa có bộ thẻ tự tạo.'
                    : 'Chưa có bộ thẻ ở trình độ này.'}
                </Text>
              ) : null}
              <View
                style={styles.deckGrid}
                testID="flashcard-deck-grid"
                onLayout={event =>
                  setCatalogWidth(event.nativeEvent.layout.width)
                }
              >
                {catalog?.items.map(deck => (
                  <View
                    key={`${deck.kind}:${deck.id}`}
                    style={[
                      styles.panel,
                      styles.deckCard,
                      desktop && { width: deckCardWidth },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Học bộ ${deck.title}`}
                      disabled={busy || !deck.card_count}
                      accessibilityState={{
                        disabled: busy || !deck.card_count,
                      }}
                      onPress={() => openSession(deck)}
                      style={({ pressed }) => [
                        styles.deckGridContent,
                        pressed && styles.deckPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.copy,
                          deck.kind === 'custom' && styles.editableDeckCopy,
                        ]}
                      >
                        <Text style={styles.heading}>{deck.title}</Text>
                        {deck.kind !== 'custom' && deck.subtitle ? (
                          <Text style={styles.caption}>{deck.subtitle}</Text>
                        ) : null}
                      </View>
                      <View style={styles.deckFooter}>
                        <View style={styles.deckCountBadge}>
                          <HomeFeatureIcon
                            name="flashcards"
                            size={15}
                            color={colors.primaryText}
                          />
                          <Text style={styles.deckCount}>
                            {deck.card_count} thẻ
                          </Text>
                        </View>
                        <View style={styles.deckArrow} accessible={false}>
                          <ChevronRightIcon
                            size={18}
                            color={colors.primaryText}
                          />
                        </View>
                      </View>
                    </Pressable>
                    {deck.kind === 'custom' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Sửa bộ ${deck.title}`}
                        accessibilityState={{ disabled: busy }}
                        {...(Platform.OS === 'web' ? { title: 'Sửa bộ' } : {})}
                        style={({ pressed }) => [
                          styles.editDeck,
                          pressed && styles.deckPressed,
                          busy && styles.editDeckDisabled,
                        ]}
                        disabled={busy}
                        onPress={() =>
                          run(async () => {
                            const result = await flashcardService.deck(deck.id);
                            if (mounted.current) edit(result);
                          })
                        }
                      >
                        <PencilIcon size={18} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
              {catalog && catalog.pagination.total_pages > 1 ? (
                <DeckPagination
                  page={page}
                  totalPages={catalog.pagination.total_pages}
                  onChange={next => {
                    if (web)
                      web.navigate(
                        '/flashcards?' +
                          new URLSearchParams({
                            kind,
                            level,
                            page: String(next),
                          }),
                        { state: { ...web.state } },
                      );
                    setPage(next);
                    catalogScroll.current?.scrollTo({ y: 0, animated: false });
                  }}
                />
              ) : null}
            </View>
            <View
              style={[styles.sidebar, desktop && styles.catalogSidebar]}
              nativeID={desktop ? 'flashcard-sticky-sidebar' : undefined}
              testID="flashcard-review-sidebar"
            >
              {resumeSession ? (
                <View
                  style={[styles.panel, styles.resumePanel]}
                  testID="flashcard-active-session"
                >
                  <View style={styles.row}>
                    <Text style={styles.resumeLabel}>Đang học</Text>
                    <Text style={styles.caption}>
                      {Math.round(
                        (resumeSession.studied /
                          Math.max(1, resumeSession.total)) *
                          100,
                      )}
                      %
                    </Text>
                  </View>
                  <Text style={styles.heading}>{resumeSession.title}</Text>
                  <Text style={styles.caption}>
                    {resumeSession.studied} / {resumeSession.total} thẻ
                  </Text>
                  <View
                    style={styles.track}
                    accessibilityRole="progressbar"
                    accessibilityLabel="Tiến độ phiên đang học"
                    accessibilityValue={{
                      min: 0,
                      max: resumeSession.total,
                      now: resumeSession.studied,
                    }}
                  >
                    <View
                      style={[
                        styles.progress,
                        {
                          width: `${Math.min(
                            100,
                            (resumeSession.studied /
                              Math.max(1, resumeSession.total)) *
                              100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <AuthButton
                    label="Tiếp tục phiên học"
                    busy={busy}
                    onPress={() =>
                      run(async () => {
                        const result = await flashcardService.session(
                          resumeSession.id,
                        );
                        if (mounted.current) {
                          setSession(result);
                          setFlipped(false);
                          setView('session');
                        }
                      })
                    }
                  />
                </View>
              ) : null}
              <FlashcardSchedulePanel onReview={openDue} busy={busy} />
            </View>
          </View>
        ) : null}
        {view === 'editor' ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {editingId ? 'Sửa bộ thẻ' : 'Tạo bộ thẻ'}
            </Text>
            <TextInput
              accessibilityLabel="Tên bộ thẻ"
              placeholder="Tên bộ thẻ"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              style={styles.input}
              editable={!busy}
            />
            <View
              style={styles.tabs}
              accessibilityRole="tablist"
              accessibilityLabel="Cách nhập thẻ"
            >
              {(
                [
                  { id: 'single', label: 'Từng thẻ' },
                  { id: 'bulk', label: 'Nhập hàng loạt' },
                ] as const
              ).map(mode => (
                <Pressable
                  key={mode.id}
                  accessibilityRole="tab"
                  accessibilityLabel={mode.label}
                  accessibilityState={{
                    selected: editorMode === mode.id,
                    disabled: busy,
                  }}
                  disabled={busy}
                  onPress={() => setEditorMode(mode.id)}
                  style={[
                    styles.tab,
                    editorMode === mode.id && styles.activeTab,
                  ]}
                >
                  <Text
                    style={[
                      styles.label,
                      editorMode === mode.id && styles.activeText,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View
              style={[styles.panel, editorMode !== 'bulk' && styles.hidden]}
            >
              <FlashcardBulkImport
                remaining={
                  100 -
                  cards.length -
                  (front.trim() || reading.trim() || back.trim() ? 1 : 0)
                }
                disabled={busy}
                onPendingChange={setImportPending}
                onImport={imported => {
                  setCards(previous => [...previous, ...imported]);
                  setError('');
                }}
              />
            </View>
            <View
              style={[styles.panel, editorMode !== 'single' && styles.hidden]}
            >
              <TextInput
                accessibilityLabel="Mặt trước của thẻ"
                placeholder="Từ tiếng Nhật"
                value={front}
                onChangeText={setFront}
                maxLength={100}
                style={styles.input}
                editable={!busy}
              />
              <TextInput
                accessibilityLabel="Cách đọc của thẻ"
                placeholder="Cách đọc (tuỳ chọn)"
                value={reading}
                onChangeText={setReading}
                maxLength={100}
                style={styles.input}
                editable={!busy}
              />
              <TextInput
                accessibilityLabel="Mặt sau của thẻ"
                placeholder="Nghĩa tiếng Việt"
                value={back}
                onChangeText={setBack}
                maxLength={2000}
                multiline
                style={[styles.input, styles.meaningInput]}
                editable={!busy}
              />
              <AuthButton
                label="Thêm thẻ"
                variant="outline"
                onPress={addCard}
                disabled={busy}
              />
            </View>
            <Text style={styles.caption}>{cards.length} thẻ đã thêm</Text>
            {cards.map((item, index) => (
              <View key={index} style={styles.panel}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{item.front}</Text>
                  <AuthButton
                    label={`Bỏ thẻ ${index + 1}`}
                    variant="text"
                    disabled={busy}
                    onPress={() =>
                      setCards(previous =>
                        previous.filter((_, i) => i !== index),
                      )
                    }
                  />
                </View>
                {item.reading ? (
                  <Text style={styles.caption}>{item.reading}</Text>
                ) : null}
                <Text style={styles.body}>{item.back}</Text>
              </View>
            ))}
            <AuthButton label="Lưu bộ thẻ" busy={busy} onPress={save} />
          </>
        ) : null}
        {view === 'session' && session && !session.finished_at && card ? (
          <>
            {study?.data ? (
              <View style={styles.wrap}>
                <Text style={styles.dueBadge}>
                  Đến hạn hôm nay · {study.data.today_count}
                </Text>
                <Text style={styles.doneBadge}>
                  Đã ôn hôm nay · {study.data.reviewed_today_count}
                </Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.heading}>{session.title}</Text>
              <Text style={styles.caption}>
                {session.summary.studied + 1} / {session.cards.length}
              </Text>
            </View>
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityLabel="Tiến độ phiên Flashcard"
              accessibilityValue={{
                min: 0,
                max: session.cards.length,
                now: session.summary.studied,
              }}
            >
              <View
                style={[
                  styles.progress,
                  {
                    width: `${
                      (session.summary.studied / session.cards.length) * 100
                    }%`,
                  },
                ]}
              />
            </View>
            <View style={styles.studyCardFrame}>
              <FlashcardFlip
                ref={flipControl}
                key={`${session.id}:${card.id}`}
                flipped={flipped}
                active={active}
                disabled={busy || flipping}
                onFlip={setFlipped}
                onAnimatingChange={setFlipping}
              >
                {(face, flip) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={face ? 'Xem mặt trước' : 'Lật thẻ'}
                    onPress={flip}
                    disabled={busy || flipping}
                    style={styles.flashcard}
                    testID="study-flashcard"
                  >
                    <Text style={styles.japanese}>{card.front}</Text>
                    {face ? (
                      <>
                        {card.reading ? (
                          <Text style={styles.reading}>{card.reading}</Text>
                        ) : null}
                        <Text style={styles.definition}>{card.back}</Text>
                      </>
                    ) : (
                      <Text style={styles.caption}>
                        {Platform.OS === 'web'
                          ? 'Chạm hoặc nhấn Space để lật'
                          : 'Chạm để lật thẻ'}
                      </Text>
                    )}
                  </Pressable>
                )}
              </FlashcardFlip>
              <View
                style={styles.audioControl}
                testID="flashcard-audio-control"
              >
                <WordPronunciation
                  id={`${session.id}:${card.id}`}
                  word={card.front}
                  reading={card.reading}
                  active={active && !busy && !flipping}
                  audioId={
                    (card.srs_id || card.id).startsWith('lesson:')
                      ? (card.srs_id || card.id).slice(7)
                      : undefined
                  }
                />
              </View>
              <View
                style={styles.favoriteControl}
                testID="flashcard-favorite-control"
              >
                <FavoriteWordButton
                  key={`${session.id}:${card.id}`}
                  source="session"
                  sessionId={session.id}
                  id={card.id}
                  word={card.front}
                  disabled={!active || busy || flipping}
                />
              </View>
            </View>
            <View style={styles.grades} accessibilityLabel="Đánh giá mức nhớ">
              {grades.map((label, grade) => {
                const option = session.rating_options?.find(
                  item => item.grade === grade,
                );
                const due = option ? flashcardDueLabel(option.due_at) : null;
                return (
                  <Pressable
                    key={grade}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityHint={[
                      due ? `Ôn lại sau ${due.interval}` : '',
                      Platform.OS === 'web' ? `Phím ${grade + 1}` : '',
                    ]
                      .filter(Boolean)
                      .join('. ')}
                    accessibilityState={{ disabled: ratingDisabled }}
                    disabled={ratingDisabled}
                    onPress={() => rateCard(grade)}
                    style={({ pressed }) => [
                      styles.grade,
                      pressed && !ratingDisabled && styles.gradePressed,
                      ratingDisabled && styles.gradeDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.gradeLabel,
                        ratingDisabled && styles.gradeDisabledText,
                      ]}
                    >
                      {label}
                    </Text>
                    <Text
                      style={[
                        styles.gradeInterval,
                        ratingDisabled && styles.gradeDisabledText,
                      ]}
                    >
                      {due?.interval ?? '—'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <AuthButton
              label="Kết thúc phiên học"
              variant="text"
              disabled={busy || flipping}
              onPress={() =>
                run(async () => {
                  const result = await flashcardService.finish(session.id);
                  if (mounted.current) setSession(result);
                })
              }
            />
            {busy ? (
              <ActivityIndicator
                accessibilityLabel="Đang lưu mức nhớ"
                color={colors.focus}
              />
            ) : null}
          </>
        ) : null}
        {view === 'session' && session?.finished_at && summary ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Tổng kết phiên học
            </Text>
            <View style={styles.panel}>
              <Text style={styles.heading}>{session.title}</Text>
              <Text style={styles.result}>
                {summary.studied} / {summary.total} thẻ đã học
              </Text>
              <FlashcardSummaryChart summary={summary} />
              <Text style={styles.caption}>
                {summary.studied
                  ? 'Theo mức tự đánh giá Nhớ và Rất nhớ.'
                  : 'Chưa đánh giá thẻ nào.'}
              </Text>
            </View>
            <AuthButton
              label="Học lại bộ này"
              busy={busy}
              onPress={() =>
                openSession({ kind: session.kind, id: session.deck_id })
              }
            />
            <AuthButton
              label="Chọn bộ khác"
              variant="outline"
              onPress={goBack}
              disabled={busy}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: spacing.lg,
  },
  catalogContent: { maxWidth: layout.maxContentWidth },
  catalogLayout: {
    flexDirection: 'column-reverse',
    gap: spacing.xl,
    alignItems: 'stretch',
  },
  desktopCatalogLayout: {
    flexDirection: 'row',
    gap: spacing.xxl,
    alignItems: 'flex-start',
  },
  catalogMain: { flex: 1, minWidth: 0, gap: spacing.lg },
  sidebar: { gap: spacing.lg },
  catalogSidebar: { width: 320, flexShrink: 0 },
  resumePanel: { borderWidth: 1, borderColor: colors.border },
  resumeLabel: { ...typography.caption, color: colors.focus },
  deckGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    alignItems: 'stretch',
  },
  deckCard: {
    width: '100%',
    minWidth: 0,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  editableDeckCopy: { paddingRight: 48 },
  editDeck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  editDeckDisabled: { opacity: 0.5 },
  deckPressed: { backgroundColor: colors.surfaceTint },
  deckGridContent: {
    flex: 1,
    minHeight: 112,
    gap: spacing.lg,
    borderRadius: radius.small,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  deckFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  deckCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  deckCount: { ...typography.caption, color: colors.body },
  deckArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
  },
  title: { ...typography.title, color: colors.dark },
  heading: { ...typography.heading, color: colors.dark },
  body: { ...typography.body, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  label: { ...typography.label, color: colors.body },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tab: {
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: colors.focus },
  activeText: { color: colors.focus },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  level: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  activeLevel: { backgroundColor: colors.badgeBg },
  panel: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    boxShadow: shadowSm,
  },
  input: {
    ...typography.input,
    color: colors.inputText,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: layout.inputHeight,
    backgroundColor: colors.surface,
  },
  meaningInput: { minHeight: 90, textAlignVertical: 'top' },
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.track,
  },
  progress: { height: '100%', backgroundColor: colors.primary },
  flashcard: {
    minHeight: 280,
    padding: spacing.xxl,
    gap: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    boxShadow: shadowSm,
  },
  studyCardFrame: { position: 'relative' },
  audioControl: { position: 'absolute', top: 8, left: 8, zIndex: 1 },
  favoriteControl: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
  },
  japanese: {
    ...typography.title,
    fontSize: 36,
    lineHeight: 50,
    color: colors.dark,
    textAlign: 'center',
  },
  reading: { ...typography.label, color: colors.focus, textAlign: 'center' },
  definition: {
    ...typography.heading,
    color: colors.body,
    textAlign: 'center',
  },
  grades: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  grade: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  gradePressed: { backgroundColor: colors.badgeBg },
  gradeDisabled: {
    backgroundColor: colors.disabled,
    borderColor: colors.disabled,
  },
  gradeDisabledText: { color: colors.disabledText },
  gradeLabel: {
    ...typography.caption,
    color: colors.primaryText,
    textAlign: 'center',
  },
  gradeInterval: {
    ...typography.caption,
    color: colors.dark,
    textAlign: 'center',
  },
  dueBadge: {
    ...typography.caption,
    color: colors.focus,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  doneBadge: {
    ...typography.caption,
    color: colors.success,
    backgroundColor: colors.successBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  result: { ...typography.title, color: colors.focus },
});

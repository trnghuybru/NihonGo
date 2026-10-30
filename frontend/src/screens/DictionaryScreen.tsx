import { decodeRouteParam } from '../navigation/webNavigation';
import { useWebNavigation } from '../navigation/webNavigation';
import {
  sentenceTranslationService,
  isSentenceQuery,
  type SentenceTranslationResult,
} from '../services/sentenceTranslationService';
import { SentenceTranslation } from '../components/SentenceTranslation';
import { HandwritingLookup } from '../components/HandwritingLookup';
import { WordPronunciation } from '../components/WordPronunciation';
import { FavoriteWordButton } from '../components/FavoriteWordButton';
import { useSearchHistoryFocus } from '../hooks/useSearchHistoryFocus';
import { DictionaryRecentHistory } from '../components/DictionaryRecentHistory';
import { useRecordDictionaryHistory } from '../hooks/useDictionaryHistory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KanjiStrokeDiagram } from '../components/KanjiStrokeDiagram';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  HandwritingIcon,
} from '../components/icons';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { useWebLayout } from '../hooks/useWebLayout';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import { formatDictionaryPartsOfSpeech } from '../utils/dictionaryLabels';
import {
  dictionaryService,
  DictionaryResults,
  DictionaryHistoryItem,
  Gloss,
  KanjiDetail,
  KanjiPreview,
  WordDetail,
  WordPreview,
} from '../services/dictionaryService';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

type Tab = 'words' | 'kanji' | 'videos';
type WordSearchContext = DictionaryResults<WordPreview> & { query: string };
type KanjiSearchContext = DictionaryResults<KanjiPreview> & { query: string };
type Route =
  | { kind: 'words' | 'kanji'; query: string; page: number }
  | { kind: 'word'; id: string; context?: WordSearchContext; input?: string }
  | {
      kind: 'character';
      literal: string;
      context?: KanjiSearchContext;
      input?: string;
    };
type Result =
  | {
      kind: 'words';
      result: DictionaryResults<WordPreview>;
      word: WordDetail | null;
    }
  | {
      kind: 'kanji';
      result: DictionaryResults<KanjiPreview>;
      character: KanjiDetail | null;
    }
  | { kind: 'translation'; translation: SentenceTranslationResult }
  | { kind: 'word'; word: WordDetail }
  | { kind: 'character'; character: KanjiDetail };
const empty = {
  items: [],
  pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
};
const tabNames = {
  words: 'Từ vựng',
  kanji: 'Hán tự',
  videos: 'Video',
};
function GlossText({ glosses }: { glosses: Gloss[] }) {
  const vietnamese = glosses.filter(x => x.language === 'vi');
  const preferred = vietnamese.length
    ? vietnamese
    : glosses.filter(x => ['eng', 'en'].includes(x.language));
  return (
    <Text selectable style={styles.body}>
      {preferred.map(x => x.text).join('; ')}
      {!vietnamese.length && preferred.length ? ' · Anh' : ''}
    </Text>
  );
}

function WordContent({ word, active }: { word: WordDetail; active: boolean }) {
  return (
    <View
      style={[styles.card, styles.entryCard]}
      testID="dictionary-primary-word"
    >
      <View style={styles.details}>
        <View style={styles.entryTitleRow}>
          <Text
            selectable
            accessibilityRole="header"
            style={[styles.mainWord, styles.entryWord]}
          >
            {word.word}
          </Text>
          <WordPronunciation
            id={word.id}
            word={word.word}
            reading={
              (
                word.readings.find(
                  item =>
                    !item.applies_to.length ||
                    item.applies_to.includes(word.word),
                ) || word.readings[0]
              )?.text
            }
            active={active}
          />
          <FavoriteWordButton
            key={word.id}
            source="dictionary"
            id={word.id}
            word={word.word}
          />
        </View>
        {word.readings.map(reading => (
          <View key={reading.text}>
            <Text selectable style={styles.reading}>
              {reading.text}
            </Text>
            {reading.applies_to.length ? (
              <Text style={styles.caption}>
                Dùng với: {reading.applies_to.join('、')}
              </Text>
            ) : null}
            {reading.info.length ? (
              <Text style={styles.caption}>{reading.info.join(' · ')}</Text>
            ) : null}
          </View>
        ))}
        {word.forms.length > 1 ? (
          <Text selectable style={styles.body}>
            Cách viết khác:{' '}
            {word.forms
              .slice(1)
              .map(x => x.text)
              .join('、')}
          </Text>
        ) : null}
        {word.han_viet?.length ? (
          <Text style={styles.caption}>
            Hán Việt: {word.han_viet.join(' · ').toUpperCase()}
          </Text>
        ) : null}
        {!word.senses.some(sense =>
          sense.glosses.some(x => x.language === 'vi'),
        ) ? (
          <Text style={styles.caption}>
            Mục từ này hiện có nghĩa tiếng Anh, chưa có nghĩa tiếng Việt.
          </Text>
        ) : null}
      </View>
      <View style={styles.entrySection}>
        <Text accessibilityRole="header" style={styles.heading}>
          Nghĩa của từ
        </Text>
        {word.senses.map((sense, index) => (
          <View key={index} style={styles.sense}>
            <Text style={styles.label}>
              {index + 1}
              {sense.parts_of_speech.length
                ? `. ${formatDictionaryPartsOfSpeech(sense.parts_of_speech)}`
                : '.'}
            </Text>
            <GlossText glosses={sense.glosses} />
            {sense.applies_to_forms?.length ? (
              <Text style={styles.caption}>
                Cách viết: {sense.applies_to_forms.join('、')}
              </Text>
            ) : null}
            {sense.applies_to_readings?.length ? (
              <Text style={styles.caption}>
                Cách đọc: {sense.applies_to_readings.join('、')}
              </Text>
            ) : null}
            {sense.tags.length ? (
              <Text style={styles.caption}>{sense.tags.join(' · ')}</Text>
            ) : null}
            {sense.notes.map((note, i) => (
              <Text key={i} style={styles.caption}>
                {note}
              </Text>
            ))}
          </View>
        ))}
      </View>
      {word.examples.length ? (
        <View style={styles.entrySection}>
          <Text accessibilityRole="header" style={styles.heading}>
            Ví dụ
          </Text>
          {word.examples.map((example, index) => (
            <View key={index} style={styles.sense}>
              <Text selectable style={styles.japanese}>
                {example.japanese}
              </Text>
              {example.reading ? (
                <Text selectable style={styles.caption}>
                  {example.reading}
                </Text>
              ) : null}
              {example.meaning_vi ? (
                <Text selectable style={styles.body}>
                  {example.meaning_vi}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CompactWordRow({
  word,
  selected = false,
  vietnameseOnly = false,
  onOpen,
}: {
  word: WordPreview;
  selected?: boolean;
  vietnameseOnly?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tra từ ${word.word}`}
      accessibilityState={{ selected }}
      onPress={() => onOpen(word.id)}
      style={({ pressed }) => [
        styles.sideRow,
        selected && styles.selectedSideRow,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.sideWord}>{word.word}</Text>
      <Text style={styles.reading}>{word.reading}</Text>
      {vietnameseOnly ? (
        word.glosses.some(gloss => gloss.language === 'vi') ? (
          <GlossText
            glosses={word.glosses.filter(gloss => gloss.language === 'vi')}
          />
        ) : null
      ) : (
        <GlossText glosses={word.glosses} />
      )}
    </Pressable>
  );
}

function KanjiAccordion({
  character,
  onOpen,
}: {
  character: Pick<KanjiPreview, 'literal' | 'on' | 'kun' | 'han_viet'>;
  onOpen: (literal: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [requested, setRequested] = useState(false);
  const load = useCallback(
    () =>
      requested
        ? dictionaryService.character(character.literal)
        : Promise.resolve(null),
    [character.literal, requested],
  );
  const { state, reload } = useRemoteResource(load);
  return (
    <View style={styles.sideRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Thu gọn' : 'Mở'} Hán tự ${
          character.literal
        }`}
        accessibilityHint="Xem cách đọc và thứ tự nét viết ngay tại đây"
        accessibilityState={{ expanded }}
        onPress={() => {
          setRequested(true);
          setExpanded(value => !value);
        }}
        style={({ pressed }) => [styles.kanjiToggle, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <View style={styles.row}>
            <Text style={styles.sideWord}>{character.literal}</Text>
            <Text style={styles.body}>{character.on.join('、')}</Text>
          </View>
          <Text style={styles.label}>
            {character.han_viet.join(' · ').toUpperCase()}
          </Text>
        </View>
        <View style={expanded && styles.chevronExpanded}>
          <ChevronDownIcon size={20} color={colors.muted} />
        </View>
      </Pressable>
      {expanded ? (
        <View
          style={styles.details}
          testID={`dictionary-kanji-expanded-${character.literal}`}
        >
          {character.kun.length ? (
            <Text style={styles.caption}>
              Kunyomi: {character.kun.join('、')}
            </Text>
          ) : null}
          <Text accessibilityRole="header" style={styles.label}>
            Thứ tự nét viết
          </Text>
          {state.status === 'loading' ||
          (state.status === 'ready' && !state.data) ? (
            <ActivityIndicator
              accessibilityLabel={`Đang tải nét viết ${character.literal}`}
              color={colors.focus}
            />
          ) : state.status === 'error' ? (
            <>
              <AuthNotice error message={state.message} />
              <AuthButton
                label={`Thử lại nét viết ${character.literal}`}
                variant="text"
                onPress={reload}
              />
            </>
          ) : state.data?.stroke_paths?.length ? (
            <>
              <KanjiStrokeDiagram paths={state.data.stroke_paths} />
              <Text style={styles.caption}>{state.data.strokes} nét</Text>
            </>
          ) : (
            <Text style={styles.caption}>
              Chưa có sơ đồ nét viết cho chữ này.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tra Hán tự ${character.literal}`}
            onPress={() => onOpen(character.literal)}
            style={({ pressed }) => [
              styles.kanjiDetailLink,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.link}>Xem chi tiết Hán tự</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function WordWorkspace({
  active,
  word,
  context,
  wide,
  onWord,
  onKanji,
  onPage,
}: {
  word: WordDetail;
  active: boolean;
  context?: WordSearchContext;
  wide: boolean;
  onWord: (id: string) => void;
  onKanji: (literal: string) => void;
  onPage: (page: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const matches = context?.items.filter(
    item => item.match_type === 'exact' || item.id === word.id,
  ) ?? [word];
  // A fuzzy query still has a selected result. Remaining candidates belong in related words.
  if (!matches.length && context?.items.length) matches.push(context.items[0]);
  const seen = new Set([word.id, ...matches.map(item => item.id)]);
  const related: WordPreview[] = [];
  for (const item of [
    ...(word.related_entries ?? []),
    ...word.other_entries,
    ...(context?.items ?? []),
  ]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      related.push(item);
    }
  }
  const kanji =
    word.kanji_details ??
    word.kanji.map(literal => ({ literal, on: [], kun: [], han_viet: [] }));
  return (
    <View
      style={[styles.workspace, wide && styles.workspaceWide]}
      testID="dictionary-word-workspace"
    >
      <View style={styles.primaryColumn}>
        <WordContent word={word} active={active} />
      </View>
      <View
        style={[styles.sideColumn, wide && styles.sideColumnWide]}
        testID="dictionary-word-sidebar"
      >
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>
            Kết quả tra cứu {context?.query || word.word}
          </Text>
          {matches.map(item => (
            <CompactWordRow
              key={item.id}
              word={item}
              selected={item.id === word.id}
              onOpen={onWord}
            />
          ))}
        </View>
        {kanji.length ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>
              Hán tự trong {word.word}
            </Text>
            {kanji.map(character => (
              <KanjiAccordion
                key={character.literal}
                character={character}
                onOpen={onKanji}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.card} testID="dictionary-related-words">
          <Text accessibilityRole="header" style={styles.heading}>
            Từ vựng liên quan tới {word.word}
          </Text>
          {related.length ? (
            related
              .slice(0, expanded ? 20 : 6)
              .map(item => (
                <CompactWordRow key={item.id} word={item} onOpen={onWord} />
              ))
          ) : (
            <Text style={styles.caption}>
              Chưa có từ vựng liên quan trong dữ liệu hiện tại.
            </Text>
          )}
          {related.length > 6 ? (
            <AuthButton
              label={
                expanded ? 'Thu gọn từ liên quan' : 'Xem thêm từ liên quan'
              }
              variant="text"
              onPress={() => setExpanded(value => !value)}
            />
          ) : null}
          {context && context.pagination.total_pages > 1 ? (
            <View style={styles.pagination}>
              <AuthButton
                label="Trang trước"
                variant="text"
                disabled={context.pagination.page <= 1}
                onPress={() => onPage(context.pagination.page - 1)}
              />
              <Text style={styles.caption}>
                {context.pagination.page}/{context.pagination.total_pages}
              </Text>
              <AuthButton
                label="Trang sau"
                variant="text"
                disabled={
                  context.pagination.page >=
                  Math.min(1000, context.pagination.total_pages)
                }
                onPress={() => onPage(context.pagination.page + 1)}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function CharacterContent({
  character,
  onWord,
  onSearch,
}: {
  character: KanjiDetail;
  onWord: (id: string) => void;
  onSearch: (query: string) => void;
}) {
  const vietnameseMeanings = character.meanings.filter(
    meaning => meaning.language === 'vi',
  );
  return (
    <View
      style={[styles.card, styles.entryCard]}
      testID="dictionary-primary-kanji"
    >
      <View style={styles.pronunciation}>
        <View
          style={styles.kanjiInformation}
          testID="dictionary-kanji-information"
        >
          <View style={styles.kanjiHeader}>
            <View style={styles.kanjiIdentity}>
              <Text
                selectable
                accessibilityRole="header"
                style={styles.kanjiTitle}
              >
                {character.literal}
              </Text>
              {character.han_viet.length ? (
                <Text style={styles.heading}>
                  {character.han_viet.join(' · ').toUpperCase()}
                </Text>
              ) : null}
            </View>
            <View
              style={styles.kanjiReadings}
              testID="dictionary-kanji-readings"
            >
              <Text accessibilityRole="header" style={styles.heading}>
                Phát âm
              </Text>
              <View style={styles.details}>
                <Text style={styles.label}>Kunyomi</Text>
                <Text selectable style={styles.kanjiReading}>
                  {character.kun.join('、') || '—'}
                </Text>
              </View>
              <View style={styles.details}>
                <Text style={styles.label}>Onyomi</Text>
                <Text selectable style={styles.kanjiReading}>
                  {character.on.join('、') || '—'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.kanjiFacts}>
            <View style={styles.fact}>
              <Text style={styles.badge}>Số nét</Text>
              <Text style={styles.label}>{character.strokes}</Text>
            </View>
            {character.radicals.length ? (
              <View style={styles.fact}>
                <Text style={styles.badge}>Bộ thủ</Text>
                <Text selectable style={styles.label}>
                  {character.radicals
                    .map(
                      number =>
                        `${String.fromCodePoint(
                          0x2f00 + number - 1,
                        )} (${number})`,
                    )
                    .join('、')}
                </Text>
              </View>
            ) : null}
            {character.frequency ? (
              <View style={styles.fact}>
                <Text style={styles.badge}>Tần suất</Text>
                <Text style={styles.label}>#{character.frequency}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View
          style={styles.kanjiStrokePanel}
          testID="dictionary-kanji-stroke-panel"
        >
          <Text accessibilityRole="header" style={styles.label}>
            Thứ tự nét viết
          </Text>
          {character.stroke_paths?.length ? (
            <KanjiStrokeDiagram paths={character.stroke_paths} />
          ) : (
            <Text style={styles.caption}>
              Chưa có sơ đồ nét viết cho chữ này.
            </Text>
          )}
        </View>
      </View>
      {vietnameseMeanings.length ? (
        <View style={styles.entrySection}>
          <Text accessibilityRole="header" style={styles.heading}>
            Nghĩa
          </Text>
          <GlossText glosses={vietnameseMeanings} />
        </View>
      ) : null}
      <View style={styles.entrySection}>
        <Text accessibilityRole="header" style={styles.heading}>
          Từ chứa {character.literal}
        </Text>
        {character.compounds.length ? (
          character.compounds.map(word => (
            <CompactWordRow
              key={word.id}
              word={word}
              onOpen={onWord}
              vietnameseOnly
            />
          ))
        ) : (
          <Text style={styles.caption}>
            Chưa có từ ghép trong dữ liệu hiện tại.
          </Text>
        )}
        <AuthButton
          label="Tra các từ chứa chữ này"
          variant="text"
          onPress={() => onSearch(character.literal)}
        />
      </View>
    </View>
  );
}

function KanjiWorkspace({
  character,
  context,
  wide,
  onKanji,
  onWord,
  onSearch,
  onPage,
}: {
  character: KanjiDetail;
  context?: KanjiSearchContext;
  wide: boolean;
  onKanji: (literal: string) => void;
  onWord: (id: string) => void;
  onSearch: (query: string) => void;
  onPage: (page: number) => void;
}) {
  return (
    <View
      style={[styles.workspace, wide && styles.workspaceWide]}
      testID="dictionary-kanji-workspace"
    >
      <View style={styles.primaryColumn}>
        <CharacterContent
          character={character}
          onWord={onWord}
          onSearch={onSearch}
        />
      </View>
      <View
        style={[styles.sideColumn, wide && styles.sideColumnWide]}
        testID="dictionary-kanji-sidebar"
      >
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>
            Kết quả tra cứu kanji
          </Text>
          {(context?.items ?? [character]).map(item => (
            <Pressable
              key={item.literal}
              accessibilityRole="button"
              accessibilityLabel={`Tra Hán tự ${item.literal}`}
              accessibilityState={{
                selected: item.literal === character.literal,
              }}
              onPress={() => onKanji(item.literal)}
              style={({ pressed }) => [
                styles.sideRow,
                item.literal === character.literal && styles.selectedSideRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.sideWord}>{item.literal}</Text>
              <Text style={styles.label}>
                {item.han_viet.join(' · ').toUpperCase()}
              </Text>
            </Pressable>
          ))}
          {context && context.pagination.total_pages > 1 ? (
            <View style={styles.pagination}>
              <AuthButton
                label="Trang trước"
                variant="text"
                disabled={context.pagination.page <= 1}
                onPress={() => onPage(context.pagination.page - 1)}
              />
              <Text style={styles.caption}>
                {context.pagination.page}/{context.pagination.total_pages}
              </Text>
              <AuthButton
                label="Trang sau"
                variant="text"
                disabled={
                  context.pagination.page >=
                  Math.min(1000, context.pagination.total_pages)
                }
                onPress={() => onPage(context.pagination.page + 1)}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function DictionaryScreen({
  query = '',
  initialEntry,
  compact = false,
  active = true,
  onExit,
  renderVideos,
}: {
  query?: string;
  initialEntry?: DictionaryHistoryItem;
  compact?: boolean;
  active?: boolean;
  onExit?: () => void;
  renderVideos: (query: string) => React.ReactNode;
}) {
  const webContext = useWebNavigation();
  const web =
    !compact && webContext?.pathname.startsWith('/lookup') ? webContext : null;
  const urlParams = new URLSearchParams(web?.search ?? '');
  const initialTab: Tab =
    web?.pathname === '/lookup/videos'
      ? 'videos'
      : urlParams.get('kind') === 'kanji' ||
        web?.pathname.startsWith('/lookup/kanji/')
      ? 'kanji'
      : 'words';
  const insets = useSafeAreaInsets();
  const navigationInset = useBottomNavigationInset();
  const { width } = useWindowDimensions();
  const { contentWidth } = useWebLayout();
  const wide =
    !compact && Platform.OS === 'web' && (contentWidth || width) >= 900;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [handwritingOpen, setHandwritingOpen] = useState(false);
  const [videoQuery, setVideoQuery] = useState(query.trim().slice(0, 100));
  useEffect(() => {
    if (!active) setHandwritingOpen(false);
  }, [active]);
  const [text, setText] = useState((initialEntry?.word ?? query).slice(0, 500));
  const {
    focused,
    setFocused,
    historyOpen,
    setHistoryOpen,
    searchContainerRef,
  } = useSearchHistoryFocus(active);
  const [routes, setRoutes] = useState<Route[]>(() => {
    if (web) {
      const word = /^\/lookup\/words\/([^/]+)$/.exec(web.pathname)?.[1];
      const character = /^\/lookup\/kanji\/([^/]+)$/.exec(web.pathname)?.[1];
      if (word)
        return [{ kind: 'word', id: decodeRouteParam(word), input: query }];
      if (character)
        return [
          {
            kind: 'character',
            literal: decodeRouteParam(character),
            input: query,
          },
        ];
      return [
        {
          kind: initialTab === 'kanji' ? 'kanji' : 'words',
          query: query.trim().slice(0, initialTab === 'kanji' ? 100 : 500),
          page: Math.max(
            1,
            Math.min(10000, Number(urlParams.get('page')) || 1),
          ),
        },
      ];
    }

    const initial = query.trim().slice(0, 500);
    if (initialEntry)
      return [
        {
          kind: initialEntry.kind === 'kanji' ? 'kanji' : 'words',
          query: '',
          page: 1,
        },
        initialEntry.kind === 'kanji'
          ? {
              kind: 'character',
              literal: initialEntry.target,
              input: initialEntry.word,
            }
          : { kind: 'word', id: initialEntry.target, input: initialEntry.word },
      ];
    return [
      { kind: 'words', query: '', page: 1 },
      ...(initial ? [{ kind: 'words' as const, query: initial, page: 1 }] : []),
    ];
  });
  const listRef = useRef<FlatList<never>>(null);
  const route = routes[routes.length - 1];
  const activeTab: Tab =
    tab === 'videos'
      ? 'videos'
      : route.kind === 'character' || route.kind === 'kanji'
      ? 'kanji'
      : route.kind === 'word' || route.kind === 'words'
      ? 'words'
      : tab;
  const listRoute = route.kind === 'words' || route.kind === 'kanji';
  const push = useCallback(
    (next: Route) => {
      Keyboard.dismiss();
      if (web) {
        const target =
          next.kind === 'word'
            ? '/lookup/words/' +
              encodeURIComponent(next.id) +
              '?q=' +
              encodeURIComponent(next.input ?? '')
            : next.kind === 'character'
            ? '/lookup/kanji/' +
              encodeURIComponent(next.literal) +
              '?q=' +
              encodeURIComponent(next.input ?? next.literal)
            : '/lookup?' +
              new URLSearchParams({
                kind: next.kind,
                q: next.query,
                page: String(next.page),
              });
        web.navigate(target);
      } else setRoutes(previous => [...previous, next]);
    },
    [web],
  );
  const goBack = useCallback(() => {
    Keyboard.dismiss();
    setHistoryOpen(false);
    if (web) {
      web.back('/lookup');
      return;
    }
    if (routes.length > 1) {
      const previous = routes[routes.length - 2];
      setTab(
        previous.kind === 'kanji' || previous.kind === 'character'
          ? 'kanji'
          : 'words',
      );
      setText(
        'query' in previous
          ? previous.query
          : previous.input ??
              previous.context?.query ??
              (previous.kind === 'character' ? previous.literal : ''),
      );
      setRoutes(routes.slice(0, -1));
    } else onExit?.();
  }, [onExit, routes, setHistoryOpen, web]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!active) return false;
        if (routes.length <= 1) {
          if (onExit) {
            onExit();
            return true;
          }
          return false;
        }
        goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [active, goBack, onExit, routes.length]);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [route]);
  const load = useCallback(async (): Promise<Result> => {
    if (tab === 'videos') return { kind: 'words', result: empty, word: null };
    if (route.kind === 'word')
      return { kind: 'word', word: await dictionaryService.word(route.id) };
    if (route.kind === 'character')
      return {
        kind: 'character',
        character: await dictionaryService.character(route.literal),
      };
    if (route.kind === 'kanji') {
      const matches = route.query
        ? await dictionaryService.kanji(route.query, route.page)
        : empty;
      return {
        kind: 'kanji',
        result: matches,
        character: matches.items[0]
          ? await dictionaryService.character(matches.items[0].literal)
          : null,
      };
    }
    const matches =
      route.query && route.query.length <= 100
        ? await dictionaryService.words(route.query, route.page)
        : empty;
    const exact = matches.items.some(
      item =>
        item.match_type === 'exact' ||
        item.word.normalize('NFKC') === route.query.normalize('NFKC') ||
        item.reading === route.query,
    );
    if (!exact && isSentenceQuery(route.query)) {
      const source =
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
          route.query,
        )
          ? 'ja'
          : 'vi';
      return {
        kind: 'translation',
        translation: await sentenceTranslationService.translate(
          route.query,
          source,
          source === 'ja' ? 'vi' : 'ja',
        ),
      };
    }
    const primary = matches.items[0];
    return {
      kind: 'words',
      result: matches,
      word: primary ? await dictionaryService.word(primary.id) : null,
    };
  }, [route, tab]);
  const { state, reload } = useRemoteResource(load);
  const result = state.status === 'ready' ? state.data : null;
  const displayedWord =
    result?.kind === 'word' || result?.kind === 'words' ? result.word : null;
  const displayedCharacter =
    result?.kind === 'character' || result?.kind === 'kanji'
      ? result.character
      : null;
  useRecordDictionaryHistory('word', displayedWord?.id, active);
  useRecordDictionaryHistory('kanji', displayedCharacter?.literal, active);
  const openHistory = useCallback(
    (item: DictionaryHistoryItem) => {
      setHistoryOpen(false);
      if (!web) setTab(item.kind === 'kanji' ? 'kanji' : 'words');
      setText(item.word);
      push(
        item.kind === 'kanji'
          ? { kind: 'character', literal: item.target, input: item.word }
          : { kind: 'word', id: item.target, input: item.word },
      );
    },
    [push, setHistoryOpen, web],
  );
  const kanjiContext = useMemo(
    () =>
      result?.kind === 'kanji' && route.kind === 'kanji'
        ? { ...result.result, query: route.query }
        : route.kind === 'character'
        ? route.context
        : undefined,
    [result, route],
  );
  const context = useMemo(
    () =>
      result?.kind === 'words' && route.kind === 'words'
        ? { ...result.result, query: route.query }
        : route.kind === 'word'
        ? route.context
        : undefined,
    [result, route],
  );
  const openWord = useCallback(
    (id: string) => {
      if (id !== displayedWord?.id) push({ kind: 'word', id, context });
    },
    [context, displayedWord?.id, push],
  );
  const openKanji = useCallback(
    (literal: string) => {
      if (literal !== displayedCharacter?.literal)
        push({ kind: 'character', literal, context: kanjiContext });
    },
    [displayedCharacter?.literal, kanjiContext, push],
  );
  const searchWords = (value: string) => {
    if (!web) setTab('words');
    setText(value);
    push({ kind: 'words', query: value, page: 1 });
  };
  const searchVideos = (value: string) => {
    const next = value.trim().slice(0, 100);
    if (web) web.navigate('/lookup/videos?q=' + encodeURIComponent(next));
    else setVideoQuery(next);
  };
  const submit = () => {
    if (!text.trim()) return;
    setHistoryOpen(false);
    Keyboard.dismiss();
    if (activeTab === 'videos') {
      searchVideos(text);
      return;
    }
    if (listRoute && route.kind === activeTab && route.query === text.trim())
      return;
    push({ kind: activeTab, query: text.trim(), page: 1 });
  };
  const selectTab = (next: Tab) => {
    setHistoryOpen(false);
    Keyboard.dismiss();
    if (web) {
      web.navigate(
        next === 'videos'
          ? '/lookup/videos?q=' + encodeURIComponent(text.trim().slice(0, 100))
          : '/lookup?' +
              new URLSearchParams({
                kind: next,
                q: text.trim().slice(0, next === 'words' ? 500 : 100),
              }),
      );
      return;
    }
    setTab(next);
    if (next === 'videos') setVideoQuery(text.trim().slice(0, 100));
    if (next !== 'videos')
      setRoutes([
        { kind: next, query: '', page: 1 },
        ...(text.trim()
          ? [
              {
                kind: next,
                query: text.trim().slice(0, next === 'words' ? 500 : 100),
                page: 1,
              },
            ]
          : []),
      ]);
  };
  const tabs = (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Loại tra cứu"
      style={styles.tabs}
    >
      {(['words', 'kanji', 'videos'] as const).map(value => (
        <Pressable
          key={value}
          accessibilityRole="tab"
          accessibilityLabel={tabNames[value]}
          accessibilityState={{ selected: activeTab === value }}
          onPress={() => selectTab(value)}
          style={({ pressed }) => [
            styles.tab,
            activeTab === value && styles.activeTab,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[styles.label, activeTab === value && styles.activeTabText]}
          >
            {tabNames[value]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const toolbar = (
    <View style={styles.toolbar} testID="dictionary-toolbar">
      {tabs}
    </View>
  );
  const header = (
    <View style={styles.details}>
      {!compact ? (
        <View style={styles.details}>
          <Text accessibilityRole="header" style={styles.title}>
            Tra cứu
          </Text>
          <Text style={styles.body}>Từ điển tiếng Nhật và Hán tự</Text>
        </View>
      ) : null}
      <View ref={searchContainerRef} style={styles.searchContainer}>
        <View style={[styles.search, focused && styles.searchFocused]}>
          <HomeFeatureIcon
            name="search"
            size={20}
            color={focused ? colors.focus : colors.muted}
          />
          <TextInput
            accessibilityLabel={
              activeTab === 'kanji' ? 'Tìm Hán tự' : 'Tìm từ điển'
            }
            placeholder={
              activeTab === 'kanji'
                ? 'Chữ Hán, âm Hán Việt, Onyomi hoặc Kunyomi'
                : 'Nhập từ hoặc câu cần tra cứu'
            }
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.primaryText}
            value={text}
            onChangeText={setText}
            maxLength={
              activeTab === 'kanji' || activeTab === 'videos' ? 100 : 500
            }
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => {
              setFocused(true);
              setHistoryOpen(true);
            }}
            onPressIn={() => setHistoryOpen(true)}
            {...(Platform.OS === 'web'
              ? { onClick: () => setHistoryOpen(true) }
              : {})}
            onBlur={() => {
              if (Platform.OS !== 'web') {
                setFocused(false);
                setHistoryOpen(false);
              }
            }}
            onKeyPress={event => {
              if (event.nativeEvent.key === 'Escape') setHistoryOpen(false);
            }}
            returnKeyType="search"
            onSubmitEditing={submit}
            style={styles.input}
          />
          <View style={styles.searchTools}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Viết tay"
              {...(Platform.OS === 'web' ? { title: 'Viết tay' } : {})}
              onPress={() => {
                Keyboard.dismiss();
                setHistoryOpen(false);
                setHandwritingOpen(true);
              }}
              style={({ pressed }) => [
                styles.handwritingButton,
                pressed && styles.handwritingPressed,
              ]}
            >
              <HandwritingIcon size={26} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tìm kiếm từ điển"
            disabled={!text.trim()}
            accessibilityState={{ disabled: !text.trim() }}
            onPress={submit}
            style={[styles.submit, !!text.trim() && styles.submitActive]}
          >
            <HomeFeatureIcon
              name="arrow"
              size={20}
              color={text.trim() ? colors.onPrimary : colors.disabledText}
            />
          </Pressable>
        </View>
        <DictionaryRecentHistory
          active={active}
          visible={historyOpen && activeTab !== 'videos'}
          query={text}
          onOpen={openHistory}
        />
      </View>
      {toolbar}
      {activeTab !== 'videos' ? (
        <>
          {routes.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại từ điển"
              onPress={goBack}
              style={styles.back}
            >
              <ChevronLeftIcon size={18} color={colors.focus} />
              <Text style={styles.link}>Quay lại</Text>
            </Pressable>
          ) : null}
          {state.status === 'loading' ? (
            <ActivityIndicator
              accessibilityLabel="Đang tải từ điển"
              color={colors.focus}
            />
          ) : null}
          {state.status === 'error' ? (
            <>
              <AuthNotice error message={state.message} />
              <AuthButton label="Thử lại" variant="outline" onPress={reload} />
            </>
          ) : null}
          {result?.kind === 'translation' ? (
            <SentenceTranslation result={result.translation} active={active} />
          ) : null}
          {displayedWord ? (
            <WordWorkspace
              active={active}
              key={displayedWord.id}
              word={displayedWord}
              context={context}
              wide={wide}
              onKanji={openKanji}
              onWord={openWord}
              onPage={page =>
                setRoutes(previous => [
                  ...previous.slice(0, -1),
                  { kind: 'words', query: context?.query || text.trim(), page },
                ])
              }
            />
          ) : null}
          {displayedCharacter ? (
            <KanjiWorkspace
              character={displayedCharacter}
              context={kanjiContext}
              wide={wide}
              onKanji={openKanji}
              onWord={openWord}
              onSearch={searchWords}
              onPage={page =>
                setRoutes(previous => [
                  ...previous.slice(0, -1),
                  {
                    kind: 'kanji',
                    query: kanjiContext?.query || text.trim(),
                    page,
                  },
                ])
              }
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
  const handwriting =
    handwritingOpen && active ? (
      <HandwritingLookup
        onClose={() => setHandwritingOpen(false)}
        onSelect={character => {
          setHandwritingOpen(false);
          const next = (text + character).slice(
            0,
            activeTab === 'words' ? 500 : 100,
          );
          if (activeTab === 'videos') {
            setText(next);
            searchVideos(next);
          } else if (/^[\p{Script=Han}々]$/u.test(next)) {
            if (!web) setTab('kanji');
            setText(next);
            push({ kind: 'kanji', query: next, page: 1 });
          } else searchWords(next);
        }}
      />
    ) : null;
  if (activeTab === 'videos')
    return (
      <View style={styles.fill}>
        <View
          style={[
            styles.videoHeader,
            !compact && { paddingTop: insets.top + spacing.lg },
          ]}
        >
          {header}
        </View>
        {handwriting}
        {renderVideos(videoQuery)}
      </View>
    );
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {handwriting}
      <FlatList
        ref={listRef}
        data={[]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: compact
              ? spacing.md
              : Platform.OS === 'android'
              ? insets.top + spacing.lg
              : spacing.lg,
            paddingBottom: navigationInset + spacing.section,
          },
        ]}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={historyOpen ? styles.historyLayer : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        renderItem={() => null}
        ListEmptyComponent={
          state.status === 'ready' &&
          listRoute &&
          !displayedWord &&
          result?.kind !== 'translation' &&
          !displayedCharacter ? (
            <View style={styles.empty}>
              <HomeFeatureIcon name="search" size={40} color={colors.muted} />
              <Text style={styles.heading}>
                {route.query
                  ? 'Không tìm thấy kết quả'
                  : 'Bạn muốn tra từ nào?'}
              </Text>
              <Text style={styles.body}>
                {route.query
                  ? 'Thử cách viết, cách đọc hoặc từ khóa khác.'
                  : activeTab === 'kanji'
                  ? 'Ví dụ: 学, がく hoặc học.'
                  : 'Ví dụ: 日本, にほん, nihon hoặc Nhật Bản.'}
              </Text>
            </View>
          ) : undefined
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  entryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryWord: { flex: 1 },
  kanjiTitle: {
    ...typography.title,
    fontSize: 56,
    lineHeight: 72,
    color: colors.focus,
  },
  pronunciation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xl,
  },
  kanjiInformation: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 0,
    gap: spacing.xxl,
  },
  kanjiHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  kanjiIdentity: { flexBasis: 88, gap: spacing.lg },
  kanjiReadings: { flexGrow: 1, flexBasis: 160, minWidth: 0, gap: spacing.xl },
  kanjiReading: { ...typography.heading, color: colors.focus, flexShrink: 1 },
  kanjiStrokePanel: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  kanjiFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  fact: { alignItems: 'flex-start', gap: spacing.sm },
  kanjiToggle: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  kanjiDetailLink: { minHeight: layout.touchTarget, justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  workspace: { gap: spacing.lg, alignItems: 'stretch' },
  workspaceWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  primaryColumn: { flex: 1, minWidth: 0 },
  sideColumn: { gap: spacing.lg, minWidth: 0 },
  sideColumnWide: { width: 300, flexShrink: 0 },
  entryCard: { gap: spacing.xxl },
  entrySection: {
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  mainWord: {
    ...typography.title,
    fontSize: 36,
    lineHeight: 48,
    color: colors.focus,
  },
  sideWord: {
    ...typography.heading,
    fontSize: 20,
    lineHeight: 28,
    color: colors.focus,
  },
  sideRow: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  selectedSideRow: {
    backgroundColor: colors.surfaceTint,
    borderLeftWidth: 2,
    borderLeftColor: colors.focus,
    paddingHorizontal: spacing.md,
    borderRadius: radius.small,
  },
  fill: { flex: 1, minHeight: 0 },
  flex: { flex: 1, minWidth: 0, gap: spacing.sm },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: spacing.lg,
    flexGrow: 1,
  },
  videoHeader: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.md,
  },
  title: { ...typography.title, color: colors.dark },
  heading: { ...typography.heading, color: colors.dark },
  label: { ...typography.label, color: colors.body },
  body: { ...typography.body, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  link: { ...typography.link, color: colors.focus },
  details: { gap: spacing.lg },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    padding: spacing.xl,
    gap: spacing.md,
    boxShadow: shadowSm,
  },
  pressed: { backgroundColor: colors.surfaceTint },
  word: {
    ...typography.heading,
    fontSize: 22,
    lineHeight: 32,
    color: colors.dark,
  },
  largeWord: {
    ...typography.title,
    fontSize: 32,
    lineHeight: 44,
    color: colors.dark,
  },
  character: { fontSize: 64, lineHeight: 88, color: colors.dark },
  reading: { ...typography.label, color: colors.focus },
  japanese: { ...typography.label, lineHeight: 24, color: colors.dark },
  badge: {
    ...typography.caption,
    color: colors.badgeText,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  tabs: { flexDirection: 'row', gap: spacing.xs },
  tab: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: colors.focus },
  activeTabText: { color: colors.focus },
  historyLayer: { zIndex: 30 },
  searchContainer: { position: 'relative', zIndex: 30 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.inputHeight,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  searchFocused: { borderColor: colors.focus },
  searchTools: {
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
    paddingLeft: spacing.sm,
  },
  handwritingButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  handwritingPressed: { backgroundColor: colors.surfaceTint },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.inputHeight - 2,
    paddingVertical: spacing.md,
    ...typography.input,
    color: colors.inputText,
  },
  submit: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitActive: { backgroundColor: colors.primary },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    alignSelf: 'flex-start',
  },
  sense: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kanjiChip: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.section,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import {
  ActivityIndicator,
  Share,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, typography, radius, spacing, shadowSm } from '../theme/theme';
import { AppBackground } from '../components/AppBackground';
import { AuthField } from '../components/AuthForm';
import { useWebNavigation } from '../navigation/webNavigation';
import { useCastleOnline } from '../games/castle/useCastleOnline';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { useDefaultJlptLevel } from '../hooks/useLearningLevel';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { gameService, GameCatalog } from '../services/gameService';
import { CastleScene } from '../games/castle/CastleScene';
import {
  CastleQuestion,
  CastleWord,
  makeQuestion,
  romanize,
  starterWords,
} from '../games/castle/data';
import { Difficulty, Side, TIERS, tierFor } from '../games/castle/engine';
import { MomoGameSprite } from '../games/castle/MomoGameSprite';
import { useCastleGame } from '../games/castle/useCastleGame';

const gold = colors.primary;
const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
const percent = (value: number): DimensionValue =>
  (Math.min(100, Math.max(0, value)) + '%') as DimensionValue;
const difficulties: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Dễ' },
  { id: 'normal', label: 'Vừa' },
  { id: 'hard', label: 'Khó' },
];
function Glyph({
  kind,
  color = colors.primary,
}: {
  kind: 'castle' | 'settings' | 'pause' | 'arrow' | 'shield' | 'close';
  color?: string;
}) {
  const paths = {
    castle: 'M3 21V10h4V6h3V3h4v3h3v4h4v11H3m5 0v-5h8v5M2 10h20M6 6h12M9 3h6',
    settings:
      'm10 3 4 0 1 3 3-1 2 3-2 3 2 3-2 3-3-1-1 3h-4l-1-3-3 1-2-3 2-3-2-3 2-3 3 1 1-3M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
    pause: 'M8 5v14M16 5v14',
    arrow: 'M5 19 19 5M10 5h9v9M5 14v5h5',
    shield: 'M12 3 20 6v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d={paths[kind]}
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        selected && s.selected,
        pressed && s.pressed,
        selected && pressed && s.selectedPressed,
        disabled && s.disabled,
      ]}
    >
      <Text style={[s.chipText, selected && s.selectedText]}>{label}</Text>
    </Pressable>
  );
}
function IconButton({
  kind,
  label,
  onPress,
}: {
  kind: Parameters<typeof Glyph>[0]['kind'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, pressed && s.pressed]}
    >
      <Glyph kind={kind} />
    </Pressable>
  );
}
const timeLabel = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return (
    String(Math.floor(seconds / 60)) +
    ':' +
    String(seconds % 60).padStart(2, '0')
  );
};

export function CastleGameScreen({
  userId,
  onExit,
  initialCode,
  forceBot = false,
  sharedRoom = false,
}: {
  userId: string;
  onExit: () => void;
  initialCode?: string;
  forceBot?: boolean;
  sharedRoom?: boolean;
}) {
  const defaultLevel = useDefaultJlptLevel();
  const [level, setLevel] = useState<string>(defaultLevel),
    [topic, setTopic] = useState('Tất cả');
  const [mode, setMode] = useState<'bot' | 'online'>(
      forceBot ? 'bot' : 'online',
    ),
    [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [source, setSource] = useState<'starter' | 'lesson'>('starter'),
    [lessonId, setLessonId] = useState('');
  const [catalog, setCatalog] = useState<GameCatalog | null>(null),
    [catalogPage, setCatalogPage] = useState(1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [quitOpen, setQuitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false),
    [reviewIndex, setReviewIndex] = useState(0),
    [reviewAnswer, setReviewAnswer] = useState<number | null>(null);
  const [reviewWords, setReviewWords] = useState<CastleWord[]>([]),
    [reviewQuestion, setReviewQuestion] = useState<CastleQuestion | null>(null);
  const game = useCastleGame(userId);
  const online = useCastleOnline(initialCode, game.applyOnline);
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const web = useWebNavigation(),
    nav = useRef(web);
  nav.current = web;
  const [joinCode, setJoinCode] = useState(''),
    [copied, setCopied] = useState(false);
  const mySide: Side = online.room?.me ?? 0;
  const routeRoom = (code: string) => {
    if (nav.current && nav.current.pathname !== '/games/' + code)
      nav.current.navigate('/games/' + code);
  };
  const joinRoom = async () => {
    game.prepareAudio();
    const room = await online.connect(joinCode);
    if (room) routeRoom(room.code);
  };
  const copyRoom = async () => {
    const code = online.room?.code;
    if (!code) return;
    const message =
      (Platform.OS === 'web' ? location.origin : 'https://momonihongo.app') +
      '/games/' +
      code;
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(message);
      else await Share.share({ message });
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const performAnswer = (side: Side, index: number, id?: number) => {
    if (online.room) {
      if (online.connected && !online.busy)
        online.action('answer', { index, round_id: id });
    } else game.answer(side, index, id);
  };
  const performSkill = (side: Side, kind: 'arrow' | 'shield') => {
    if (online.room) {
      if (online.connected && !online.busy) online.action('skill', { kind });
    } else game.skill(side, kind);
  };
  const battle = game.battleRef.current,
    settings = game.progress.settings;
  const { width } = useWindowDimensions();
  const compact = width < 700,
    bottom = useBottomNavigationInset();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const requestState = useRef({ version: 0 }).current;
  useEffect(() => {
    requestState.version++;
    return () => {
      requestState.version++;
    };
  }, [
    requestState,
    source,
    level,
    topic,
    lessonId,
    mode,
    difficulty,
    settings.roundSeconds,
  ]);
  const available = starterWords.filter(word => word.level === level);
  const topics = ['Tất cả', ...new Set(available.map(word => word.category))];
  const words = available.filter(
    word => topic === 'Tất cả' || word.category === topic,
  );
  const finished = battle?.phase === 'finished',
    active = Boolean(battle && !finished);
  useEffect(() => {
    if (source !== 'lesson' || battle) return;
    let valid = true;
    setBusy(true);
    setError('');
    setCatalog(null);
    gameService
      .catalog(level, catalogPage)
      .then(value => {
        if (valid) setCatalog(value);
      })
      .catch(failure => {
        if (valid)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không tải được danh sách bài học.',
          );
      })
      .finally(() => {
        if (valid) setBusy(false);
      });
    return () => {
      valid = false;
    };
  }, [source, level, catalogPage, battle, retry]);
  const start = async () => {
    if (busy) return;
    const request = ++requestState.version;
    setBusy(true);
    setError('');
    try {
      if (mode === 'online') {
        game.prepareAudio();
        const room = await online.create({
          level,
          source,
          topic,
          lesson_id: source === 'lesson' ? lessonId : undefined,
          round_seconds: settings.roundSeconds,
        });
        if (room) routeRoom(room.code);
        return;
      }
      let pool = available;
      let targets = words;
      if (source === 'lesson') {
        if (!lessonId) throw new Error('Bạn hãy chọn một bài học.');
        const response = await gameService.castleWords(level, lessonId);
        if (request !== requestState.version) return;
        pool = response.words.map(word => ({
          ...word,
          romaji: romanize(word.hiragana),
        }));
        targets = pool;
      }
      game.start({
        mode,
        difficulty,
        roundSeconds: settings.roundSeconds,
        words: pool,
        targets,
        names: ['Bạn', 'Momo'],
      });
      scroll.current?.scrollTo({ y: 0, animated: false });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Chưa bắt đầu được trận đấu.',
      );
    } finally {
      setBusy(false);
    }
  };
  const pause = game.pause;
  const displayedQuestionId = battle?.question?.id;
  const leave = useCallback(() => {
    if (battle && !finished) {
      pause();
      setQuitOpen(true);
    } else {
      onlineRef.current.leave().then(onExit);
    }
  }, [battle, finished, pause, onExit]);
  const controls = useRef({
    answer: (side: Side, index: number) =>
      performAnswer(side, index, displayedQuestionId),
    skill: performSkill,
    pause: game.pause,
    resume: game.resume,
  });
  controls.current = {
    answer: (side: Side, index: number) =>
      performAnswer(side, index, displayedQuestionId),
    skill: performSkill,
    pause: game.pause,
    resume: game.resume,
  };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keys = (event: KeyboardEvent) => {
      const current = game.battleRef.current;
      if (
        !current ||
        (current.config.mode === 'online' &&
          (!onlineRef.current.connected || onlineRef.current.busy)) ||
        current.phase === 'finished' ||
        event.repeat ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        (event.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        current.paused ? controls.current.resume() : controls.current.pause();
        return;
      }
      const p1 = ['1', '2', '3', '4'].indexOf(event.key),
        p2 = ['7', '8', '9', '0'].indexOf(event.key);
      if (p1 >= 0) {
        event.preventDefault();
        controls.current.answer(0, p1);
      } else if (p2 >= 0 && current.config.mode === 'local') {
        event.preventDefault();
        controls.current.answer(1, p2);
      } else if (event.key.toLowerCase() === 'q')
        controls.current.skill(0, 'arrow');
      else if (event.key.toLowerCase() === 'e')
        controls.current.skill(0, 'shield');
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [game.battleRef]);
  const openReview = (items: CastleWord[]) => {
    if (!items.length) return;
    const pool = [
      ...new Map(
        [...starterWords, ...(battle?.config.words || []), ...items].map(
          word => [word.id, word],
        ),
      ).values(),
    ];
    setReviewWords(items);
    setReviewIndex(0);
    setReviewAnswer(null);
    setReviewQuestion(makeQuestion(items[0], pool, 0, 'reading'));
    setReviewOpen(true);
  };
  const nextReview = () => {
    const next = reviewIndex + 1;
    if (next >= reviewWords.length) {
      setReviewOpen(false);
      return;
    }
    setReviewIndex(next);
    setReviewAnswer(null);
    setReviewQuestion(
      makeQuestion(
        reviewWords[next],
        [...starterWords, ...(battle?.config.words || []), ...reviewWords],
        next,
        next % 2 ? 'meaning' : 'reading',
      ),
    );
  };
  const chooseReview = (index: number) => {
    setReviewAnswer(index);
    if (reviewQuestion && index === reviewQuestion.correct)
      game.persist({
        ...game.progress,
        mistakes: game.progress.mistakes.filter(
          word => word.id !== reviewQuestion.word.id,
        ),
      });
  };
  const overlay = (
    visible: boolean,
    title: string,
    close: () => void,
    children: ReactNode,
  ) => (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={s.backdrop}>
        <AppBackground />
        <View
          accessibilityViewIsModal
          role="dialog"
          aria-label={title}
          style={s.dialog}
        >
          <View style={s.rowBetween}>
            <Text style={s.sectionTitle}>{title}</Text>
            <IconButton kind="close" label="Đóng" onPress={close} />
          </View>
          <ScrollView
            style={s.dialogScroll}
            contentContainerStyle={s.dialogContent}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
  const answerPanel = (side: Side) => {
    if (!battle?.question) return null;
    const player = battle.players[side],
      question = battle.question,
      reveal = battle.players.every(p => p.choice);
    return (
      <View style={[s.answerPanel, side === 1 && s.bluePanel]} key={side}>
        <View style={s.rowBetween}>
          <Text style={s.playerName}>{player.name}</Text>
          <Text style={s.small}>
            {player.choice
              ? player.choice.correct
                ? 'Chính xác!'
                : player.choice.timeout
                ? 'Hết giờ'
                : 'Chưa đúng'
              : 'Chọn một đáp án'}
          </Text>
        </View>
        <View style={s.answers}>
          {question.options.map((option, index) => {
            const chosen = player.choice?.index === index,
              correct =
                Boolean(chosen && player.choice?.correct) ||
                (reveal && index === question.correct),
              wrong = chosen && !player.choice?.correct;
            return (
              <Pressable
                key={String(question.id) + '-' + index}
                accessibilityRole="button"
                accessibilityLabel={'Bạn: ' + option}
                disabled={
                  (Boolean(online.room) &&
                    (!online.connected || online.busy)) ||
                  Boolean(player.choice) ||
                  battle.phase !== 'battle' ||
                  battle.paused
                }
                onPress={() => performAnswer(side, index, question.id)}
                style={({ pressed }) => [
                  s.answer,
                  correct && s.correct,
                  wrong && s.wrong,
                  chosen && s.chosen,
                  pressed && s.pressed,
                ]}
              >
                <Text style={s.answerKey}>{index + 1}</Text>
                <Text
                  style={[
                    s.answerText,
                    question.kind === 'meaning' && s.meaningText,
                  ]}
                >
                  {option}
                </Text>
                {correct ? (
                  <Text style={s.answerKey}>✓</Text>
                ) : wrong ? (
                  <Text style={s.answerKey}>×</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <View style={s.rowBetween}>
          <Text style={s.small}>Năng lượng {player.energy}/100</Text>
          <Text style={s.combo}>
            ×{player.combo} · {TIERS[tierFor(player.combo)].name}
          </Text>
        </View>
        <View style={s.energyTrack}>
          <View style={[s.energyFill, { width: percent(player.energy) }]} />
        </View>
        <View style={s.row}>
          {(['arrow', 'shield'] as const).map(kind => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={
                player.name +
                ': ' +
                (kind === 'arrow' ? 'Mưa tên' : 'Khiên bảo vệ')
              }
              disabled={
                player.energy < 100 ||
                battle.paused ||
                battle.phase !== 'battle'
              }
              onPress={() => performSkill(side, kind)}
              style={({ pressed }) => [
                s.skill,
                player.energy < 100 && s.disabled,
                pressed && s.pressed,
              ]}
            >
              <Glyph kind={kind} />
              <Text style={s.chipText}>
                {kind === 'arrow' ? 'Mưa tên' : 'Khiên 5s'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };
  return (
    <ScrollView
      ref={scroll}
      style={s.page}
      contentContainerStyle={[s.pageContent, { paddingBottom: bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenBackHeader
        title="Công thành Momo"
        onBack={leave}
        backLabel={sharedRoom ? 'Về phòng chờ' : 'Quay lại kho game'}
      />
      <View style={s.game}>
        <View style={s.top} testID="castle-top">
          <View style={s.brand}>
            <Glyph kind="castle" color={gold} />
            <Text style={s.brandText}>Công thành Momo</Text>
          </View>
          <View style={s.row}>
            {active && !online.room ? (
              <IconButton
                kind="pause"
                label={battle?.paused ? 'Tiếp tục' : 'Tạm dừng'}
                onPress={() => (battle?.paused ? game.resume() : game.pause())}
              />
            ) : (
              <Chip label="Cách chơi" onPress={() => setHelpOpen(true)} />
            )}
            <IconButton
              kind="settings"
              label="Thiết lập game"
              onPress={() => {
                game.pause();
                setSettingsOpen(true);
              }}
            />
          </View>
        </View>
        {battle ? (
          <View style={s.hud}>
            {battle.players.map((player, side) => (
              <View key={side} style={s.healthColumn}>
                <View style={s.rowBetween}>
                  <View style={s.playerIdentity}>
                    <View style={[s.avatar, side === 1 && s.blueAvatar]}>
                      <MomoGameSprite
                        size={26}
                        tier={tierFor(player.combo)}
                        portrait
                      />
                    </View>
                    <Text style={s.playerName}>{player.name}</Text>
                  </View>
                  <Text style={s.small}>{Math.ceil(player.hp)} HP</Text>
                </View>
                <View style={s.hpTrack}>
                  <View
                    testID="castle-health-fill"
                    style={[
                      s.hpFill,
                      side === 1 && s.blueFill,
                      { width: percent(player.hp) },
                    ]}
                  />
                </View>
                <Text style={s.small}>
                  {player.shieldUntil > battle.now
                    ? 'Khiên đang bảo vệ'
                    : player.correct +
                      ' đúng · combo cao nhất ' +
                      player.bestCombo}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={s.stage}>
          <CastleScene
            battleRef={game.battleRef}
            effectsRef={game.effectsRef}
            height={compact ? 220 : 290}
            reduced={!settings.effects}
          />
          {battle?.phase === 'countdown' ? (
            <View pointerEvents="none" style={s.stageOverlay}>
              <Text style={s.countdown}>
                {Math.max(1, Math.ceil((3000 - battle.now) / 1000))}
              </Text>
              <Text style={s.heroSub}>Sẵn sàng xuất quân</Text>
            </View>
          ) : null}
          {battle?.phase === 'battle' && battle.elapsed < 500 ? (
            <View pointerEvents="none" style={s.stageOverlay}>
              <Text style={s.countdown}>戦え!</Text>
            </View>
          ) : null}
          {battle?.paused && !settingsOpen && !quitOpen ? (
            <View style={s.stageOverlay}>
              <Text style={s.sectionTitle}>Tạm dừng</Text>
              <Chip label="Tiếp tục trận đấu" selected onPress={game.resume} />
            </View>
          ) : null}
          {battle?.phase === 'ending' ? (
            <View pointerEvents="none" style={s.stageOverlay}>
              <Text style={s.heroTitle}>
                {battle.winner === null
                  ? 'Bất phân thắng bại'
                  : battle.players[battle.winner].name + ' chiến thắng'}
              </Text>
            </View>
          ) : null}
        </View>
        {error || online.error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error || online.error}
          </Text>
        ) : null}
        {online.room && !online.connected ? (
          <View style={s.menu}>
            <Text style={s.error}>
              Đang kết nối lại. Trận đấu vẫn tiếp tục trên máy chủ.
            </Text>
            <Chip label="Thử kết nối lại" onPress={() => online.refresh()} />
          </View>
        ) : null}
        {online.room &&
        (online.room.phase === 'waiting' || online.room.phase === 'closed') ? (
          <View style={s.menu}>
            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>Phòng {online.room.code}</Text>
              <Chip
                label={copied ? 'Đã sao chép' : 'Mời bạn'}
                onPress={() => copyRoom()}
              />
            </View>
            <Text selectable style={s.clock}>
              {online.room.code}
            </Text>
            <Text style={s.small}>
              {online.room.level} · {online.room.round_seconds} giây/câu ·{' '}
              {online.room.players.length}/2 người
            </Text>
            {online.room.players.map(player => (
              <View key={player.id} style={s.lesson}>
                <MomoGameSprite size={40} tier={0} />
                <View style={s.lessonText}>
                  <Text style={s.playerName}>
                    {player.name}
                    {player.id === userId ? ' (Bạn)' : ''}
                  </Text>
                  <Text style={s.small}>
                    {player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                  </Text>
                </View>
              </View>
            ))}
            {online.room.phase === 'closed' ? (
              <Text style={s.error}>Chủ phòng đã đóng phòng.</Text>
            ) : (
              <View style={s.row}>
                <Chip
                  label={
                    online.room.players[mySide]?.ready
                      ? 'Hủy sẵn sàng'
                      : 'Sẵn sàng'
                  }
                  selected={online.room.players[mySide]?.ready}
                  disabled={!online.connected || online.busy}
                  onPress={() => {
                    game.prepareAudio();
                    online.action('ready', {
                      ready: !online.room?.players[mySide]?.ready,
                    });
                  }}
                />
                {online.room.host_id === userId ? (
                  <Chip
                    label="Bắt đầu trận"
                    selected
                    disabled={
                      !online.connected ||
                      online.busy ||
                      online.room.players.length !== 2 ||
                      !online.room.players.every(player => player.ready)
                    }
                    onPress={() => {
                      game.prepareAudio();
                      online.action('start');
                    }}
                  />
                ) : null}
              </View>
            )}
            <Chip
              label="Rời phòng"
              onPress={() => online.leave().then(onExit)}
            />
          </View>
        ) : !battle ? (
          <View style={s.menu}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.sectionTitle}>Thiết lập trận đấu</Text>
                <Text style={s.small}>
                  100 HP · tối đa 3 phút · 4 dạng câu hỏi
                </Text>
              </View>
              <Text style={s.best}>
                Kỷ lục {game.progress.best[level] || 0}
              </Text>
            </View>
            <View style={s.row}>
              <Chip
                label="Đấu máy"
                selected={mode === 'bot'}
                onPress={() => setMode('bot')}
              />
              {!forceBot ? (
                <Chip
                  label="Chơi online"
                  selected={mode === 'online'}
                  onPress={() => setMode('online')}
                />
              ) : null}
            </View>
            {mode === 'bot' ? (
              <View style={s.row}>
                {difficulties.map(item => (
                  <Chip
                    key={item.id}
                    label={item.label}
                    selected={difficulty === item.id}
                    onPress={() => setDifficulty(item.id)}
                  />
                ))}
              </View>
            ) : (
              <Text style={s.small}>
                Tạo phòng hoặc nhập mã để đấu với bạn bè.
              </Text>
            )}
            <View style={s.divider} />
            <Text style={s.label}>Trình độ</Text>
            <View style={s.row}>
              {levels.map(item => (
                <Chip
                  key={item}
                  label={item}
                  selected={level === item}
                  onPress={() => {
                    setLevel(item);
                    setTopic('Tất cả');
                    setLessonId('');
                    setCatalogPage(1);
                  }}
                />
              ))}
            </View>
            <View style={s.row}>
              <Chip
                label="Bộ từ khởi động"
                selected={source === 'starter'}
                onPress={() => setSource('starter')}
              />
              <Chip
                label="Bài học của app"
                selected={source === 'lesson'}
                onPress={() => setSource('lesson')}
              />
            </View>
            {source === 'starter' ? (
              <>
                <View style={s.row}>
                  {topics.map(item => (
                    <Chip
                      key={item}
                      label={item}
                      selected={topic === item}
                      onPress={() => setTopic(item)}
                    />
                  ))}
                </View>
                <Text style={s.small}>
                  {words.length} từ ·{' '}
                  {words
                    .slice(0, 5)
                    .map(word => word.kanji)
                    .join(' / ')}
                </Text>
              </>
            ) : (
              <>
                {busy ? <ActivityIndicator color={gold} /> : null}
                {catalog?.lessons.map(lesson => (
                  <Pressable
                    key={lesson.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: lessonId === lesson.id }}
                    onPress={() => setLessonId(lesson.id)}
                    style={[
                      s.lesson,
                      lessonId === lesson.id && s.selectedLesson,
                    ]}
                  >
                    <View style={s.lessonText}>
                      <Text style={s.playerName}>{lesson.title}</Text>
                      <Text style={s.small}>{lesson.textbook}</Text>
                    </View>
                    <Text style={s.small}>{lesson.word_count} từ</Text>
                  </Pressable>
                ))}
                {catalog && !catalog.lessons.length ? (
                  <Text style={s.small}>Chưa có bài học ở trình độ này.</Text>
                ) : null}
                <View style={s.row}>
                  <Chip
                    label="←"
                    disabled={catalogPage <= 1 || busy}
                    onPress={() => {
                      setLessonId('');
                      setCatalogPage(n => n - 1);
                    }}
                  />
                  <Text style={s.small}>
                    Trang {catalogPage}/{Math.max(1, catalog?.total_pages || 1)}
                  </Text>
                  <Chip
                    label="→"
                    disabled={
                      busy || catalogPage >= (catalog?.total_pages || 1)
                    }
                    onPress={() => {
                      setLessonId('');
                      setCatalogPage(n => n + 1);
                    }}
                  />
                </View>
                {error ? (
                  <Chip
                    label="Thử tải lại"
                    onPress={() => setRetry(n => n + 1)}
                  />
                ) : null}
              </>
            )}
            {mode === 'online' ? (
              <View style={s.lesson}>
                <View style={s.lessonText}>
                  <AuthField
                    label="Mã phòng Công thành"
                    value={joinCode}
                    onChangeText={setJoinCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={() => joinRoom()}
                  />
                </View>
                <Chip
                  label="Vào phòng"
                  disabled={online.busy}
                  onPress={() => joinRoom()}
                />
              </View>
            ) : null}
            <View style={s.rowBetween}>
              <Pressable
                accessibilityRole="button"
                disabled={
                  busy ||
                  !game.ready ||
                  online.busy ||
                  (source === 'lesson' && !lessonId)
                }
                onPress={start}
                style={({ pressed }) => [
                  s.startButton,
                  pressed && s.pressed,
                  (busy || !game.ready || (source === 'lesson' && !lessonId)) &&
                    s.disabled,
                ]}
              >
                <Glyph kind="castle" color={colors.onPrimary} />
                <Text style={s.startText}>
                  {busy || online.busy
                    ? 'Đang chuẩn bị…'
                    : mode === 'online'
                    ? 'Tạo phòng'
                    : 'Xuất quân'}
                </Text>
              </Pressable>
              <Chip
                label={'Ôn từ sai · ' + game.progress.mistakes.length}
                disabled={!game.progress.mistakes.length}
                onPress={() => openReview(game.progress.mistakes)}
              />
            </View>
          </View>
        ) : finished ? (
          <View style={s.menu}>
            <Text style={s.eyebrow}>KẾT THÚC TRẬN ĐẤU</Text>
            <Text style={s.resultTitle}>
              {battle.winner === null
                ? 'Hòa trận'
                : battle.players[battle.winner].name + ' chiến thắng!'}
            </Text>
            <Text style={s.small}>
              {battle.reason} · {timeLabel(battle.elapsed)} · {battle.round} câu
            </Text>
            <View style={[s.statsRow, compact && s.stack]}>
              {battle.players.map((player, index) => (
                <View key={index} style={s.statsCard}>
                  <Text style={s.sectionTitle}>{player.name}</Text>
                  <View style={s.rowBetween}>
                    <Text style={s.small}>Đúng / chưa đúng</Text>
                    <Text style={s.playerName}>
                      {player.correct} / {player.wrong}
                    </Text>
                  </View>
                  <View style={s.rowBetween}>
                    <Text style={s.small}>Combo cao nhất</Text>
                    <Text style={s.playerName}>×{player.bestCombo}</Text>
                  </View>
                  <View style={s.rowBetween}>
                    <Text style={s.small}>Trả lời trung bình</Text>
                    <Text style={s.playerName}>
                      {player.responses.length
                        ? (
                            player.responses.reduce((a, b) => a + b, 0) /
                            player.responses.length /
                            1000
                          ).toFixed(1) + 's'
                        : '—'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={s.best}>
              Kỷ lục {game.progress.best[battle.config.words[0].level] || 0}{' '}
              điểm
            </Text>
            <View style={s.row}>
              <Chip
                label={
                  online.room
                    ? sharedRoom
                      ? 'Về phòng chờ'
                      : 'Về Kho game'
                    : 'Chơi lại'
                }
                selected
                onPress={() => {
                  if (online.room) {
                    online.leave().then(onExit);
                    return;
                  }
                  game.start(battle.config);
                  scroll.current?.scrollTo({ y: 0, animated: false });
                }}
              />
              {!online.room ? (
                <Chip label="Đổi bộ từ" onPress={game.quit} />
              ) : null}
              <Chip
                label={'Ôn ' + battle.mistakes[mySide].size + ' từ sai'}
                disabled={!battle.mistakes[mySide].size}
                onPress={() =>
                  openReview([...battle.mistakes[mySide].values()])
                }
              />
            </View>
            {battle.mistakes[mySide].size ? (
              <>
                <Text style={s.label}>Từ cần ôn</Text>
                {[...battle.mistakes[mySide].values()].map(word => (
                  <View key={word.id} style={s.reviewWord}>
                    <Text style={s.japaneseWord}>{word.kanji}</Text>
                    <View style={s.lessonText}>
                      <Text style={s.playerName}>
                        {word.hiragana} · {word.romaji}
                      </Text>
                      <Text style={s.small}>{word.meaning}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : battle.question ? (
          <View style={s.playArea}>
            <View style={s.rowBetween}>
              <Text style={s.small}>Câu {battle.round}/60</Text>
              <Text style={s.clock}>{timeLabel(battle.remaining)}</Text>
              <Text style={s.small}>
                {Math.max(0, Math.ceil((battle.deadline - battle.now) / 1000))}{' '}
                giây
              </Text>
            </View>
            <View style={s.questionTrack}>
              <View
                style={[
                  s.questionFill,
                  {
                    width: percent(
                      (battle.deadline - battle.now) /
                        (battle.config.roundSeconds * 10),
                    ),
                  },
                ]}
              />
            </View>
            <View style={s.question}>
              <Text style={s.questionInstruction}>
                {battle.question.instruction}
              </Text>
              {battle.question.reading ? (
                <Text style={s.reading}>{battle.question.reading}</Text>
              ) : null}
              <Text style={[s.prompt, s.inkText, compact && s.promptSmall]}>
                {battle.question.prompt}
              </Text>
              {battle.players.every(player => player.choice) ? (
                <Text style={s.reveal}>
                  {battle.question.word.kanji} · {battle.question.word.hiragana}{' '}
                  · {battle.question.word.meaning}
                </Text>
              ) : null}
            </View>
            <View style={[s.answerColumns, compact && s.stack]}>
              {answerPanel(mySide)}
              <View style={s.botStatus}>
                <Text style={s.small}>
                  {online.room
                    ? battle.players[1 - mySide].choice
                      ? 'Đối thủ đã trả lời.'
                      : 'Đang chờ đối thủ trả lời…'
                    : battle.players[1].choice
                    ? battle.players[1].choice.correct
                      ? 'Momo đã gọi quân.'
                      : 'Momo trả lời chưa đúng.'
                    : 'Momo đang suy nghĩ…'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
        {game.storageError ? (
          <Text style={s.error}>{game.storageError}</Text>
        ) : null}
      </View>
      {overlay(
        settingsOpen,
        'Thiết lập',
        () => setSettingsOpen(false),
        <>
          {(['sound', 'music', 'effects'] as const).map(key => (
            <View key={key} style={s.rowBetween}>
              <Text style={s.playerName}>
                {key === 'sound'
                  ? 'Âm thanh'
                  : key === 'music'
                  ? 'Nhạc nền'
                  : 'Hiệu ứng chuyển động'}
              </Text>
              <Chip
                label={settings[key] ? 'Bật' : 'Tắt'}
                selected={settings[key]}
                onPress={() =>
                  game.persist({
                    ...game.progress,
                    settings: { ...settings, [key]: !settings[key] },
                  })
                }
              />
            </View>
          ))}
          <Text style={s.label}>Thời gian mỗi câu · áp dụng trận sau</Text>
          <View style={s.row}>
            {([8, 9, 10] as const).map(seconds => (
              <Chip
                key={seconds}
                label={seconds + 's'}
                selected={settings.roundSeconds === seconds}
                onPress={() =>
                  game.persist({
                    ...game.progress,
                    settings: { ...settings, roundSeconds: seconds },
                  })
                }
              />
            ))}
          </View>
        </>,
      )}
      {overlay(
        helpOpen,
        'Cách chơi',
        () => setHelpOpen(false),
        <>
          <Text style={s.help}>
            Chọn đáp án đúng để gọi quân. Trả lời càng nhanh, quân càng mạnh.
            Mỗi người có một lần trả lời cho mỗi câu; sai sẽ mất combo.
          </Text>
          <Text style={s.help}>
            Combo 3 → Momo chiến binh · 5 → Momo tinh nhuệ · 10 → Momo thần
            tướng. Quân gặp nhau sẽ giao chiến; quân sống sót tiến đến thành đối
            phương.
          </Text>
          <Text style={s.help}>
            Đủ 100 năng lượng: dùng Mưa tên để đánh quân địch hoặc Khiên để bảo
            vệ thành trong 5 giây.
          </Text>
          <Text style={s.help}>
            Thành hết HP sẽ thua. Sau 3 phút hoặc 60 câu, bên còn nhiều HP hơn
            thắng.
          </Text>
          <Text style={s.help}>
            Phím 1–4 chọn đáp án · Q mưa tên · E khiên. Esc chỉ tạm dừng khi đấu
            máy. Online cần hai tài khoản; mất kết nối quá 20 giây hoặc rời trận
            sẽ tính là bỏ cuộc.
          </Text>
        </>,
      )}
      {overlay(
        quitOpen,
        'Rời trận đấu?',
        () => setQuitOpen(false),
        <>
          <Text style={s.help}>
            {online.room
              ? 'Rời trận sẽ được tính là bỏ cuộc.'
              : 'Kết quả trận đang chơi sẽ không được lưu.'}
          </Text>
          <View style={s.row}>
            <Chip
              label="Chơi tiếp"
              selected
              onPress={() => {
                setQuitOpen(false);
                game.resume();
              }}
            />
            <Chip
              label="Rời trận"
              onPress={() => {
                setQuitOpen(false);
                game.quit();
                online.leave().then(onExit);
              }}
            />
          </View>
        </>,
      )}
      {overlay(
        reviewOpen,
        'Ôn từ sai · ' + (reviewIndex + 1) + '/' + reviewWords.length,
        () => setReviewOpen(false),
        reviewQuestion ? (
          <>
            <Text style={s.small}>{reviewQuestion.instruction}</Text>
            <Text style={s.prompt}>{reviewQuestion.prompt}</Text>
            {reviewQuestion.options.map((option, index) => (
              <Pressable
                key={index}
                accessibilityRole="button"
                disabled={reviewAnswer !== null}
                onPress={() => chooseReview(index)}
                style={[
                  s.answer,
                  s.reviewOption,
                  reviewAnswer !== null &&
                    index === reviewQuestion.correct &&
                    s.correct,
                  reviewAnswer === index &&
                    index !== reviewQuestion.correct &&
                    s.wrong,
                ]}
              >
                <Text style={s.answerText}>{option}</Text>
              </Pressable>
            ))}
            {reviewAnswer !== null ? (
              <>
                <Text style={s.help}>
                  {reviewQuestion.word.hiragana} · {reviewQuestion.word.romaji}
                  {'\n'}
                  {reviewQuestion.word.meaning}
                </Text>
                <Chip
                  label={
                    reviewIndex + 1 >= reviewWords.length
                      ? 'Hoàn tất'
                      : 'Từ tiếp theo →'
                  }
                  selected
                  onPress={nextReview}
                />
              </>
            ) : null}
          </>
        ) : null,
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  pageContent: {
    padding: spacing.xl,
    gap: spacing.lg,
    width: '100%',
    maxWidth: 1160,
    alignSelf: 'center',
  },
  game: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.divider,
    boxShadow: shadowSm,
  },
  top: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandText: { ...typography.heading, color: colors.dark },
  playerIdentity: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blueAvatar: { backgroundColor: colors.track },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipText: { ...typography.caption, color: colors.primary },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedPressed: { backgroundColor: colors.primaryPressed },
  selectedText: { color: colors.onPrimary },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceTint,
  },
  eyebrow: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  heroTitle: { ...typography.title, color: colors.dark, textAlign: 'center' },
  heroSub: { ...typography.body, color: colors.body, textAlign: 'center' },
  stageOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface + 'E8',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  countdown: {
    ...typography.title,
    fontSize: 56,
    lineHeight: 68,
    color: colors.primary,
  },
  menu: { padding: spacing.xl, gap: spacing.lg },
  sectionTitle: { ...typography.heading, color: colors.dark },
  label: { ...typography.caption, color: colors.body },
  small: { ...typography.body, color: colors.muted },
  best: { ...typography.caption, color: colors.focus },
  divider: { height: 1, backgroundColor: colors.divider },
  startButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  startText: { ...typography.caption, color: colors.onPrimary },
  error: { ...typography.body, color: colors.danger, padding: spacing.md },
  lesson: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.small,
  },
  selectedLesson: {
    backgroundColor: colors.surfaceTint,
    borderColor: colors.primary,
  },
  lessonText: { flex: 1, gap: 3 },
  hud: { flexDirection: 'row', gap: spacing.xxl, padding: spacing.lg },
  healthColumn: { flex: 1, gap: 5 },
  playerName: { ...typography.caption, color: colors.dark },
  hpTrack: {
    height: 7,
    backgroundColor: colors.track,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  blueFill: { backgroundColor: colors.focus },
  playArea: { padding: spacing.lg, gap: spacing.md },
  clock: {
    ...typography.title,
    color: colors.focus,
    fontVariant: ['tabular-nums'],
  },
  questionTrack: {
    height: 3,
    backgroundColor: colors.track,
    borderRadius: 2,
    overflow: 'hidden',
  },
  questionFill: { height: '100%', backgroundColor: colors.primary },
  question: {
    padding: spacing.lg,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 6,
    minHeight: 110,
  },
  questionInstruction: { ...typography.body, color: colors.muted },
  inkText: { color: colors.dark },
  prompt: {
    ...typography.title,
    color: colors.dark,
    fontSize: 30,
    lineHeight: 42,
    textAlign: 'center',
  },
  promptSmall: { fontSize: 26, lineHeight: 36 },
  reading: { ...typography.body, color: colors.body },
  reveal: { ...typography.body, color: colors.success, textAlign: 'center' },
  answerColumns: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  stack: { flexDirection: 'column' },
  answerPanel: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bluePanel: { borderColor: colors.border, backgroundColor: colors.background },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  answer: {
    width: '48%',
    minHeight: 50,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexGrow: 1,
  },
  answerKey: { ...typography.body, color: colors.muted },
  answerText: {
    ...typography.label,
    color: colors.dark,
    fontSize: 18,
    lineHeight: 25,
    flex: 1,
  },
  meaningText: { fontSize: 14, lineHeight: 20 },
  correct: { backgroundColor: colors.successBg, borderColor: colors.success },
  wrong: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  chosen: { borderWidth: 2 },
  combo: { ...typography.caption, color: colors.focus },
  energyTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  energyFill: { height: '100%', backgroundColor: colors.primary },
  skill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTint,
  },
  botStatus: { alignSelf: 'center', padding: spacing.md, maxWidth: 180 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statsCard: {
    flex: 1,
    borderRadius: radius.small,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  resultTitle: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 32,
    color: colors.focus,
    textAlign: 'center',
  },
  reviewWord: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  japaneseWord: { fontSize: 24, color: colors.dark, minWidth: 65 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderRadius: radius.card,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
    boxShadow: shadowSm,
  },
  dialogScroll: { flexGrow: 0 },
  dialogContent: { gap: spacing.lg },
  help: { ...typography.body, color: colors.body, lineHeight: 22 },
  reviewOption: { width: '100%', flexGrow: 0 },
});

import { useDefaultJlptLevel } from '../hooks/useLearningLevel';
import { decodeRouteParam } from '../navigation/webNavigation';
import { useWebNavigation } from '../navigation/webNavigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthField, AuthNotice } from '../components/AuthForm';
import {
  CheckIcon,
  KeyboardIcon,
  MicIcon,
  VolumeIcon,
  VolumeXIcon,
} from '../components/icons';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { useWebLayout } from '../hooks/useWebLayout';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import { useGameReading } from '../hooks/useGameReading';
import { ApiError } from '../services/apiClient';
import { GameMode, GameRoom, gameService } from '../services/gameService';
import { createGameAudio, GameAudio } from '../services/gameAudio';
import { createGameSounds } from '../services/gameSounds';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
export function VocabularyGameScreen({
  userId,
  onExit,
}: {
  userId: string;
  onExit: () => void;
}) {
  const defaultLevel = useDefaultJlptLevel();
  const web = useWebNavigation();
  const webRef = useRef(web);
  webRef.current = web;
  const urlCode = web && /^\/games\/([^/]+)$/.exec(web.pathname)?.[1];
  const { desktop } = useWebLayout();
  const insets = useSafeAreaInsets();
  const navigationInset = useBottomNavigationInset();
  const [room, setRoom] = useState<GameRoom | null>(null),
    [level, setLevel] = useState<string>(defaultLevel),
    [mode, setMode] = useState<GameMode>('write');
  const [source, setSource] = useState<'jlpt' | 'lesson'>('jlpt'),
    [lesson, setLesson] = useState(''),
    [page, setPage] = useState(1);
  const [count, setCount] = useState('10'),
    [seconds, setSeconds] = useState(15),
    [code, setCode] = useState(''),
    [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [audioReady, setAudioReady] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [micActive, setMicActive] = useState(false);
  const sounds = useRef<ReturnType<typeof createGameSounds> | null>(null);
  const lastCue = useRef('');
  const [clock, setClock] = useState(Date.now());
  const alive = useRef(true),
    pending = useRef(false),
    refreshing = useRef(false),
    refreshAgain = useRef(false),
    offset = useRef(0);
  const audio = useRef<GameAudio | null>(null);
  const currentRoom = useRef<GameRoom | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const finished = room?.phase === 'finished';
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [room?.id, room?.round_id, finished]);
  currentRoom.current = room;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      audio.current?.close().catch(() => undefined);
      sounds.current?.close().catch(() => undefined);
      sounds.current = null;
    };
  }, []);
  const receive = useCallback((next: GameRoom) => {
    if (!alive.current) return;
    const previous = currentRoom.current;
    if (previous?.id === next.id && previous.version > next.version) return;
    currentRoom.current = next;
    const receivedAt = Date.now();
    offset.current = receivedAt - next.server_time;
    setClock(receivedAt);
    setRoom(old =>
      old?.id === next.id && old.version > next.version ? old : next,
    );
  }, []);
  const run = useCallback(async (task: () => Promise<void>) => {
    if (pending.current) return;
    sounds.current ??= createGameSounds();
    // Unlock within the button gesture, before network awaits.
    sounds.current.unlock().catch(() => undefined);
    audio.current?.resumePlayback().catch(() => undefined);
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Không thực hiện được thao tác.',
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  const adopt = useCallback(
    async (next: GameRoom) => {
      receive(next);
      await gameService.saveRoom(userId, next.code);
      if (webRef.current && webRef.current.pathname !== '/games/' + next.code)
        webRef.current.navigate('/games/' + next.code);
    },
    [receive, userId],
  );
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (webRef.current) {
        if (!urlCode) {
          setRoom(null);
          return;
        }
        try {
          const requestedCode = decodeRouteParam(urlCode);
          let next: GameRoom;
          try {
            next = await gameService.snapshot(requestedCode);
          } catch (cause) {
            if (cause instanceof ApiError && cause.status === 403)
              next = await gameService.join(requestedCode);
            else throw cause;
          }
          if (mounted) receive(next);
        } catch (cause) {
          if (mounted)
            setError(
              cause instanceof Error ? cause.message : 'Không mở được phòng.',
            );
        }
        return;
      }
      const saved = await gameService.savedRoom(userId);
      if (!saved || !mounted) return;
      try {
        const next = await gameService.snapshot(saved);
        if (mounted) receive(next);
      } catch (cause) {
        if (cause instanceof ApiError && [403, 404, 410].includes(cause.status))
          await gameService.saveRoom(userId, null);
      }
    };
    load().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [userId, receive, urlCode]);
  const loadCatalog = useCallback(
    () => gameService.catalog(level, page),
    [level, page],
  );
  const catalog = useRemoteResource(loadCatalog);
  const data = catalog.state.status === 'ready' ? catalog.state.data : null;
  const roomCode = room?.code;
  const refresh: () => Promise<void> = useCallback(async () => {
    if (!roomCode) return;
    if (refreshing.current) {
      refreshAgain.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const next = await gameService.snapshot(roomCode);
      if (currentRoom.current?.code !== roomCode) return;
      receive(next);
    } catch (cause) {
      if (alive.current) {
        setConnected(false);
        if (
          cause instanceof ApiError &&
          [403, 404, 410].includes(cause.status) &&
          currentRoom.current?.phase !== 'finished'
        ) {
          setRoom(null);
          audio.current?.close().catch(() => undefined);
          setAudioReady(false);
          setError(cause.message);
          gameService.saveRoom(userId, null).catch(() => undefined);
        }
      }
    } finally {
      refreshing.current = false;
      if (refreshAgain.current) {
        refreshAgain.current = false;
        if (alive.current && currentRoom.current?.code === roomCode)
          refresh().catch(() => undefined);
      }
    }
  }, [roomCode, receive, userId]);
  useEffect(() => {
    if (!roomCode) return;
    let disposed = false,
      cancel: (() => void) | undefined;
    gameService
      .watch(
        roomCode,
        () => {
          refresh();
        },
        value => {
          if (!disposed && alive.current) setConnected(value);
        },
      )
      .then(stop => {
        if (disposed) stop();
        else cancel = stop;
      })
      .catch(() => setConnected(false));
    const timer = setInterval(refresh, 2000);
    return () => {
      disposed = true;
      cancel?.();
      clearInterval(timer);
    };
  }, [roomCode, refresh]);
  useEffect(() => {
    if (!room?.deadline) return;
    const timer = setInterval(() => setClock(Date.now()), 200);
    return () => clearInterval(timer);
  }, [room?.deadline]);
  useEffect(() => {
    setAnswer('');
  }, [room?.round_id]);
  const speaking =
    room?.mode === 'read' && room.phase === 'reading' && room.holder === userId;
  useEffect(() => {
    let disposed = false;
    setMicActive(false);
    audio.current
      ?.setSpeaking(Boolean(speaking && audioReady))
      .then(() => {
        if (!disposed && alive.current)
          setMicActive(Boolean(speaking && audioReady));
      })
      .catch(() => {
        if (!disposed && alive.current) {
          setAudioReady(false);
          setError(
            'Không bật được micro. Hãy kiểm tra quyền micro và kết nối âm thanh.',
          );
        }
      });
    return () => {
      disposed = true;
    };
  }, [speaking, audioReady, room?.round_id]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active') {
        audio.current?.close().catch(() => undefined);
        setAudioReady(false);
      } else refresh();
    });
    return () => listener.remove();
  }, [refresh]);
  const exit = useCallback(
    () =>
      run(async () => {
        if (
          currentRoom.current &&
          !['closed', 'finished'].includes(currentRoom.current.phase)
        )
          await gameService.action(currentRoom.current.code, 'leave');
        await audio.current?.close();
        await gameService.saveRoom(userId, null);
        onExit();
      }),
    [run, onExit, userId],
  );
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      exit();
      return true;
    });
    return () => listener.remove();
  }, [exit]);
  const action = (
    name: 'ready' | 'start' | 'answer' | 'buzz' | 'finish-reading',
    extra: Record<string, unknown> = {},
  ) =>
    run(async () => {
      if (!room) return;
      if (name === 'finish-reading') await audio.current?.setSpeaking(false);
      receive(
        await gameService.action(room.code, name, {
          round_id: room.round_id,
          ...(name === 'buzz'
            ? { recognizer: reading.supported ? 'browser' : 'cloud' }
            : {}),
          ...extra,
        }),
      );
    });
  const reading = useGameReading(room, userId, micActive, receive);
  const connectAudio = () =>
    run(async () => {
      if (!room) return;
      setAudioReady(false);
      setPlaybackBlocked(false);
      const credentials = await gameService.audio(room.code);
      audio.current ??= createGameAudio();
      await audio.current.connect(
        credentials.url,
        credentials.token,
        ready => {
          if (alive.current) setAudioReady(ready);
        },
        blocked => {
          if (alive.current) setPlaybackBlocked(blocked);
        },
      );
    });
  const me = room?.players.find(player => player.id === userId),
    players = room?.players.filter(player => !player.left) || [];
  const remaining = room?.deadline
    ? Math.max(0, Math.ceil((room.deadline - (clock - offset.current)) / 1000))
    : 0;
  useEffect(() => {
    if (!room) {
      lastCue.current = '';
      return;
    }
    let cue: Parameters<ReturnType<typeof createGameSounds>['play']>[0] | null =
      null;
    let key = `${room.id}:${room.round_id}:${room.phase}`;
    if (room.phase === 'countdown' && remaining > 0) {
      key += `:${remaining}`;
      cue = 'tick';
    } else if (room.phase === 'question' && remaining > 0) {
      cue = remaining <= 3 ? 'tick' : 'start';
      if (cue === 'tick') key += `:${remaining}`;
    } else if (room.phase === 'reading' && remaining > 0 && remaining <= 3) {
      key += `:${remaining}`;
      cue = 'tick';
    } else if (room.phase === 'results' && !room.result?.technical_error) {
      cue = room.attempts.some(attempt => attempt.correct)
        ? 'correct'
        : 'incorrect';
    } else if (room.phase === 'finished') cue = 'finish';
    if (cue && key !== lastCue.current) {
      lastCue.current = key;
      if (soundEnabled) sounds.current?.play(cue);
    }
  }, [room, remaining, soundEnabled]);
  const selectedLesson = data?.lessons.find(item => item.id === lesson);
  const standings = room
    ? [...room.players].sort((a, b) => b.score - a.score)
    : [];
  const readyCount = players.filter(player => player.ready).length;
  const submittedCount = players.filter(player => player.submitted).length;
  const myRank = me
    ? standings.findIndex(player => player.score === me.score) + 1
    : 0;
  const roundDuration =
    room?.phase === 'reading'
      ? 8
      : room?.phase === 'judging'
      ? 30
      : room?.phase === 'countdown'
      ? 3
      : room?.phase === 'results'
      ? 4.5
      : room?.seconds || 1;
  const urgent =
    remaining <= 5 && (room?.phase === 'question' || room?.phase === 'reading');
  const timeFraction = Math.min(1, remaining / roundDuration);
  const radio = (
    label: string,
    selected: boolean,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceActive,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.choiceText]}>{label}</Text>
    </Pressable>
  );
  const joinPanel = (
    <View style={[styles.sideColumn, desktop && styles.desktopSideColumn]}>
      <View style={styles.card}>
        {desktop ? (
          <View style={styles.iconTile}>
            <KeyboardIcon size={24} color={colors.focus} />
          </View>
        ) : null}
        <Text accessibilityRole="header" style={styles.title}>
          Vào phòng
        </Text>
        <View style={[styles.joinFields, !desktop && styles.joinFieldsMobile]}>
          <View style={styles.joinInput}>
            <AuthField
              label="Mã phòng"
              placeholder="ABC123"
              value={code}
              onChangeText={value =>
                setCode(
                  value
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .toUpperCase()
                    .slice(0, 6),
                )
              }
              autoCapitalize="characters"
              maxLength={6}
            />
          </View>
          <View style={!desktop && styles.joinButton}>
            <AuthButton
              label="Vào phòng"
              variant="outline"
              disabled={code.length !== 6 || busy}
              onPress={() =>
                run(async () => adopt(await gameService.join(code)))
              }
            />
          </View>
        </View>
      </View>
    </View>
  );
  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: navigationInset + spacing.section,
        },
      ]}
    >
      <ScreenBackHeader
        title="Game từ vựng"
        backLabel="Quay lại luyện tập"
        onBack={exit}
      />
      <AuthNotice error message={error} />
      {!room ? (
        <View style={[styles.columns, desktop && styles.desktopColumns]}>
          {!desktop ? joinPanel : null}
          <View style={styles.mainColumn}>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.title}>
                Tạo phòng chơi
              </Text>
              <Text style={styles.caption}>2–8 người</Text>
              <View
                style={styles.modeOptions}
                accessibilityRole="radiogroup"
                accessibilityLabel="Mode chơi"
              >
                {(['write', 'read'] as const).map(item => {
                  const selected = mode === item;
                  const disabled = item === 'read' && !data?.read_available;
                  const Icon = item === 'write' ? KeyboardIcon : MicIcon;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="radio"
                      accessibilityLabel={
                        item === 'write' ? 'Viết cách đọc' : 'Giành mic'
                      }
                      accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled}
                      onPress={() => setMode(item)}
                      style={({ pressed }) => [
                        styles.modeOption,
                        selected && styles.choiceActive,
                        disabled && styles.disabled,
                        pressed && !disabled && styles.pressed,
                      ]}
                    >
                      <View style={styles.row}>
                        <View
                          style={[
                            styles.iconTile,
                            selected && styles.iconTileActive,
                          ]}
                        >
                          <Icon
                            size={24}
                            color={selected ? colors.focus : colors.muted}
                          />
                        </View>
                        <View
                          style={[
                            styles.radioMark,
                            selected && styles.radioMarkActive,
                          ]}
                        >
                          {selected ? (
                            <CheckIcon size={14} color={colors.onPrimary} />
                          ) : null}
                        </View>
                      </View>
                      <Text
                        style={[styles.label, selected && styles.choiceText]}
                      >
                        {item === 'write' ? 'Viết cách đọc' : 'Giành mic'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!data?.read_available && data ? (
                <Text style={styles.caption}>Giành mic chưa khả dụng.</Text>
              ) : null}
              <View style={styles.sectionHeading}>
                <Text style={styles.label}>Chọn từ vựng</Text>
              </View>
              <Text style={styles.caption}>Cấp JLPT</Text>
              <View
                style={styles.choices}
                accessibilityRole="radiogroup"
                accessibilityLabel="Cấp JLPT"
              >
                {levels.map(item =>
                  radio(item, item === level, () => {
                    setLevel(item);
                    setLesson('');
                    setPage(1);
                  }),
                )}
              </View>
              <Text style={styles.label}>Nguồn từ vựng</Text>
              <View
                style={styles.choices}
                accessibilityRole="radiogroup"
                accessibilityLabel="Nguồn từ vựng"
              >
                {radio('Random theo JLPT', source === 'jlpt', () =>
                  setSource('jlpt'),
                )}
                {radio('Chọn bài học', source === 'lesson', () =>
                  setSource('lesson'),
                )}
              </View>
              {catalog.state.status === 'loading' ? (
                <ActivityIndicator
                  color={colors.primary}
                  accessibilityLabel="Đang tải nguồn từ"
                />
              ) : null}
              {catalog.state.status === 'error' ? (
                <>
                  <AuthNotice error message={catalog.state.message} />
                  <AuthButton
                    label="Tải lại nguồn từ"
                    onPress={catalog.reload}
                    variant="text"
                  />
                </>
              ) : null}
              {source === 'lesson' && data ? (
                <View style={styles.lessonSection}>
                  <ScrollView
                    nestedScrollEnabled
                    style={styles.lessonList}
                    contentContainerStyle={styles.lessonContent}
                  >
                    {data.lessons.map(item => (
                      <Pressable
                        key={item.id}
                        accessibilityRole="radio"
                        accessibilityLabel={`Chọn ${item.title} · ${item.textbook}`}
                        accessibilityState={{ checked: lesson === item.id }}
                        onPress={() => setLesson(item.id)}
                        style={[
                          styles.lesson,
                          lesson === item.id && styles.choiceActive,
                        ]}
                      >
                        <Text style={styles.label}>{item.title}</Text>
                        <Text style={styles.caption}>
                          {item.textbook} · {item.word_count} từ
                        </Text>
                      </Pressable>
                    ))}
                    {!data.lessons.length ? (
                      <Text style={styles.caption}>
                        Chưa có bài học ở cấp này.
                      </Text>
                    ) : null}
                  </ScrollView>
                  {data.total_pages > 1 ? (
                    <View style={styles.row}>
                      <AuthButton
                        label="Bài học trước"
                        disabled={page <= 1}
                        variant="text"
                        onPress={() => setPage(value => value - 1)}
                      />
                      <Text style={styles.caption}>
                        {page}/{data.total_pages}
                      </Text>
                      <AuthButton
                        label="Bài học sau"
                        disabled={page >= data.total_pages}
                        variant="text"
                        onPress={() => setPage(value => value + 1)}
                      />
                    </View>
                  ) : null}
                </View>
              ) : data ? (
                <Text style={styles.caption}>
                  {data.available_count} từ khả dụng ở cấp {level}
                </Text>
              ) : null}
              {selectedLesson && source === 'lesson' ? (
                <Text style={styles.caption}>
                  Đã chọn: {selectedLesson.title}
                </Text>
              ) : null}
              <View style={styles.sectionHeading}>
                <Text style={styles.label}>Thiết lập lượt chơi</Text>
              </View>
              <View
                style={[styles.settings, desktop && styles.settingsDesktop]}
              >
                <View style={styles.settingCount}>
                  <AuthField
                    label="Số câu (1–30)"
                    value={count}
                    onChangeText={value =>
                      setCount(value.replace(/\D/g, '').slice(0, 2))
                    }
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
                <View style={styles.settingTime}>
                  <Text style={styles.label}>Thời gian mỗi câu</Text>
                  <View
                    style={styles.choices}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Thời gian mỗi câu"
                  >
                    {[10, 15, 20, 30].map(value =>
                      radio(`${value} giây`, seconds === value, () =>
                        setSeconds(value),
                      ),
                    )}
                  </View>
                </View>
              </View>
              <AuthButton
                label="Tạo phòng"
                busy={busy}
                disabled={
                  !data ||
                  !count ||
                  Number(count) < 1 ||
                  Number(count) > 30 ||
                  (source === 'lesson' && !lesson) ||
                  (mode === 'read' && !data.read_available)
                }
                onPress={() =>
                  run(async () => {
                    await adopt(
                      await gameService.create({
                        mode,
                        level,
                        source,
                        lesson_id: source === 'lesson' ? lesson : undefined,
                        question_count: Number(count),
                        seconds,
                      }),
                    );
                  })
                }
              />
            </View>
          </View>
          {desktop ? joinPanel : null}
        </View>
      ) : (
        <>
          <View style={styles.roomHeader}>
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>MÃ PHÒNG</Text>
              <Text
                selectable
                accessibilityRole="header"
                style={styles.roomCode}
              >
                {room.code}
              </Text>
              <Text selectable style={styles.caption}>
                {room.level} ·{' '}
                {room.mode === 'read' ? 'Giành mic' : 'Viết cách đọc'} ·{' '}
                {room.question_count} câu
              </Text>
            </View>
            <View style={styles.inline}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  soundEnabled ? 'Tắt âm báo trò chơi' : 'Bật âm báo trò chơi'
                }
                onPress={() => {
                  sounds.current ??= createGameSounds();
                  sounds.current.unlock().catch(() => undefined);
                  setSoundEnabled(value => !value);
                }}
                hitSlop={8}
                style={styles.soundButton}
              >
                {soundEnabled ? (
                  <VolumeIcon size={18} color={colors.primaryText} />
                ) : (
                  <VolumeXIcon size={18} color={colors.muted} />
                )}
              </Pressable>
              <View
                style={[styles.statusBadge, connected && styles.readyBadge]}
              >
                <View
                  style={[styles.statusDot, connected && styles.readyDot]}
                />
                <Text style={[styles.caption, connected && styles.success]}>
                  {connected ? 'Đã kết nối' : 'Đang kết nối lại…'}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.columns, desktop && styles.desktopColumns]}>
            <View style={styles.mainColumn}>
              {room.mode === 'read' &&
              !['finished', 'closed'].includes(room.phase) ? (
                <View style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.inline}>
                      <MicIcon
                        size={20}
                        color={audioReady ? colors.success : colors.focus}
                      />
                      <Text style={styles.label}>
                        {audioReady
                          ? 'Âm thanh đã kết nối'
                          : 'Kết nối micro và loa'}
                      </Text>
                    </View>
                    <AuthButton
                      label={
                        audioReady
                          ? 'Kết nối lại âm thanh'
                          : 'Kiểm tra âm thanh'
                      }
                      variant="outline"
                      disabled={busy}
                      onPress={connectAudio}
                    />
                  </View>
                  {!room.voice_ready ? (
                    <Text style={styles.caption}>
                      Đang chuẩn bị âm thanh cho phòng…
                    </Text>
                  ) : null}
                  {playbackBlocked ? (
                    <>
                      <Text style={styles.caption}>
                        Trình duyệt đang chặn loa. Bấm bên dưới để nghe người
                        chơi khác.
                      </Text>
                      <AuthButton
                        label="Bật âm thanh người chơi"
                        variant="outline"
                        onPress={() => {
                          // Keep this call in the user gesture; do not await an API first.
                          audio.current
                            ?.resumePlayback()
                            .then(() => {
                              if (alive.current) setPlaybackBlocked(false);
                            })
                            .catch(() => {
                              if (alive.current)
                                setError(
                                  'Chưa phát được âm thanh. Hãy kiểm tra loa và thử bật lại.',
                                );
                            });
                        }}
                      />
                    </>
                  ) : null}
                  <Text style={styles.caption}>
                    Đọc đúng được 10 điểm. Hệ thống tự chốt khi bạn ngừng nói;
                    bạn cũng có thể bấm Đọc xong.
                  </Text>
                </View>
              ) : null}
              {room.phase === 'waiting' ? (
                <View style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.copy}>
                      <Text accessibilityRole="header" style={styles.title}>
                        Phòng chờ
                      </Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.caption}>
                        {players.length}/8 người
                      </Text>
                    </View>
                  </View>
                  <View style={styles.playerGrid}>
                    {players.map(player => (
                      <View
                        style={[
                          styles.lobbyPlayer,
                          player.ready && styles.lobbyPlayerReady,
                        ]}
                        key={player.id}
                      >
                        <PlayerAvatar
                          name={player.name}
                          active={player.ready}
                        />
                        <View style={styles.copy}>
                          <Text style={styles.label}>
                            {player.name}
                            {player.id === userId ? ' · Bạn' : ''}
                          </Text>
                          <Text style={styles.caption}>
                            {player.id === room.host_id
                              ? 'Chủ phòng'
                              : 'Người chơi'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            player.ready && styles.readyBadge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.caption,
                              player.ready && styles.success,
                            ]}
                          >
                            {player.ready ? '✓ Sẵn sàng' : 'Đang chờ'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={styles.readySummary}>
                    <Text style={styles.caption}>
                      {readyCount}/{players.length} người đã sẵn sàng
                    </Text>
                  </View>
                  <AuthButton
                    label={me?.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
                    variant="outline"
                    disabled={busy || (room.mode === 'read' && !audioReady)}
                    onPress={() => action('ready', { ready: !me?.ready })}
                  />
                  {room.host_id === userId ? (
                    <AuthButton
                      label="Bắt đầu trận"
                      busy={busy}
                      disabled={
                        players.length < 2 ||
                        !players.every(p => p.ready) ||
                        (room.mode === 'read' && !room.voice_ready)
                      }
                      onPress={() => action('start')}
                    />
                  ) : (
                    <Text style={styles.caption}>Chờ chủ phòng</Text>
                  )}
                </View>
              ) : room.phase === 'finished' ? (
                <View style={styles.card}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Trận đấu đã kết thúc
                  </Text>
                  <View style={styles.finishSummary}>
                    <View style={styles.stat}>
                      <Text style={styles.eyebrow}>ĐIỂM CỦA BẠN</Text>
                      <Text style={styles.statValue}>{me?.score ?? 0}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.eyebrow}>XẾP HẠNG</Text>
                      <Text style={styles.statValue}>#{myRank}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.eyebrow}>ĐÃ CHƠI</Text>
                      <Text style={styles.statValue}>
                        {room.history.length}
                        <Text style={styles.caption}> câu</Text>
                      </Text>
                    </View>
                  </View>
                  <View testID="game-final-standings">
                    <Text style={styles.label}>Kết quả tất cả người chơi</Text>
                    {standings.map(player => (
                      <View key={player.id} style={styles.playerRow}>
                        <Text style={styles.rank}>
                          {standings.findIndex(
                            item => item.score === player.score,
                          ) + 1}
                        </Text>
                        <View style={styles.copy}>
                          <Text style={styles.label}>
                            {player.name}
                            {player.id === userId ? ' · Bạn' : ''}
                          </Text>
                        </View>
                        <Text style={styles.score}>{player.score} điểm</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.label}>Từ vựng trong trận</Text>
                  {room.history.map(item => (
                    <View key={item.number} style={styles.history}>
                      <Text style={styles.label}>
                        {item.number}. {item.word} · {item.reading}
                      </Text>
                      <Text style={styles.body}>{item.meaning}</Text>
                      {item.technical_error ? (
                        <Text style={styles.caption}>
                          {item.technical_error}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                  <AuthButton
                    label="Về khu chơi"
                    onPress={() =>
                      run(async () => {
                        await gameService.saveRoom(userId, null);
                        await audio.current?.close();
                        setAudioReady(false);
                        setRoom(null);
                        webRef.current?.navigate('/games');
                      })
                    }
                  />
                </View>
              ) : room.phase === 'closed' ? (
                <View style={styles.card}>
                  <Text style={styles.title}>Phòng đã đóng</Text>
                  <AuthButton
                    label="Về khu chơi"
                    onPress={() =>
                      run(async () => {
                        await gameService.saveRoom(userId, null);
                        await audio.current?.close();
                        setAudioReady(false);
                        setRoom(null);
                        webRef.current?.navigate('/games');
                      })
                    }
                  />
                </View>
              ) : (
                <View style={[styles.card, styles.arena]}>
                  <View style={styles.row}>
                    <View style={styles.copy}>
                      <Text style={styles.eyebrow}>
                        {room.phase === 'results'
                          ? 'KẾT QUẢ CÂU HỎI'
                          : room.mode === 'write'
                          ? 'VIẾT CÁCH ĐỌC'
                          : 'GIÀNH LƯỢT ĐỌC'}
                      </Text>
                      <Text style={styles.label}>
                        Câu {room.number || 1}/{room.question_count}
                      </Text>
                    </View>
                    <View
                      style={[styles.timerPill, urgent && styles.timerUrgent]}
                    >
                      <Text style={[styles.timer, urgent && styles.danger]}>
                        {remaining}
                        <Text style={styles.caption}> giây</Text>
                      </Text>
                    </View>
                  </View>
                  <View
                    style={styles.timeTrack}
                    accessibilityRole="progressbar"
                    accessibilityLabel="Thời gian còn lại"
                    accessibilityValue={{
                      min: 0,
                      max: Math.ceil(roundDuration),
                      now: remaining,
                    }}
                  >
                    <View
                      style={[
                        styles.timeFill,
                        { width: `${timeFraction * 100}%` },
                        urgent && styles.timeFillUrgent,
                      ]}
                    />
                  </View>
                  {room.phase === 'countdown' ? (
                    <>
                      <View style={styles.countdownCircle}>
                        <Text style={styles.countdownNumber}>{remaining}</Text>
                      </View>
                      <Text style={styles.center}>Chuẩn bị</Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.wordStage}>
                        <Text
                          selectable={false}
                          style={[styles.word, desktop && styles.desktopWord]}
                        >
                          {room.question?.word}
                        </Text>
                      </View>
                      {room.phase === 'question' && room.mode === 'write' ? (
                        <>
                          <AuthField
                            label="Cách đọc (kana)"
                            value={answer}
                            onChangeText={setAnswer}
                            editable={!busy && !me?.submitted}
                            autoCorrect={false}
                            maxLength={100}
                          />
                          <AuthButton
                            label={
                              me?.submitted ? 'Đã gửi đáp án' : 'Gửi đáp án'
                            }
                            disabled={
                              busy ||
                              me?.submitted ||
                              !answer.trim() ||
                              remaining === 0
                            }
                            onPress={() => action('answer', { answer })}
                          />
                          <View style={styles.row}>
                            <Text style={styles.caption}>
                              {submittedCount}/{players.length} đã gửi
                            </Text>
                          </View>
                        </>
                      ) : null}
                      {room.mode === 'read' &&
                      ['question', 'reading', 'judging'].includes(
                        room.phase,
                      ) ? (
                        <AuthButton
                          label={
                            room.phase === 'question'
                              ? 'Giành lượt đọc'
                              : room.phase === 'judging'
                              ? 'Đang chấm…'
                              : speaking
                              ? micActive
                                ? reading.submitting
                                  ? 'Đang kiểm tra…'
                                  : reading.enabled && !reading.listening
                                  ? 'Thử lại'
                                  : 'Đọc xong'
                                : 'Đang bật micro…'
                              : 'Người khác đang đọc'
                          }
                          disabled={
                            !audioReady ||
                            busy ||
                            reading.submitting ||
                            remaining === 0 ||
                            room.phase === 'judging' ||
                            (room.phase === 'reading' &&
                              (!speaking || !micActive))
                          }
                          onPress={() =>
                            speaking && reading.enabled
                              ? reading.finish()
                              : action(speaking ? 'finish-reading' : 'buzz')
                          }
                        />
                      ) : null}
                      {room.phase === 'reading' ? (
                        <>
                          <View
                            style={[
                              styles.speakerBanner,
                              speaking && styles.speakerBannerActive,
                            ]}
                          >
                            <View style={styles.iconTile}>
                              <VolumeIcon size={24} color={colors.focus} />
                            </View>
                            <Text style={[styles.label, styles.speakerText]}>
                              {speaking
                                ? 'Đến lượt bạn'
                                : `${
                                    room.players.find(p => p.id === room.holder)
                                      ?.name || 'Người chơi'
                                  } đang đọc…`}
                            </Text>
                          </View>
                          {speaking && reading.enabled ? (
                            <View>
                              <Text
                                style={styles.caption}
                                accessibilityLiveRegion="polite"
                              >
                                {reading.text || 'Đang nghe tiếng Nhật…'}
                              </Text>
                              {reading.notice ? (
                                <Text style={styles.caption}>
                                  {reading.notice}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </>
                      ) : null}
                      {room.phase === 'judging' ? (
                        <>
                          <ActivityIndicator color={colors.primary} />
                          <Text style={styles.center}>
                            Đang chấm câu trả lời…
                          </Text>
                        </>
                      ) : null}
                      {room.phase === 'results' ? (
                        <>
                          <Text style={styles.reading}>
                            {room.question?.reading}
                          </Text>
                          <Text style={styles.center}>
                            {room.question?.meaning}
                          </Text>
                          {room.result?.technical_error ? (
                            <AuthNotice message={room.result.technical_error} />
                          ) : null}
                          {room.attempts.map(item => (
                            <View key={item.user_id} style={styles.playerRow}>
                              <View style={styles.copy}>
                                <Text style={styles.label}>
                                  {
                                    room.players.find(
                                      p => p.id === item.user_id,
                                    )?.name
                                  }
                                </Text>
                                <Text style={styles.caption}>
                                  {item.answer || 'Không có câu trả lời'} ·{' '}
                                  {item.correct ? 'Đúng' : 'Chưa đúng'}
                                </Text>
                                {item.buzz_ms != null ? (
                                  <Text style={styles.caption}>
                                    Giành mic ·{' '}
                                    {(item.buzz_ms / 1000).toFixed(1)} giây
                                  </Text>
                                ) : item.response_ms != null ? (
                                  <Text style={styles.caption}>
                                    Trả lời sau{' '}
                                    {(item.response_ms / 1000).toFixed(1)} giây
                                  </Text>
                                ) : null}
                              </View>
                              <Text
                                style={[
                                  styles.label,
                                  item.correct && styles.success,
                                ]}
                              >
                                +{item.points}
                              </Text>
                            </View>
                          ))}
                          {!room.attempts.length ? (
                            <Text style={styles.center}>
                              Hết giờ. Chưa có câu trả lời.
                            </Text>
                          ) : null}
                          <Text style={styles.caption}>
                            {room.number === room.question_count
                              ? 'Xem tổng kết'
                              : 'Câu tiếp theo'}{' '}
                            sau {remaining} giây.
                          </Text>
                        </>
                      ) : null}
                    </>
                  )}
                </View>
              )}
            </View>
            <View
              style={[styles.sideColumn, desktop && styles.desktopSideColumn]}
            >
              <View style={styles.card}>
                {room.phase === 'waiting' ? (
                  <>
                    <Text accessibilityRole="header" style={styles.title}>
                      Thông tin trận đấu
                    </Text>
                    <View style={styles.summaryLine}>
                      <Text style={styles.caption}>Chế độ</Text>
                      <Text style={styles.label}>
                        {room.mode === 'write' ? 'Viết cách đọc' : 'Giành mic'}
                      </Text>
                    </View>
                    <View style={styles.summaryLine}>
                      <Text style={styles.caption}>Trình độ</Text>
                      <Text style={styles.label}>{room.level}</Text>
                    </View>
                    <View style={styles.summaryLine}>
                      <Text style={styles.caption}>Bộ câu hỏi</Text>
                      <Text style={styles.label}>
                        {room.question_count} câu · {room.seconds} giây
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.row}>
                      <Text accessibilityRole="header" style={styles.title}>
                        Bảng điểm
                      </Text>
                      <Text style={styles.caption}>
                        {room.players.length} người
                      </Text>
                    </View>
                    {standings.map(player => {
                      const rank =
                        standings.findIndex(
                          item => item.score === player.score,
                        ) + 1;
                      return (
                        <View
                          key={player.id}
                          style={[
                            styles.playerRow,
                            player.id === userId && styles.myStanding,
                          ]}
                        >
                          <Text
                            style={[
                              styles.rank,
                              rank === 1 &&
                                player.score > 0 &&
                                styles.choiceText,
                            ]}
                          >
                            {rank}
                          </Text>
                          <PlayerAvatar name={player.name} small />
                          <View style={styles.copy}>
                            <Text style={styles.label}>
                              {player.name}
                              {player.id === userId ? ' · Bạn' : ''}
                            </Text>
                            {player.left ? (
                              <Text style={styles.caption}>Đã rời phòng</Text>
                            ) : room.phase === 'question' &&
                              room.mode === 'write' &&
                              player.submitted ? (
                              <Text style={[styles.caption, styles.success]}>
                                ✓ Đã gửi
                              </Text>
                            ) : room.holder === player.id &&
                              room.phase === 'reading' ? (
                              <Text style={[styles.caption, styles.choiceText]}>
                                Đang giữ mic
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.scoreColumn}>
                            <Text style={styles.score}>{player.score}</Text>
                            <Text style={styles.caption}>điểm</Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
                <AuthButton
                  label="Rời phòng"
                  variant="text"
                  disabled={busy}
                  onPress={exit}
                />
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
function PlayerAvatar({
  name,
  active = false,
  small = false,
}: {
  name: string;
  active?: boolean;
  small?: boolean;
}) {
  return (
    <View
      style={[
        styles.avatar,
        active && styles.avatarReady,
        small && styles.avatarSmall,
      ]}
      accessible={false}
    >
      <Text style={[styles.avatarText, active && styles.success]}>
        {Array.from(name.trim())[0]?.toUpperCase() || '?'}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  soundButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinFields: { gap: spacing.lg },
  joinFieldsMobile: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  joinInput: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  joinButton: { width: 140 },
  eyebrow: { ...typography.caption, color: colors.muted, letterSpacing: 1 },
  modeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  modeOption: {
    flex: 1,
    minWidth: 140,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceTint,
  },
  iconTile: {
    height: 48,
    width: 48,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileActive: { backgroundColor: colors.surface },
  radioMark: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioMarkActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: { backgroundColor: colors.track },
  sectionHeading: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  settings: { gap: spacing.lg },
  settingsDesktop: { flexDirection: 'row', alignItems: 'flex-end' },
  settingCount: { flexBasis: 100, flexGrow: 1, minWidth: 100 },
  settingTime: { flexGrow: 3, gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roomCode: {
    ...typography.brand,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 4,
    color: colors.focus,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
  },
  readyBadge: { backgroundColor: colors.successBg },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
  },
  readyDot: { backgroundColor: colors.success },
  playerGrid: { gap: spacing.md },
  lobbyPlayer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  lobbyPlayerReady: { borderColor: colors.successBg },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.small,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarReady: { backgroundColor: colors.successBg },
  avatarSmall: { width: 36, height: 36, borderRadius: radius.pill },
  avatarText: { ...typography.title, color: colors.focus },
  readySummary: { gap: spacing.xs },
  summaryLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  finishSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flex: 1,
    minWidth: 100,
    padding: spacing.lg,
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.input,
    gap: spacing.sm,
  },
  statValue: {
    ...typography.brand,
    fontSize: 32,
    lineHeight: 40,
    color: colors.focus,
  },
  arena: { gap: spacing.lg },
  timerPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
  },
  timerUrgent: { backgroundColor: colors.dangerBg },
  danger: { color: colors.danger },
  timeTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  timeFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  timeFillUrgent: { backgroundColor: colors.danger },
  wordStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
    minHeight: 180,
  },
  desktopWord: { fontSize: 56, lineHeight: 76 },
  countdownCircle: {
    width: 140,
    height: 140,
    borderRadius: radius.pill,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: spacing.xxl,
  },
  countdownNumber: {
    ...typography.brand,
    fontSize: 64,
    lineHeight: 80,
    color: colors.focus,
  },
  speakerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceTint,
  },
  speakerBannerActive: { backgroundColor: colors.badgeBg },
  speakerText: { flex: 1, minWidth: 0 },
  rank: {
    ...typography.caption,
    color: colors.muted,
    minWidth: 12,
    textAlign: 'center',
  },
  myStanding: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 0,
  },
  scoreColumn: { alignItems: 'flex-end' },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: spacing.xl,
  },
  columns: { gap: spacing.xl },
  desktopColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxl,
  },
  mainColumn: { flex: 1, minWidth: 0, gap: spacing.xl },
  sideColumn: { minWidth: 0, gap: spacing.xl },
  desktopSideColumn: { width: 300, flexShrink: 0 },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    boxShadow: shadowSm,
  },
  title: { ...typography.title, color: colors.dark },
  label: { ...typography.label, color: colors.body },
  body: { ...typography.body, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceActive: {
    backgroundColor: colors.badgeBg,
    borderColor: colors.primary,
  },
  choiceText: { color: colors.focus },
  disabled: { opacity: 0.5 },
  lessonSection: { gap: spacing.sm },
  lessonList: { maxHeight: 260 },
  lessonContent: { gap: spacing.sm },
  lesson: {
    padding: spacing.md,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    minHeight: 48,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  roomHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadowSm,
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  success: { color: colors.success },
  score: { ...typography.title, color: colors.focus },
  timer: { ...typography.title, color: colors.focus },
  word: {
    ...typography.brand,
    maxWidth: '100%',
    flexShrink: 1,
    fontSize: 40,
    lineHeight: 56,
    color: colors.dark,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  reading: { ...typography.title, color: colors.focus, textAlign: 'center' },
  center: { ...typography.body, color: colors.body, textAlign: 'center' },
  history: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
});

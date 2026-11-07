import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { NihongoMascot } from '../components/NihongoMascot';
import { starterWords } from '../games/castle/data';
import { MomoGameSprite } from '../games/castle/MomoGameSprite';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { gameService, GameCatalog } from '../services/gameService';
import { sharedRoomService, SharedRoom } from '../services/sharedRoomService';
import { createGameAudio, GameAudio } from '../services/gameAudio';
import { ApiError } from '../services/apiClient';
import type { LibraryGame } from './GameLibraryScreen';
import { colors, radius, spacing, typography } from '../theme/theme';

export type SharedAudioState = {
  instance: GameAudio;
  ready: boolean;
  onStatus: (ready: boolean) => void;
  blocked: boolean;
};
const choices: { id: LibraryGame; title: string; players: string }[] = [
  { id: 'castle', title: 'Công thành Momo', players: '2 người' },
  { id: 'read', title: 'Giành mic', players: '2–8 người' },
  { id: 'write', title: 'Đối kháng từ vựng', players: '2–8 người' },
];
function Option({
  label,
  chosen,
  onPress,
  disabled = false,
}: {
  label: string;
  chosen?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.option,
        chosen && s.chosen,
        pressed && s.pressed,
        disabled && s.disabled,
      ]}
    >
      <Text style={[s.optionText, chosen && s.chosenText]}>{label}</Text>
    </Pressable>
  );
}
export function SharedGameRoomScreen({
  code,
  userId,
  onExit,
  renderGame,
}: {
  code: string;
  userId: string;
  onExit: () => void;
  renderGame: (
    game: LibraryGame,
    code: string,
    onBack: () => void,
    audio?: SharedAudioState,
  ) => ReactNode;
}) {
  const [room, setRoom] = useState<SharedRoom | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [inLobby, setInLobby] = useState(false),
    [copied, setCopied] = useState(false);
  const current = useRef<SharedRoom | null>(null),
    alive = useRef(true),
    lastRound = useRef(-1),
    pending = useRef(false);
  const audio = useRef<GameAudio | null>(null);
  const [audioReady, setAudioReady] = useState(false),
    [playbackBlocked, setPlaybackBlocked] = useState(false);
  useEffect(
    () => () => {
      audio.current?.close().catch(() => undefined);
    },
    [],
  );
  useEffect(() => {
    if (room?.game !== 'read' && audio.current) {
      audio.current.close().catch(() => undefined);
      audio.current = null;
      setAudioReady(false);
      setPlaybackBlocked(false);
    }
  }, [room?.game]);
  const prepareAudio = async () => {
    setBusy(true);
    setError('');
    try {
      if (audioReady) {
        await audio.current?.resumePlayback();
        setPlaybackBlocked(false);
        return;
      }
      const credentials = await gameService.audio(code);
      if (!alive.current) return;
      audio.current ??= createGameAudio();
      await audio.current.connect(
        credentials.url,
        credentials.token,
        setAudioReady,
        setPlaybackBlocked,
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Không kết nối được âm thanh.',
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const accept = useCallback(
    (value: SharedRoom) => {
      if (
        !alive.current ||
        value.code !== code ||
        (current.current && current.current.version > value.version)
      )
        return;
      if (lastRound.current !== value.round) {
        lastRound.current = value.round;
        setInLobby(false);
      }
      current.current = value;
      setRoom(value);
      setError('');
    },
    [code],
  );
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      accept(await sharedRoomService.snapshot(code));
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không kết nối được phòng.',
        );
    } finally {
      pending.current = false;
    }
  }, [code, accept]);
  useEffect(() => {
    alive.current = true;
    let disposed = false,
      stop: (() => void) | undefined;
    (async () => {
      try {
        let value: SharedRoom;
        try {
          value = await sharedRoomService.snapshot(code);
        } catch (failure) {
          if (!(failure instanceof ApiError) || failure.status !== 403)
            throw failure;
          value = await sharedRoomService.action(code, 'join');
        }
        accept(value);
      } catch (failure) {
        if (alive.current)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không vào được phòng.',
          );
      }
    })();
    gameService
      .watch(
        code,
        () => refresh(),
        () => {},
      )
      .then(close => {
        if (disposed) close();
        else stop = close;
      })
      .catch(() => undefined);
    const timer = setInterval(refresh, 1000);
    return () => {
      alive.current = false;
      disposed = true;
      clearInterval(timer);
      stop?.();
    };
  }, [code, accept, refresh]);
  const action = async (
    kind: 'select' | 'ready' | 'start' | 'leave',
    data: unknown = {},
  ) => {
    setBusy(true);
    setError('');
    try {
      const value = await sharedRoomService.action(code, kind, data);
      if (kind === 'leave') {
        onExit();
        return;
      }
      accept(value);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Chưa thực hiện được thao tác.',
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const [game, setGame] = useState<LibraryGame>('castle'),
    [level, setLevel] = useState('N5'),
    [source, setSource] = useState('starter'),
    [seconds, setSeconds] = useState(9),
    [count, setCount] = useState(10),
    [lesson, setLesson] = useState('');
  const [topic, setTopic] = useState('Tất cả');
  const [catalog, setCatalog] = useState<GameCatalog | null>(null),
    [page, setPage] = useState(1);
  const configuration = room
    ? JSON.stringify([room.selected_game, room.settings])
    : '';
  useEffect(() => {
    if (!current.current) return;
    const value = current.current;
    setGame(value.selected_game || 'castle');
    setLevel(value.settings.level);
    setSource(value.selected_game ? value.settings.source : 'starter');
    setSeconds(value.selected_game ? value.settings.seconds : 9);
    setCount(value.settings.question_count);
    setTopic(value.settings.topic || 'Tất cả');
    setLesson(value.settings.lesson_id || '');
  }, [configuration]);
  useEffect(() => {
    if (source !== 'lesson') return;
    let valid = true;
    gameService
      .catalog(level, page)
      .then(value => {
        if (valid) setCatalog(value);
      })
      .catch(failure => {
        if (valid)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không tải được bài học.',
          );
      });
    return () => {
      valid = false;
    };
  }, [source, level, page]);
  const backToLobby = useCallback(() => setInLobby(true), []);
  const bottom = useBottomNavigationInset();
  const leave = useCallback(() => {
    sharedRoomService
      .action(code, 'leave')
      .catch(() => undefined)
      .then(onExit);
  }, [code, onExit]);
  const copy = async () => {
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
  if (
    room &&
    room.phase !== 'waiting' &&
    room.phase !== 'closed' &&
    room.game &&
    !inLobby
  )
    return (
      <View style={s.gameWrapper} key={room.round}>
        {renderGame(
          room.game,
          code,
          backToLobby,
          audio.current
            ? {
                instance: audio.current,
                ready: audioReady,
                onStatus: setAudioReady,
                blocked: playbackBlocked,
              }
            : undefined,
        )}
      </View>
    );
  const host = room?.host_id === userId,
    me = room?.members.find(p => p.id === userId),
    idle =
      room?.phase === 'waiting' ||
      room?.phase === 'finished' ||
      room?.phase === 'closed';
  const gameTitle =
    choices.find(item => item.id === room?.selected_game)?.title ||
    'Chưa chọn game';
  return (
    <ScrollView
      contentContainerStyle={[
        s.content,
        { paddingBottom: bottom + spacing.section },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenBackHeader
        title="Phòng chờ"
        backLabel="Rời phòng, về kho game"
        onBack={leave}
      />
      <AuthNotice error message={error} />
      {!room ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={s.card}>
            <View style={s.between}>
              <View>
                <Text style={s.caption}>Mã phòng dùng chung</Text>
                <Text selectable style={s.code}>
                  {code}
                </Text>
              </View>
              <AuthButton
                label={copied ? 'Đã sao chép' : 'Mời bạn'}
                size="compact"
                variant="outline"
                onPress={copy}
              />
            </View>
            <Text style={s.caption}>
              {room.members.length}/8 người · {gameTitle}
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.title}>Người chơi</Text>
            {room.members.map(player => (
              <View key={player.id} style={s.member}>
                <MomoGameSprite size={42} />
                <View style={s.grow}>
                  <Text style={s.name}>
                    {player.name}
                    {player.id === userId ? ' (Bạn)' : ''}
                  </Text>
                  <Text style={s.caption}>
                    {player.id === room.host_id
                      ? 'Chủ phòng'
                      : player.ready
                      ? 'Sẵn sàng'
                      : 'Chưa sẵn sàng'}
                  </Text>
                </View>
                {player.ready ? <Text style={s.success}>Sẵn sàng</Text> : null}
              </View>
            ))}
          </View>
          {host && idle ? (
            <View style={s.card}>
              <Text style={s.title}>Chọn game</Text>
              <View style={s.games}>
                {choices.map(item => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={'Chọn ' + item.title}
                    accessibilityState={{ selected: game === item.id }}
                    onPress={() => {
                      setGame(item.id);
                      setSource(item.id === 'castle' ? 'starter' : 'jlpt');
                      setSeconds(item.id === 'castle' ? 9 : 15);
                      setLesson('');
                    }}
                    style={[s.gameChoice, game === item.id && s.gameChosen]}
                  >
                    {item.id === 'castle' ? (
                      <MomoGameSprite size={64} tier={1} />
                    ) : (
                      <NihongoMascot
                        size={64}
                        pose={item.id === 'read' ? 'speaking' : 'writing'}
                        decorative
                      />
                    )}
                    <Text style={s.name}>{item.title}</Text>
                    <Text style={s.caption}>{item.players}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.label}>Trình độ</Text>
              <View style={s.row}>
                {['N5', 'N4', 'N3', 'N2', 'N1'].map(item => (
                  <Option
                    key={item}
                    label={item}
                    chosen={level === item}
                    onPress={() => {
                      setLevel(item);
                      setTopic('Tất cả');
                      setLesson('');
                      setPage(1);
                    }}
                  />
                ))}
              </View>
              <Text style={s.label}>Nguồn từ</Text>
              <View style={s.row}>
                <Option
                  label={game === 'castle' ? 'Bộ từ khởi động' : 'JLPT'}
                  chosen={source !== 'lesson'}
                  onPress={() =>
                    setSource(game === 'castle' ? 'starter' : 'jlpt')
                  }
                />
                <Option
                  label="Bài học"
                  chosen={source === 'lesson'}
                  onPress={() => setSource('lesson')}
                />
              </View>
              {game === 'castle' && source !== 'lesson' ? (
                <>
                  <Text style={s.label}>Chủ đề</Text>
                  <View style={s.row}>
                    {[
                      'Tất cả',
                      ...new Set(
                        starterWords
                          .filter(w => w.level === level)
                          .map(w => w.category),
                      ),
                    ].map(item => (
                      <Option
                        key={item}
                        label={item}
                        chosen={topic === item}
                        onPress={() => setTopic(item)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {source === 'lesson' ? (
                <>
                  <View style={s.row}>
                    {catalog?.lessons.map(item => (
                      <Option
                        key={item.id}
                        label={item.title + ' · ' + item.textbook}
                        chosen={lesson === item.id}
                        onPress={() => setLesson(item.id)}
                      />
                    ))}
                  </View>
                  <View style={s.row}>
                    <Option
                      label="←"
                      disabled={page <= 1}
                      onPress={() => setPage(n => n - 1)}
                    />
                    <Text style={s.caption}>
                      {page}/{catalog?.total_pages || 1}
                    </Text>
                    <Option
                      label="→"
                      disabled={page >= (catalog?.total_pages || 1)}
                      onPress={() => setPage(n => n + 1)}
                    />
                  </View>
                </>
              ) : null}
              <Text style={s.label}>Thời gian mỗi câu</Text>
              <View style={s.row}>
                {(game === 'castle' ? [8, 9, 10] : [10, 15, 20, 30]).map(
                  value => (
                    <Option
                      key={value}
                      label={value + ' giây'}
                      chosen={seconds === value}
                      onPress={() => setSeconds(value)}
                    />
                  ),
                )}
              </View>
              {game !== 'castle' ? (
                <>
                  <Text style={s.label}>Số câu</Text>
                  <View style={s.row}>
                    {[2, 5, 10, 15, 20, 30].map(value => (
                      <Option
                        key={value}
                        label={value + ' câu'}
                        chosen={count === value}
                        onPress={() => setCount(value)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              <View style={s.row}>
                <AuthButton
                  label="Áp dụng"
                  size="compact"
                  busy={busy}
                  disabled={source === 'lesson' && !lesson}
                  onPress={() =>
                    action('select', {
                      game,
                      level,
                      source,
                      topic,
                      seconds,
                      question_count: count,
                      lesson_id: source === 'lesson' ? lesson : null,
                    })
                  }
                />
              </View>
            </View>
          ) : null}
          <View style={s.card}>
            <Text style={s.title}>
              {room.phase === 'closed'
                ? 'Trận đã dừng'
                : room.phase === 'finished'
                ? 'Trò tiếp theo'
                : room.phase === 'waiting'
                ? gameTitle
                : 'Trận đang diễn ra'}
            </Text>
            {room.phase === 'finished' ? (
              <Text style={s.caption}>
                Chờ chủ phòng chọn và áp dụng trò tiếp theo.
              </Text>
            ) : null}
            {room.selected_game === 'castle' && room.members.length !== 2 ? (
              <Text style={s.caption}>
                Công thành cần đúng 2 người. Hai trò còn lại hỗ trợ 2–8 người.
              </Text>
            ) : null}
            {room.selected_game === 'read' && !room.read_available ? (
              <Text style={s.caption}>
                Âm thanh trên máy chủ chưa sẵn sàng.
              </Text>
            ) : null}
            {room.selected_game === 'read' && room.configured ? (
              <View style={s.row}>
                <AuthButton
                  label={
                    playbackBlocked
                      ? 'Bật âm thanh'
                      : audioReady
                      ? 'Âm thanh đã sẵn sàng'
                      : 'Kiểm tra âm thanh'
                  }
                  size="compact"
                  variant="outline"
                  disabled={busy || !room.read_available}
                  onPress={prepareAudio}
                />
              </View>
            ) : null}
            <View style={s.row}>
              <AuthButton
                label={me?.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
                size="compact"
                variant="outline"
                disabled={
                  busy ||
                  room.phase !== 'waiting' ||
                  !room.configured ||
                  (room.selected_game === 'read' &&
                    (!audioReady || playbackBlocked))
                }
                onPress={() => action('ready', { ready: !me?.ready })}
              />
              {host ? (
                <AuthButton
                  label="Bắt đầu trận"
                  size="compact"
                  busy={busy}
                  disabled={
                    room.phase !== 'waiting' ||
                    !room.configured ||
                    room.members.length < 2 ||
                    !room.members.every(p => p.ready) ||
                    (room.selected_game === 'castle' &&
                      room.members.length !== 2)
                  }
                  onPress={() => action('start')}
                />
              ) : null}
              {room.phase !== 'waiting' &&
              room.phase !== 'closed' &&
              room.game ? (
                <AuthButton
                  label="Xem trận / kết quả"
                  size="compact"
                  variant="text"
                  onPress={() => setInLobby(false)}
                />
              ) : null}
            </View>
            <View style={s.row}>
              <AuthButton
                label="Rời phòng"
                size="compact"
                variant="text"
                disabled={busy}
                onPress={() => action('leave')}
              />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  gameWrapper: { flex: 1 },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    maxWidth: 1160,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.xl,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.dark },
  caption: { ...typography.body, color: colors.muted },
  name: { ...typography.caption, color: colors.dark },
  label: { ...typography.caption, color: colors.body },
  code: {
    ...typography.title,
    fontSize: 26,
    lineHeight: 36,
    letterSpacing: 3,
    color: colors.focus,
  },
  grow: { flex: 1 },
  member: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  success: { ...typography.caption, color: colors.success },
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gameChoice: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    flexGrow: 1,
    minWidth: 140,
  },
  gameChosen: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
  },
  option: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chosen: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { ...typography.caption, color: colors.primary },
  chosenText: { color: colors.onPrimary },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
});

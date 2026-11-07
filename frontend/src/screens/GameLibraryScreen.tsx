import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { AuthButton, AuthField, AuthNotice } from '../components/AuthForm';
import { NihongoMascot, MascotPose } from '../components/NihongoMascot';
import { MomoGameSprite } from '../games/castle/MomoGameSprite';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
import { ChevronRightIcon } from '../components/icons';
import { useWebLayout } from '../hooks/useWebLayout';
import { useBottomNavigationInset } from '../hooks/useBottomNavigationInset';
import { colors, radius, spacing, typography, shadowSm } from '../theme/theme';

export type LibraryGame = 'castle' | 'write' | 'read';
const games: {
  id: LibraryGame;
  title: string;
  description: string;
  players: string;
  pose: MascotPose;
}[] = [
  {
    id: 'castle',
    title: 'Công thành Momo',
    description: 'Trả lời đúng, gọi Momo bảo vệ lâu đài.',
    players: 'Đấu máy · Online 1v1',
    pose: 'wave',
  },
  {
    id: 'read',
    title: 'Giành mic',
    description: 'Giành lượt và đọc từ tiếng Nhật.',
    players: '2–8 người · Online',
    pose: 'speaking',
  },
  {
    id: 'write',
    title: 'Đối kháng từ vựng',
    description: 'Thi viết cách đọc đúng và nhanh.',
    players: '2–8 người · Online',
    pose: 'writing',
  },
];
export function GameLibraryScreen({
  onOpen,
  onJoin,
  onExit,
  onCreate,
  onBot,
  busy = false,
  error: serverError = '',
}: {
  onOpen: (game: LibraryGame) => void;
  onJoin: (code: string) => void;
  onExit: () => void;
  onCreate?: () => void;
  onBot?: () => void;
  busy?: boolean;
  error?: string;
}) {
  const [code, setCode] = useState(''),
    [error, setError] = useState('');
  const layout = useWebLayout(),
    bottom = useBottomNavigationInset();
  const { width } = useWindowDimensions();
  const contentWidth = layout.contentWidth || width;
  const [gridWidth, setGridWidth] = useState(0);
  const available = gridWidth || Math.min(1160, contentWidth) - spacing.xl * 2;
  const columns = available >= 900 ? 3 : available >= 600 ? 2 : 1;
  const cardWidth = (available - spacing.lg * (columns - 1)) / columns;
  const join = () => {
    const value = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(value)) {
      setError('Bạn hãy nhập mã phòng gồm 6 ký tự.');
      return;
    }
    setError('');
    onJoin(value);
  };
  return (
    <ScrollView
      contentContainerStyle={[
        s.content,
        { paddingBottom: bottom + spacing.section },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenBackHeader
        title="Kho game"
        backLabel="Quay lại luyện tập"
        onBack={onExit}
      />
      <AuthNotice error message={serverError} />
      {onCreate ? (
        <View style={s.playRow}>
          <Text style={s.description}>Một mã phòng cho tất cả trò chơi</Text>
          <AuthButton
            label="Tạo phòng"
            size="compact"
            busy={busy}
            onPress={onCreate}
          />
        </View>
      ) : null}
      <View
        style={s.grid}
        onLayout={event => setGridWidth(event.nativeEvent.layout.width)}
      >
        {games.map(game => (
          <Pressable
            key={game.id}
            accessibilityRole="button"
            accessibilityLabel={'Chơi ' + game.title}
            disabled={busy}
            onPress={() => onOpen(game.id)}
            style={({ pressed }) => [
              s.card,
              { width: cardWidth },
              pressed && s.cardPressed,
            ]}
          >
            <View style={s.art}>
              <View style={s.artCircle} />
              {game.id === 'castle' ? (
                <MomoGameSprite size={128} tier={2} />
              ) : (
                <NihongoMascot size={128} pose={game.pose} decorative />
              )}
            </View>
            <View style={s.cardContent}>
              <Text style={s.title}>{game.title}</Text>
              <Text style={s.description}>{game.description}</Text>
              <Text style={s.caption}>{game.players}</Text>
              <View style={s.playRow}>
                <Text style={s.play}>Chọn game</Text>
                <ChevronRightIcon size={16} color={colors.primary} />
              </View>
            </View>
          </Pressable>
        ))}
      </View>
      {onBot ? (
        <View style={s.playRow}>
          <AuthButton
            label="Đấu máy với Momo"
            size="compact"
            variant="text"
            onPress={onBot}
          />
        </View>
      ) : null}
      <View style={s.joinCard}>
        <Text style={s.sectionTitle}>Tham gia phòng</Text>
        <View style={s.joinRow}>
          <View style={s.field}>
            <AuthField
              label="Mã phòng"
              value={code}
              onChangeText={value => {
                setCode(value.toUpperCase());
                setError('');
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={join}
              returnKeyType="go"
            />
          </View>
          <AuthButton label="Vào phòng" size="compact" onPress={join} />
        </View>
        <AuthNotice error message={error} />
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.xxl,
    maxWidth: 1160,
    width: '100%',
    alignSelf: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
    boxShadow: shadowSm,
  },
  cardPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
  },
  art: {
    height: 168,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artCircle: {
    position: 'absolute',
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: colors.badgeBg,
  },
  cardContent: { padding: spacing.xl, gap: spacing.sm },
  title: { ...typography.title, color: colors.dark },
  description: { ...typography.body, color: colors.body },
  caption: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  playRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  play: { ...typography.button, color: colors.primary },
  joinCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 520,
    width: '100%',
  },
  sectionTitle: { ...typography.heading, color: colors.dark },
  joinRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  field: { flex: 1, minWidth: 160 },
});

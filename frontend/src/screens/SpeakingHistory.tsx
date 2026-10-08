import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import {
  ConversationSummary,
  ConversationHistory,
  speakingService,
} from '../services/speakingService';
import { colors, layout, spacing, typography } from '../theme/theme';

const statusLabels = {
  active: 'Có thể tiếp tục',
  paused: 'Đã tạm dừng',
  completed: 'Đã hoàn thành',
  abandoned: 'Đã kết thúc',
};
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const keyExtractor = (item: ConversationSummary) => item.id;
const HistoryRow = memo(function HistoryRowView({
  item,
  onOpen,
  disabled,
}: {
  item: ConversationSummary;
  onOpen: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở hội thoại ${item.title}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onOpen(item.id)}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.rowHeading}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.title}
        </Text>
        <HomeFeatureIcon name="arrow" color={colors.muted} size={18} />
      </View>
      <Text numberOfLines={2} style={styles.preview}>
        {item.last_message || 'Chưa có tin nhắn. Mở để bắt đầu hội thoại.'}
      </Text>
      <Text style={styles.meta}>
        {item.role_name} · {statusLabels[item.status]}
      </Text>
      <Text style={styles.meta}>
        {dateFormat.format(new Date(item.last_activity_at))}
      </Text>
    </Pressable>
  );
});

export function SpeakingHistory({
  refreshKey,
  opening,
  openError,
  onOpen,
}: {
  refreshKey: number;
  opening: boolean;
  openError: string;
  onOpen: (id: string) => void;
}) {
  const [data, setData] = useState<ConversationHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  const requestedPage = useRef(1);
  const fetchPage = useCallback(async (page = 1) => {
    if (page > 1 && busy.current) return;
    const current = ++generation.current;
    busy.current = true;
    requestedPage.current = page;
    setError('');
    if (page === 1) setLoading(true);
    else setMore(true);
    try {
      const result = await speakingService.history(page);
      if (current !== generation.current) return;
      setData(previous =>
        page === 1
          ? result
          : {
              ...result,
              items: [
                ...new Map(
                  [...(previous?.items || []), ...result.items].map(item => [
                    item.id,
                    item,
                  ]),
                ).values(),
              ],
            },
      );
    } catch (failure) {
      if (current === generation.current) setError(errorMessage(failure));
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setLoading(false);
        setMore(false);
      }
    }
  }, []);
  useEffect(() => {
    fetchPage();
    return () => {
      generation.current += 1;
    };
  }, [fetchPage, refreshKey]);
  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => (
      <HistoryRow item={item} onOpen={onOpen} disabled={opening} />
    ),
    [onOpen, opening],
  );
  return (
    <FlatList
      data={data?.items || []}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshing={loading}
      onRefresh={() => fetchPage()}
      ListHeaderComponent={
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            Hội thoại gần đây
          </Text>
          {opening ? (
            <ActivityIndicator
              color={colors.primaryText}
              accessibilityLabel="Đang mở hội thoại"
            />
          ) : null}
          <AuthNotice message={openError} error />
          <AuthNotice message={error} error />
          {error ? (
            <AuthButton
              label="Tải lại lịch sử"
              variant="text"
              onPress={() => fetchPage(requestedPage.current)}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primaryText} />
            <Text style={styles.preview}>Đang tải lịch sử…</Text>
          </View>
        ) : !error ? (
          <View style={styles.empty}>
            <HomeFeatureIcon
              name="microphone"
              color={colors.primaryText}
              size={32}
            />
            <Text style={styles.rowTitle}>
              Cuộc trò chuyện đầu tiên của bạn
            </Text>
            <Text style={styles.preview}>
              Bắt đầu một cuộc trò chuyện mới để luyện nói. Các phiên của bạn sẽ
              được lưu tại đây.
            </Text>
          </View>
        ) : undefined
      }
      ListFooterComponent={
        data && data.pagination.page < data.pagination.total_pages ? (
          <AuthButton
            label="Xem thêm hội thoại"
            variant="text"
            busy={more}
            disabled={loading || opening}
            onPress={() => fetchPage(data.pagination.page + 1)}
          />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingBottom: spacing.lg },
  heading: {
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.heading, color: colors.dark },
  row: {
    minHeight: layout.touchTarget,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  pressed: { backgroundColor: colors.surfaceTint },
  rowHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { ...typography.heading, color: colors.dark, flexShrink: 1 },
  preview: { ...typography.input, color: colors.body },
  meta: { ...typography.caption, color: colors.muted },
  empty: {
    padding: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.surfaceTint,
    gap: spacing.md,
  },
});

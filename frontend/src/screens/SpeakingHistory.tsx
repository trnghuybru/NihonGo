import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { TrashIcon } from '../components/icons';
import { errorMessage } from '../hooks/useSpeakingScenarios';
import {
  ConversationSummary,
  ConversationHistory,
  speakingService,
} from '../services/speakingService';
import { colors, layout, spacing, typography } from '../theme/theme';

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function activityLabel(timestamp: string) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return `Hôm nay, ${timeFormat.format(date)}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `Hôm qua, ${timeFormat.format(date)}`;
  }
  return dateFormat.format(date);
}
const keyExtractor = (item: ConversationSummary) => item.id;
const HistoryRow = memo(function HistoryRowView({
  item,
  onOpen,
  disabled,
  onDelete,
  deleting,
}: {
  item: ConversationSummary;
  onOpen: (id: string) => void;
  disabled: boolean;
  deleting: boolean;
  onDelete: (item: ConversationSummary) => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mở hội thoại ${item.title}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onOpen(item.id)}
        style={({ pressed }) => [
          styles.rowContent,
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={styles.rowHeading}>
          <View style={styles.headingCopy}>
            <HomeFeatureIcon name="microphone" color={colors.body} size={22} />
            <Text numberOfLines={2} style={styles.rowTitle}>
              {item.title}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.preview}>
          {item.last_message || 'Chưa có tin nhắn. Mở để bắt đầu hội thoại.'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Xóa hội thoại ${item.title}`}
        accessibilityState={{ disabled, busy: deleting }}
        disabled={disabled}
        onPress={() => onDelete(item)}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed ? styles.pressed : null,
        ]}
      >
        {deleting ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <TrashIcon
            size={16}
            color={disabled ? colors.disabledText : colors.muted}
          />
        )}
      </Pressable>
      <View style={styles.rowFooter}>
        <Text style={styles.date}>{activityLabel(item.last_activity_at)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${
            item.status === 'active' ? 'Tiếp tục' : 'Xem lại'
          } hội thoại ${item.title}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onOpen(item.id)}
          style={[styles.action, disabled ? styles.actionDisabled : null]}
        >
          <Text
            style={[
              styles.actionText,
              disabled ? styles.actionTextDisabled : null,
            ]}
          >
            {item.status === 'active' ? 'Tiếp tục' : 'Xem lại'}
          </Text>
        </Pressable>
      </View>
    </View>
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
  const mounted = useRef(true);
  const deletingRef = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fetchPage = useCallback(async (page = 1) => {
    if (deletingRef.current) return;
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
  const confirmDelete = useCallback(
    (item: ConversationSummary) => {
      if (opening || deletingRef.current) return;
      Alert.alert(
        'Xóa buổi hội thoại?',
        `Xóa “${item.title}” cùng nội dung, nhận xét và âm thanh đã lưu? Thao tác này không thể khôi phục.`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa',
            style: 'destructive',
            onPress: async () => {
              if (!mounted.current || deletingRef.current) return;
              deletingRef.current = true;
              generation.current += 1; // Ignore any history response started before deletion.
              busy.current = false;
              setDeletingId(item.id);
              setDeleteError('');
              setLoading(false);
              setMore(false);
              try {
                await speakingService.deleteSession(item.id);
                if (!mounted.current) return;
                setData(previous =>
                  previous
                    ? {
                        ...previous,
                        items: previous.items.filter(row => row.id !== item.id),
                      }
                    : previous,
                );
                deletingRef.current = false;
                await fetchPage(); // Refresh pagination after removing a row.
              } catch (failure) {
                if (mounted.current) setDeleteError(errorMessage(failure));
              } finally {
                deletingRef.current = false;
                if (mounted.current) setDeletingId(null);
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [opening, fetchPage],
  );
  useEffect(() => {
    fetchPage();
    return () => {
      generation.current += 1;
    };
  }, [fetchPage, refreshKey]);
  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => (
      <HistoryRow
        item={item}
        onOpen={onOpen}
        onDelete={confirmDelete}
        deleting={deletingId === item.id}
        disabled={opening || deletingId !== null}
      />
    ),
    [onOpen, opening, confirmDelete, deletingId],
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
          <AuthNotice message={deleteError} error />
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
            disabled={loading || opening || deletingId !== null}
            onPress={() => fetchPage(data.pagination.page + 1)}
          />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 1,
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.section,
    gap: spacing.lg,
    width: '100%',
    maxWidth: layout.maxContentWidth + layout.screenGutter * 2,
    alignSelf: 'center',
  },
  heading: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  title: { ...typography.heading, color: colors.dark },
  row: {
    minHeight: layout.touchTarget,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.divider,
    boxShadow: '0px 3px 12px rgba(37, 37, 38, 0.06)',
  },
  pressed: { backgroundColor: colors.surfaceTint },
  rowContent: { gap: spacing.md },
  deleteButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.sm,
    width: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  rowHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    paddingRight: layout.touchTarget + spacing.sm - spacing.xl,
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: { ...typography.heading, color: colors.dark, flexShrink: 1 },
  preview: { ...typography.input, color: colors.body },
  date: {
    ...typography.caption,
    color: colors.muted,
    flex: 1,
    flexShrink: 1,
    textAlign: 'left',
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  action: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  actionDisabled: {
    backgroundColor: colors.disabled,
    borderColor: colors.disabled,
  },
  actionText: { ...typography.button, color: colors.primaryText },
  actionTextDisabled: { color: colors.disabledText },
  empty: {
    padding: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.surfaceTint,
    gap: spacing.md,
  },
});

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Modal,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { ConversationScreen } from './ConversationScreen';
import { MISSING_DATA } from '../config/content';
import {
  errorMessage,
  useRemoteResource,
  useScenarioList,
} from '../hooks/useSpeakingScenarios';
import type { LearningLevel } from '../services/learningService';
import {
  ScenarioDetail,
  SpeakingScenario,
  StartedSession,
  StartSessionInput,
  speakingService,
} from '../services/speakingService';
import { colors, layout, spacing, typography } from '../theme/theme';

type Page = 'list' | 'started';
type LevelFilter = LearningLevel | 'all';
const levels: readonly LevelFilter[] = [
  'all',
  'beginner',
  'N5',
  'N4',
  'N3',
  'N2',
  'N1',
];
const keyExtractor = (item: { id: string }) => item.id;
const levelText = (level: LevelFilter) =>
  level === 'all'
    ? 'Mọi trình độ'
    : level === 'beginner'
    ? 'Mới bắt đầu'
    : level;

function Option({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.filterOption,
        selected ? styles.filterOptionSelected : null,
      ]}
    >
      <Text
        style={[
          styles.filterOptionText,
          selected ? styles.filterOptionTextSelected : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
const ScenarioCard = memo(function ScenarioCardView({
  scenario,
  onPress,
}: {
  scenario: SpeakingScenario;
  onPress: (scenario: SpeakingScenario) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${scenario.title}, ${
        scenario.category.name
      }, trình độ ${levelText(scenario.difficulty_level)}, ${
        scenario.estimated_duration_minutes
      } phút. Xem chi tiết`}
      onPress={() => onPress(scenario)}
      style={({ pressed }) => [
        styles.scenarioCard,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleCopy}>
          <Text style={styles.scenarioTitle}>{scenario.title}</Text>
          <Text style={styles.levelLabel}>
            {levelText(scenario.difficulty_level)} ·{' '}
            {scenario.estimated_duration_minutes} phút
          </Text>
          <Text numberOfLines={2} style={styles.scenarioDescription}>
            {scenario.description}
          </Text>
        </View>
        <HomeFeatureIcon name="arrow" color={colors.muted} size={18} />
      </View>
    </Pressable>
  );
});
function LoadNotice({
  loading,
  message,
  onRetry,
}: {
  loading: boolean;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      {loading ? (
        <>
          <ActivityIndicator color={colors.primaryText} />
          <Text style={styles.emptyText}>Đang tải tình huống…</Text>
        </>
      ) : (
        <>
          <AuthNotice message={message || 'Không tải được dữ liệu.'} error />
          <AuthButton label="Thử lại" onPress={onRetry} />
        </>
      )}
    </View>
  );
}
function ScenarioPreview({
  scenario,
  onStart,
  busy,
  startError,
  existingSession,
}: {
  scenario: ScenarioDetail;
  onStart: (input: StartSessionInput) => void;
  busy: boolean;
  startError: string;
  existingSession: StartedSession | null;
}) {
  const [roleId, setRoleId] = useState(
    existingSession?.session.scenario_role_id || scenario.roles[0]?.id || '',
  );
  const role = scenario.roles.find(item => item.id === roleId);
  return (
    <View style={styles.previewContent}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {scenario.title}
      </Text>
      <Text style={styles.resultCount}>
        {scenario.category.name} · {levelText(scenario.difficulty_level)} ·{' '}
        {scenario.estimated_duration_minutes} phút
      </Text>
      <Text style={styles.scenarioDescription}>
        {scenario.context || scenario.description || MISSING_DATA}
      </Text>
      {scenario.learning_objectives ? (
        <Text style={styles.scenarioDescription}>
          Bạn sẽ luyện: {scenario.learning_objectives}
        </Text>
      ) : null}
      {scenario.roles.length > 1 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Chọn vai hội thoại"
          style={styles.optionWrap}
        >
          {scenario.roles.map(item => (
            <Option
              key={item.id}
              label={item.name}
              selected={item.id === roleId}
              disabled={busy || Boolean(existingSession)}
              onPress={() => setRoleId(item.id)}
            />
          ))}
        </View>
      ) : null}
      <AuthNotice message={startError} error />
      <AuthButton
        label="Tiếp tục"
        busy={busy}
        disabled={!role}
        onPress={() =>
          onStart({
            role_id: roleId,
            input_mode: 'text',
            audio_storage_enabled: false,
          })
        }
      />
    </View>
  );
}
export function SpeakingScenariosScreen() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [started, setStarted] = useState<StartedSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const startPending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const categoryResource = useRemoteResource(speakingService.categories);
  const loadDetail = useCallback(
    () =>
      selectedId ? speakingService.detail(selectedId) : Promise.resolve(null),
    [selectedId],
  );
  const detail = useRemoteResource(loadDetail);
  const list = useScenarioList({
    category_id: category === 'all' ? undefined : category,
    level: level === 'all' ? undefined : level,
    q: query,
  });
  const categories =
    categoryResource.state.status === 'ready'
      ? categoryResource.state.data
      : [];
  const categoryName =
    category === 'all'
      ? 'Tất cả chủ đề'
      : categories.find(item => item.id === category)?.name || MISSING_DATA;
  const sections = useMemo(() => {
    if (list.state.status !== 'ready') return [];
    const groups = new Map<
      string,
      {
        id: string;
        title: string;
        description: string | null;
        data: SpeakingScenario[];
      }
    >();
    for (const item of list.state.data.items) {
      const group = groups.get(item.category.id) || {
        id: item.category.id,
        title: item.category.name,
        description: item.category.description,
        data: [],
      };
      group.data.push(item);
      groups.set(item.category.id, group);
    }
    return [...groups.values()];
  }, [list.state]);
  const filterCount =
    Number(category !== 'all') +
    Number(level !== 'all') +
    Number(Boolean(query));
  const goBack = useCallback(() => {
    if (startPending.current) return;
    setSelectedId(null);
    setStartError('');
    setPage('list');
  }, []);
  useEffect(() => {
    if (page !== 'started') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [goBack, page]);
  const openScenario = useCallback((item: SpeakingScenario) => {
    setSelectedId(item.id);
    setStarted(previous =>
      previous?.session.scenario_id === item.id ? previous : null,
    );
    setStartError('');
  }, []);
  const renderScenario = useCallback(
    ({ item }: { item: SpeakingScenario }) => (
      <ScenarioCard scenario={item} onPress={openScenario} />
    ),
    [openScenario],
  );
  const clearFilters = useCallback(() => {
    setCategory('all');
    setLevel('all');
    setQuery('');
    setQueryDraft('');
  }, []);
  const begin = async (values: StartSessionInput) => {
    if (started) {
      setPage('started');
      return;
    }
    if (!selectedId || startPending.current) return;
    startPending.current = true;
    setStarting(true);
    setStartError('');
    try {
      const result = await speakingService.start(selectedId, values);
      if (mounted.current) {
        setStarted(result);
        setPage('started');
      }
    } catch (error) {
      if (mounted.current) setStartError(errorMessage(error));
    } finally {
      startPending.current = false;
      if (mounted.current) setStarting(false);
    }
  };
  if (page === 'started' && started)
    return (
      <ConversationScreen
        key={started.session.id}
        result={started}
        onBack={goBack}
      />
    );
  const listPadding = [
    styles.listContent,
    Platform.OS === 'android' ? { paddingTop: insets.top + spacing.lg } : null,
  ];
  return (
    <View style={styles.fill}>
      <SectionList
        accessibilityElementsHidden={Boolean(selectedId)}
        importantForAccessibility={selectedId ? 'no-hide-descendants' : 'auto'}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderScenario}
        stickySectionHeadersEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={listPadding}
        renderSectionHeader={({ section }) => (
          <View style={styles.categorySectionHeader}>
            <View style={styles.categorySectionCopy}>
              <Text style={styles.categorySectionTitle}>{section.title}</Text>
            </View>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.listIntro}>
              <Text accessibilityRole="header" style={styles.pageTitle}>
                Tình huống
              </Text>
            </View>
            <View style={styles.optionGroup}>
              <Text style={styles.optionHeading}>Chủ đề</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
                accessibilityRole="radiogroup"
                accessibilityLabel="Chọn chủ đề"
              >
                <Option
                  label="Tất cả chủ đề"
                  selected={category === 'all'}
                  onPress={() => setCategory('all')}
                />
                {categories.map(item => (
                  <Option
                    key={item.id}
                    label={item.name}
                    selected={category === item.id}
                    onPress={() => setCategory(item.id)}
                  />
                ))}
              </ScrollView>
              {categoryResource.state.status === 'loading' ? (
                <Text style={styles.resultCount}>Đang tải chủ đề…</Text>
              ) : null}
              {categoryResource.state.status === 'error' ? (
                <View>
                  <AuthNotice message={categoryResource.state.message} error />
                  <AuthButton
                    label="Tải lại chủ đề"
                    variant="text"
                    onPress={categoryResource.reload}
                  />
                </View>
              ) : null}
            </View>
            <View style={styles.optionGroup}>
              <Text style={styles.optionHeading}>Trình độ</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
                accessibilityRole="radiogroup"
                accessibilityLabel="Chọn trình độ"
              >
                {levels.map(item => (
                  <Option
                    key={item}
                    label={levelText(item)}
                    selected={level === item}
                    onPress={() => setLevel(item)}
                  />
                ))}
              </ScrollView>
            </View>
            <View style={styles.searchRow}>
              <TextInput
                accessibilityLabel="Tìm tình huống"
                placeholder="Tìm tên hoặc mô tả"
                value={queryDraft}
                onChangeText={setQueryDraft}
                maxLength={200}
                returnKeyType="search"
                onSubmitEditing={() => setQuery(queryDraft.trim())}
                style={styles.searchInput}
              />
              <AuthButton
                label="Tìm kiếm"
                variant="outline"
                onPress={() => setQuery(queryDraft.trim())}
              />
            </View>
            <View style={styles.listSectionHeading}>
              <View style={styles.listSectionCopy}>
                {list.state.status === 'ready' ? (
                  <Text style={styles.resultCount}>
                    {list.state.data.pagination.total} tình huống ·{' '}
                    {categoryName}
                  </Text>
                ) : null}
              </View>
              {filterCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xóa tất cả bộ lọc"
                  onPress={clearFilters}
                  style={styles.clearFilter}
                >
                  <Text style={styles.clearFilterText}>Xóa bộ lọc</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          list.state.status !== 'ready' ? (
            <LoadNotice
              loading={list.state.status === 'loading'}
              message={
                list.state.status === 'error' ? list.state.message : undefined
              }
              onRetry={list.reload}
            />
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Chưa có tình huống phù hợp</Text>
              <Text style={styles.emptyText}>
                Chọn chủ đề hoặc trình độ khác.
              </Text>
              <AuthButton
                label="Xóa bộ lọc"
                variant="outline"
                onPress={clearFilters}
              />
            </View>
          )
        }
        ListFooterComponent={
          list.state.status === 'ready' &&
          list.state.data.pagination.page <
            list.state.data.pagination.total_pages ? (
            <View>
              <AuthNotice message={list.moreError} error />
              <AuthButton
                label="Tải thêm tình huống"
                busy={list.loadingMore}
                onPress={list.loadMore}
              />
            </View>
          ) : undefined
        }
      />
      {selectedId ? (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={goBack}
          supportedOrientations={['portrait', 'landscape']}
        >
          <View
            style={[
              styles.modalBackdrop,
              {
                paddingTop: insets.top + spacing.lg,
                paddingBottom: insets.bottom + spacing.lg,
              },
            ]}
          >
            <View accessibilityViewIsModal style={styles.modalCard}>
              <ScrollView contentContainerStyle={styles.modalContent}>
                {detail.state.status === 'ready' &&
                detail.state.data?.id === selectedId ? (
                  <ScenarioPreview
                    key={detail.state.data.id}
                    scenario={detail.state.data}
                    onStart={begin}
                    busy={starting}
                    startError={startError}
                    existingSession={started}
                  />
                ) : (
                  <LoadNotice
                    loading={detail.state.status !== 'error'}
                    message={
                      detail.state.status === 'error'
                        ? detail.state.message
                        : undefined
                    }
                    onRetry={detail.reload}
                  />
                )}
                <AuthButton
                  label="Đóng"
                  variant="text"
                  disabled={starting}
                  onPress={goBack}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: { gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: {
    flex: 1,
    minWidth: 0,
    ...typography.body,
    color: colors.dark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  fill: { flex: 1, backgroundColor: colors.surface },
  listContent: {
    flexGrow: 1,
    gap: 0,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.section,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  pageTitle: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 32,
    color: colors.dark,
  },
  listHeader: { gap: spacing.lg, marginBottom: spacing.xs },
  listIntro: { gap: spacing.sm },
  categorySectionHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categorySectionCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  categorySectionTitle: { ...typography.label, color: colors.muted },
  listSectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  listSectionCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  sectionTitle: { ...typography.title, color: colors.dark },
  resultCount: { ...typography.body, color: colors.muted },
  clearFilter: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  clearFilterText: { ...typography.caption, color: colors.primaryText },
  scenarioCard: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceTint },
  levelLabel: { ...typography.caption, color: colors.muted },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  scenarioTitle: { ...typography.heading, color: colors.dark },
  scenarioDescription: { ...typography.input, color: colors.body },
  emptyCard: {
    padding: spacing.xxl,
    gap: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  emptyTitle: { ...typography.title, color: colors.dark },
  emptyText: { ...typography.body, color: colors.body },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
  },
  modalCard: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    maxHeight: '100%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalContent: { padding: spacing.xl, gap: spacing.sm },
  previewContent: { gap: spacing.md },
  optionGroup: { gap: spacing.xs },
  optionHeading: { ...typography.caption, color: colors.muted },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterOption: {
    minHeight: layout.touchTarget,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterOptionSelected: {
    backgroundColor: colors.surfaceTint,
    borderColor: colors.badgeText,
  },
  filterOptionText: { ...typography.label, color: colors.body },
  filterOptionTextSelected: { color: colors.badgeText },
});

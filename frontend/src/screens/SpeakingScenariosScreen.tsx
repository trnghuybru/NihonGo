import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthIcon } from '../components/AuthIcon';
import { AuthButton, AuthNotice } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { ConversationScreen } from './ConversationScreen';
import { SpeakingHistory } from './SpeakingHistory';
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
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';

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
      style={({ pressed }) => [
        styles.filterOption,
        selected ? styles.filterOptionSelected : null,
        pressed
          ? selected
            ? styles.filterOptionPressed
            : styles.pressed
          : null,
        disabled ? styles.filterOptionDisabled : null,
      ]}
    >
      {selected ? (
        <AuthIcon
          name="check"
          size={16}
          color={disabled ? colors.disabledText : colors.onPrimary}
        />
      ) : null}
      <Text
        style={[
          styles.filterOptionText,
          selected ? styles.filterOptionTextSelected : null,
          disabled ? styles.filterOptionTextDisabled : null,
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
      } phút. Chọn ngữ cảnh`}
      onPress={() => onPress(scenario)}
      style={({ pressed }) => [
        styles.scenarioCard,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleCopy}>
          <Text style={styles.scenarioTitle}>{scenario.title}</Text>
          <View style={styles.metadataRow}>
            <Text style={styles.levelLabel}>
              {levelText(scenario.difficulty_level)}
            </Text>
            <Text style={styles.durationLabel}>
              {scenario.estimated_duration_minutes} phút
            </Text>
          </View>
          <Text numberOfLines={2} style={styles.scenarioDescription}>
            {scenario.description}
          </Text>
        </View>
        <View style={styles.scenarioArrow}>
          <HomeFeatureIcon name="arrow" color={colors.primaryText} size={20} />
        </View>
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
}: {
  scenario: ScenarioDetail;
  onStart: (input: StartSessionInput) => void;
  busy: boolean;
  startError: string;
}) {
  const [roleId, setRoleId] = useState(scenario.roles[0]?.id || '');
  const [saveAudio, setSaveAudio] = useState(true);
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
        {scenario.description || MISSING_DATA}
      </Text>
      {role ? (
        <View style={styles.roleNotice}>
          <View style={styles.roleIcon}>
            <AuthIcon name="user" size={20} />
          </View>
          <View style={styles.roleCopy}>
            <Text style={styles.optionHeading}>Vai AI</Text>
            <Text style={styles.scenarioTitle}>{role.name}</Text>
            <Text style={styles.resultCount}>{role.description}</Text>
          </View>
        </View>
      ) : null}
      {scenario.roles.length > 1 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Chọn vai AI"
          style={styles.optionWrap}
        >
          {scenario.roles.map(item => (
            <Option
              key={item.id}
              label={item.name}
              selected={item.id === roleId}
              disabled={busy}
              onPress={() => setRoleId(item.id)}
            />
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Lưu âm thanh để nghe lại"
        accessibilityState={{ checked: saveAudio, disabled: busy }}
        disabled={busy}
        onPress={() => setSaveAudio(value => !value)}
        style={styles.audioOption}
      >
        <Text style={styles.optionHeading}>
          {saveAudio ? '☑' : '☐'} Lưu âm thanh để nghe lại
        </Text>
        <Text style={styles.resultCount}>
          Lưu giọng của bạn và Aoi trong lịch sử hội thoại.
        </Text>
      </Pressable>
      <AuthNotice message={startError} error />
      <AuthButton
        label="Bắt đầu trò chuyện"
        busy={busy}
        disabled={!role}
        onPress={() =>
          onStart({
            role_id: roleId,
            input_mode: 'voice',
            audio_storage_enabled: saveAudio,
          })
        }
      />
    </View>
  );
}
export function SpeakingScenariosScreen() {
  const insets = useSafeAreaInsets();
  const [choosing, setChoosing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [queryDraft, setQueryDraft] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [started, setStarted] = useState<StartedSession | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [openingHistory, setOpeningHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const openingPending = useRef(false);
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
  const closeChooser = useCallback(() => {
    if (startPending.current) return;
    setSelectedId(null);
    setStartError('');
    setChoosing(false);
  }, []);
  const goBack = useCallback(() => {
    if (startPending.current) return;
    if (selectedId) {
      setSelectedId(null);
      setStartError('');
    } else {
      closeChooser();
    }
  }, [selectedId, closeChooser]);
  const openChooser = useCallback(() => {
    setSelectedId(null);
    setStartError('');
    setChoosing(true);
  }, []);
  const returnToHistory = useCallback(() => {
    setStarted(null);
    setHistoryError('');
    setHistoryVersion(value => value + 1);
  }, []);
  useEffect(() => {
    if (!started || choosing) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        returnToHistory();
        return true;
      },
    );
    return () => subscription.remove();
  }, [started, choosing, returnToHistory]);
  const openHistory = useCallback(async (id: string) => {
    if (openingPending.current) return;
    openingPending.current = true;
    setOpeningHistory(true);
    setHistoryError('');
    try {
      const result = await speakingService.session(id);
      if (mounted.current) setStarted(result);
    } catch (failure) {
      if (mounted.current) setHistoryError(errorMessage(failure));
    } finally {
      openingPending.current = false;
      if (mounted.current) setOpeningHistory(false);
    }
  }, []);
  const openScenario = useCallback((item: SpeakingScenario) => {
    setSelectedId(item.id);
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
    if (!selectedId || startPending.current) return;
    startPending.current = true;
    setStarting(true);
    setStartError('');
    try {
      const result = await speakingService.start(selectedId, values);
      if (mounted.current) {
        setStarted(result);
        setChoosing(false);
        setSelectedId(null);
      }
    } catch (error) {
      if (mounted.current) setStartError(errorMessage(error));
    } finally {
      startPending.current = false;
      if (mounted.current) setStarting(false);
    }
  };
  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={choosing}
        importantForAccessibility={choosing ? 'no-hide-descendants' : 'auto'}
      >
        {started ? (
          <ConversationScreen
            key={started.session.id}
            result={started}
            onBack={returnToHistory}
          />
        ) : (
          <View style={styles.chatShell}>
            <View
              style={[
                styles.speakingHeader,
                { paddingTop: insets.top + spacing.xxl },
              ]}
            >
              <View style={styles.speakingHeaderContent}>
                <View style={styles.speakingHeaderCopy}>
                  <Text accessibilityRole="header" style={styles.pageTitle}>
                    Luyện nói
                  </Text>
                  <Text style={styles.resultCount}>Hội thoại cùng AI</Text>
                </View>
                <AuthButton
                  label="Cuộc trò chuyện mới"
                  disabled={openingHistory}
                  onPress={openChooser}
                />
              </View>
            </View>
            <SpeakingHistory
              refreshKey={historyVersion}
              opening={openingHistory}
              openError={historyError}
              onOpen={openHistory}
            />
          </View>
        )}
      </View>
      {choosing ? (
        <Modal
          transparent
          visible
          animationType="slide"
          onRequestClose={goBack}
          supportedOrientations={['portrait', 'landscape']}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.modalBackdrop,
              {
                paddingTop: insets.top + spacing.md,
                paddingBottom: insets.bottom + spacing.md,
              },
            ]}
          >
            <View accessibilityViewIsModal style={styles.modalCard}>
              <View style={styles.modalHeading}>
                <View style={styles.modalIcon}>
                  <HomeFeatureIcon
                    name="microphone"
                    color={colors.primaryText}
                    size={24}
                  />
                </View>
                <View style={styles.modalHeadingCopy}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>
                    {selectedId ? 'Chuẩn bị hội thoại' : 'Chọn ngữ cảnh'}
                  </Text>
                  <Text style={styles.resultCount}>Luyện nói cùng AI</Text>
                </View>
              </View>
              {selectedId ? (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.modalContent}
                >
                  {detail.state.status === 'ready' &&
                  detail.state.data?.id === selectedId ? (
                    <ScenarioPreview
                      key={detail.state.data.id}
                      scenario={detail.state.data}
                      onStart={begin}
                      busy={starting}
                      startError={startError}
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
                    label="Chọn ngữ cảnh khác"
                    variant="text"
                    disabled={starting}
                    onPress={goBack}
                  />
                </ScrollView>
              ) : (
                <SectionList
                  sections={sections}
                  keyExtractor={keyExtractor}
                  renderItem={renderScenario}
                  stickySectionHeadersEnabled={false}
                  contentInsetAdjustmentBehavior="automatic"
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                  renderSectionHeader={({ section }) => (
                    <View style={styles.categorySectionHeader}>
                      <View style={styles.categorySectionCopy}>
                        <Text style={styles.categorySectionTitle}>
                          {section.title}
                        </Text>
                      </View>
                    </View>
                  )}
                  ListHeaderComponent={
                    <View style={styles.listHeader}>
                      <Text style={styles.resultCount}>
                        Chọn một tình huống bạn muốn thực hành hôm nay.
                      </Text>
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
                          <Text style={styles.resultCount}>
                            Đang tải chủ đề…
                          </Text>
                        ) : null}
                        {categoryResource.state.status === 'error' ? (
                          <View>
                            <AuthNotice
                              message={categoryResource.state.message}
                              error
                            />
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
                      <View style={styles.optionGroup}>
                        <Text style={styles.optionHeading}>Tìm tình huống</Text>
                        <View style={styles.searchRow}>
                          <TextInput
                            accessibilityLabel="Tìm tình huống"
                            placeholder="Tìm tên hoặc mô tả"
                            value={queryDraft}
                            onChangeText={setQueryDraft}
                            maxLength={200}
                            returnKeyType="search"
                            onSubmitEditing={() => setQuery(queryDraft.trim())}
                            placeholderTextColor={colors.placeholder}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setSearchFocused(false)}
                            style={[
                              styles.searchInput,
                              searchFocused ? styles.searchInputFocused : null,
                            ]}
                          />
                          <AuthButton
                            label="Tìm kiếm"
                            variant="outline"
                            onPress={() => setQuery(queryDraft.trim())}
                          />
                        </View>
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
                            <Text style={styles.clearFilterText}>
                              Xóa bộ lọc
                            </Text>
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
                          list.state.status === 'error'
                            ? list.state.message
                            : undefined
                        }
                        onRetry={list.reload}
                      />
                    ) : (
                      <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>
                          Chưa có tình huống phù hợp
                        </Text>
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
              )}
              <View style={styles.modalFooter}>
                <AuthButton
                  label="Đóng"
                  variant="text"
                  disabled={starting}
                  onPress={closeChooser}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chatShell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  speakingHeader: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.background,
    backgroundImage: [
      `linear-gradient(to bottom, rgba(255, 251, 247, 0) 45%, ${colors.background} 100%)`,
      'radial-gradient(ellipse at 82% 24%, rgba(248, 198, 181, 0.85) 0%, rgba(248, 198, 181, 0) 75%)',
      `linear-gradient(150deg, #FBE0BF 0%, ${colors.background} 100%)`,
    ].join(', '),
  },
  speakingHeaderContent: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: spacing.xxl,
  },
  speakingHeaderCopy: { gap: spacing.sm },
  audioOption: {
    minHeight: layout.touchTarget,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  modalHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.surface,
  },
  modalHeadingCopy: { flex: 1, gap: spacing.xs },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  durationLabel: { ...typography.caption, color: colors.muted },
  scenarioArrow: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleNotice: {
    padding: spacing.lg,
    borderRadius: radius.small,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceTint,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  roleIcon: { paddingTop: spacing.xs },
  roleCopy: { flex: 1, gap: spacing.xs },
  filterRow: { gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: {
    flex: 1,
    minWidth: 0,
    ...typography.input,
    color: colors.inputText,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: layout.inputHeight,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceTint,
  },
  searchInputFocused: {
    backgroundColor: colors.surface,
    borderColor: colors.focus,
  },
  fill: { flex: 1, backgroundColor: colors.surface },
  listContent: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing.section,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  pageTitle: {
    ...typography.title,
    color: colors.dark,
  },
  listHeader: { gap: spacing.lg },
  categorySectionHeader: {
    paddingTop: spacing.xs,
    paddingBottom: 0,
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
    padding: spacing.xl,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  pressed: { backgroundColor: colors.surfaceTint },
  levelLabel: {
    ...typography.caption,
    color: colors.badgeText,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  scenarioTitle: { ...typography.heading, color: colors.dark },
  scenarioDescription: { ...typography.input, color: colors.body },
  emptyCard: {
    padding: spacing.xxl,
    gap: spacing.md,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  emptyTitle: { ...typography.title, color: colors.dark },
  emptyText: { ...typography.body, color: colors.body },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(37, 37, 38, 0.24)',
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
  },
  modalCard: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    height: '90%',
    maxHeight: '100%',
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    boxShadow: shadowMd,
    overflow: 'hidden',
  },
  modalContent: { padding: spacing.xl, gap: spacing.lg },
  previewContent: {
    padding: spacing.xl,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
    gap: spacing.lg,
  },
  optionGroup: { gap: spacing.sm },
  optionHeading: { ...typography.caption, color: colors.muted },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterOption: {
    minHeight: layout.touchTarget,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterOptionPressed: {
    backgroundColor: colors.primaryPressed,
    borderColor: colors.primaryPressed,
  },
  filterOptionDisabled: {
    backgroundColor: colors.disabled,
    borderColor: colors.disabled,
  },
  filterOptionText: { ...typography.label, color: colors.primaryText },
  filterOptionTextSelected: { color: colors.onPrimary },
  filterOptionTextDisabled: { color: colors.disabledText },
});

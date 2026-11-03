import { VocabularyGameScreen } from './VocabularyGameScreen';
import type { DictionaryHistoryItem } from '../services/dictionaryService';
import { BottomNavigationInsetContext } from '../hooks/useBottomNavigationInset';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ScreenBackHeaderContext } from '../components/ScreenBackHeader';
import {
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  StudyTimeProvider,
  StudyTimerBadge,
  useStudyActivity,
} from '../components/StudyTime';
import { AuthButton, AuthNotice, AuthShell } from '../components/AuthForm';
import { AppTab, BottomNavigation } from '../components/BottomNavigation';
import { LearningSkill } from '../components/SkillPicker';
import { useLearningPreferences } from '../hooks/useLearningPreferences';
import { authService, User } from '../services/authService';
import { LearningOptions, LearningProfile } from '../services/learningService';
import { DesktopNavigation } from '../components/DesktopNavigation';
import { WebLayoutContext, DESKTOP_SIDEBAR_WIDTH } from '../hooks/useWebLayout';
import { colors, typography, spacing, layout } from '../theme/theme';
import { AccountScreen } from './AccountScreen';
import { HomeScreen } from './HomeScreen';
import { LearningPlanScreen } from './LearningPlanScreen';
import { LearningAreaScreen } from './LearningAreaScreen';
import { LearningSetupScreen } from './LearningSetupScreen';
import { SpeakingScenariosScreen } from './SpeakingScenariosScreen';
import { PracticeScreen } from './PracticeScreen';
import { VocabularyScreen } from './VocabularyScreen';
import { ShadowingScreen } from './ShadowingScreen';
import { FlashcardScreen } from './FlashcardScreen';
import { DailyFlashcardQuizScreen } from './DailyFlashcardQuizScreen';
import type { FlashcardSession } from '../services/flashcardService';
import { FlashcardStudyProvider } from '../components/FlashcardStudyProvider';

interface MainTabsProps {
  user: User;
  profile: LearningProfile;
  options: LearningOptions;
  selectedTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onEditLearning: () => void;
  showPlan: boolean;
  onOpenPlan: () => void;
}

function MainTabs({
  user,
  profile,
  options,
  selectedTab,
  onSelectTab,
  onEditLearning,
  showPlan,
  onOpenPlan,
}: MainTabsProps) {
  const [webHeader, setWebHeader] = useState<ReactNode>(null);
  const exitSkill = useCallback(() => setActiveSkill(null), []);
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1100;
  const contentWidth = desktop ? width - DESKTOP_SIDEBAR_WIDTH : width;
  const [vocabularyQuery, setVocabularyQuery] = useState('');
  const [lookupEntry, setLookupEntry] = useState<DictionaryHistoryItem>();
  const [visitedVocabulary, setVisitedVocabulary] = useState(false);
  const [visitedLookup, setVisitedLookup] = useState(false);
  const [activeSkill, setActiveSkill] = useState<LearningSkill | null>(null);
  const [practiceActivity, setPracticeActivity] = useState<
    'flashcards' | 'games' | null
  >(null);
  const closePracticeActivity = useCallback(
    () => setPracticeActivity(null),
    [],
  );
  const openPracticeFlashcards = useCallback(() => {
    setActiveSkill(null);
    setPracticeActivity('flashcards');
    onSelectTab('practice');
  }, [onSelectTab]);
  const openGames = useCallback(() => {
    setActiveSkill(null);
    setPracticeActivity('games');
    onSelectTab('practice');
  }, [onSelectTab]);
  const [navigationHeight, setNavigationHeight] = useState(0);
  const [homeActivity, setHomeActivity] = useState<
    | {
        kind: 'flashcards';
        session?: FlashcardSession;
        due?: boolean;
        key?: number;
      }
    | { kind: 'quiz' }
    | null
  >(null);
  const closeHomeActivity = useCallback(() => setHomeActivity(null), []);
  const studying =
    !showPlan &&
    ((selectedTab === 'home' && homeActivity !== null) ||
      selectedTab === 'vocabulary' ||
      selectedTab === 'lookup' ||
      (selectedTab === 'practice' &&
        (practiceActivity !== null ||
          (activeSkill !== null && activeSkill !== 'reading'))));
  useStudyActivity(studying);
  useEffect(() => {
    if (selectedTab === 'vocabulary') setVisitedVocabulary(true);
    if (selectedTab === 'lookup') setVisitedLookup(true);
  }, [selectedTab]);
  const selectTab = useCallback(
    (tab: AppTab) => {
      setActiveSkill(null);
      setPracticeActivity(null);
      setHomeActivity(null);
      onSelectTab(tab);
    },
    [onSelectTab],
  );
  const openSkill = (skill: LearningSkill) => {
    setPracticeActivity(null);
    setActiveSkill(skill);
    onSelectTab('practice');
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (selectedTab === 'home' && homeActivity) return false;
        if (selectedTab === 'vocabulary' || selectedTab === 'lookup')
          return false;
        if (selectedTab === 'practice' && practiceActivity) return false;
        if (selectedTab === 'practice' && activeSkill === 'listening')
          return false;
        if (selectedTab === 'practice' && activeSkill) {
          setActiveSkill(null);
          return true;
        }
        if (selectedTab === 'home' && !showPlan) {
          return false;
        }
        selectTab('home');
        return true;
      },
    );
    return () => subscription.remove();
  }, [
    selectedTab,
    selectTab,
    showPlan,
    activeSkill,
    homeActivity,
    practiceActivity,
  ]);

  return (
    <FlashcardStudyProvider
      accountId={user.id}
      onOpenDue={() => {
        onSelectTab('home');
        setHomeActivity({ kind: 'flashcards', due: true, key: Date.now() });
      }}
    >
      <BottomNavigationInsetContext.Provider
        value={desktop ? 0 : navigationHeight}
      >
        <WebLayoutContext.Provider value={{ desktop, contentWidth }}>
          <View style={[styles.main, desktop && styles.desktopMain]}>
            {desktop && (
              <DesktopNavigation
                selectedTab={selectedTab}
                onSelectTab={selectTab}
                activeSkill={activeSkill}
                activeActivity={practiceActivity}
                onOpenFlashcards={openPracticeFlashcards}
                onOpenGames={openGames}
                onOpenSkill={openSkill}
                user={user}
              />
            )}
            <ScreenBackHeaderContext.Provider
              value={desktop ? setWebHeader : null}
            >
              <View style={styles.screen}>
                {desktop && (
                  <View style={styles.desktopSummary} testID="desktop-app-bar">
                    <View style={styles.desktopBackHeader}>{webHeader}</View>
                    <View style={styles.desktopBadges}>
                      <View style={styles.desktopLevel}>
                        <Text style={styles.desktopLevelText}>
                          {profile.level === 'beginner'
                            ? 'Mới bắt đầu'
                            : profile.level}
                        </Text>
                      </View>
                      {selectedTab === 'home' && !homeActivity && !showPlan ? (
                        <View style={styles.desktopLevel}>
                          <Text style={styles.desktopLevelText}>
                            {profile.daily_minutes} phút/ngày
                          </Text>
                        </View>
                      ) : (
                        <StudyTimerBadge />
                      )}
                    </View>
                  </View>
                )}
                <View style={styles.screen}>
                  {showPlan ? (
                    <LearningPlanScreen
                      profile={profile}
                      options={options}
                      onEdit={onEditLearning}
                      onBack={() => onSelectTab('home')}
                    />
                  ) : selectedTab === 'home' ? (
                    homeActivity?.kind === 'flashcards' ? (
                      <FlashcardScreen
                        key={homeActivity.key}
                        initialSession={homeActivity.session}
                        startDueReview={homeActivity.due}
                        catalogBackLabel="Quay lại trang chủ"
                        onExit={closeHomeActivity}
                      />
                    ) : homeActivity?.kind === 'quiz' ? (
                      <DailyFlashcardQuizScreen
                        onExit={closeHomeActivity}
                        onReview={session =>
                          setHomeActivity({ kind: 'flashcards', session })
                        }
                      />
                    ) : (
                      <HomeScreen
                        user={user}
                        profile={profile}
                        options={options}
                        onContinueLearning={onOpenPlan}
                        onOpenFlashcards={session =>
                          setHomeActivity({ kind: 'flashcards', session })
                        }
                        onOpenQuiz={() => setHomeActivity({ kind: 'quiz' })}
                        onOpenSkill={openSkill}
                        onSearchVocabulary={(query, entry) => {
                          setLookupEntry(entry);
                          setVocabularyQuery(query);
                          onSelectTab('lookup');
                        }}
                        onOpenVocabulary={() => {
                          setVocabularyQuery('');
                          onSelectTab('vocabulary');
                        }}
                        onOpenGames={openGames}
                        onOpenPromotion={onOpenPlan}
                      />
                    )
                  ) : selectedTab === 'practice' ? (
                    practiceActivity === 'games' ? (
                      <VocabularyGameScreen
                        userId={user.id}
                        onExit={closePracticeActivity}
                      />
                    ) : practiceActivity === 'flashcards' ? (
                      <FlashcardScreen
                        catalogBackLabel="Quay lại luyện tập"
                        onExit={closePracticeActivity}
                      />
                    ) : activeSkill === 'speaking' ? (
                      <SpeakingScenariosScreen />
                    ) : activeSkill === 'listening' ? (
                      <ShadowingScreen
                        onExit={exitSkill}
                        bottomOverlayHeight={desktop ? 0 : navigationHeight}
                      />
                    ) : activeSkill ? (
                      <LearningAreaScreen
                        area={activeSkill}
                        accountId={user.id}
                        initialLevel={profile.level}
                        onExit={exitSkill}
                      />
                    ) : (
                      <PracticeScreen
                        onOpenSkill={openSkill}
                        onOpenGames={openGames}
                        onOpenFlashcards={openPracticeFlashcards}
                        onOpenLessons={() => selectTab('vocabulary')}
                      />
                    )
                  ) : selectedTab === 'profile' ? (
                    <AccountScreen
                      user={user}
                      learningProfile={profile}
                      learningOptions={options}
                      onEditLearning={onEditLearning}
                    />
                  ) : null}
                  {visitedVocabulary || selectedTab === 'vocabulary' ? (
                    <View
                      style={[
                        styles.screen,
                        selectedTab !== 'vocabulary' && styles.hidden,
                      ]}
                    >
                      <VocabularyScreen
                        area="lessons"
                        active={selectedTab === 'vocabulary'}
                        onExit={() => selectTab('home')}
                      />
                    </View>
                  ) : null}
                  {visitedLookup || selectedTab === 'lookup' ? (
                    <View
                      style={[
                        styles.screen,
                        selectedTab !== 'lookup' && styles.hidden,
                      ]}
                    >
                      <VocabularyScreen
                        key={`${vocabularyQuery}:${lookupEntry?.kind ?? ''}:${
                          lookupEntry?.target ?? ''
                        }`}
                        initialEntry={lookupEntry}
                        area="lookup"
                        query={vocabularyQuery}
                        active={selectedTab === 'lookup'}
                        onExit={() => selectTab('home')}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </ScreenBackHeaderContext.Provider>
            {!desktop && (
              <View
                pointerEvents="box-none"
                style={styles.floatingNavigation}
                onLayout={event =>
                  setNavigationHeight(event.nativeEvent.layout.height)
                }
              >
                {studying ? (
                  <View style={styles.mobileStudyStatus}>
                    <StudyTimerBadge />
                  </View>
                ) : null}
                {selectedTab === 'practice' &&
                activeSkill &&
                activeSkill !== 'listening' ? (
                  <AuthButton
                    label="Chọn kỹ năng khác"
                    variant="text"
                    onPress={() => setActiveSkill(null)}
                  />
                ) : null}
                <BottomNavigation
                  selectedTab={selectedTab}
                  onSelectTab={selectTab}
                  floating
                />
              </View>
            )}
          </View>
        </WebLayoutContext.Provider>
      </BottomNavigationInsetContext.Provider>
    </FlashcardStudyProvider>
  );
}

export function AuthenticatedScreen({ user }: { user: User }) {
  const { state, reload, save } = useLearningPreferences();
  const [editing, setEditing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<AppTab>('home');
  const [showPlan, setShowPlan] = useState(false);
  const selectTab = useCallback((tab: AppTab) => {
    setShowPlan(false);
    setSelectedTab(tab);
  }, []);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const cancel = useCallback(async () => {
    if (editing) {
      setEditing(false);
    } else {
      await authService.logout();
    }
  }, [editing]);

  if (state.status !== 'ready') {
    return (
      <AuthShell
        title="Hành trình của bạn"
        subtitle="Đang tải trình độ và mục tiêu học tập."
      >
        <AuthNotice
          message={state.status === 'error' ? state.message : ''}
          error
        />
        <AuthNotice message={logoutError} error />
        <AuthButton
          label="Thử lại"
          busy={state.status === 'loading'}
          disabled={signingOut}
          onPress={reload}
        />
        <AuthButton
          label="Đăng xuất"
          variant="text"
          busy={signingOut}
          onPress={async () => {
            setSigningOut(true);
            setLogoutError('');
            try {
              await authService.logout();
            } catch (failure) {
              setLogoutError(
                failure instanceof Error
                  ? failure.message
                  : 'Không đăng xuất được.',
              );
            } finally {
              setSigningOut(false);
            }
          }}
        />
      </AuthShell>
    );
  }
  const { profile, options } = state.data;
  if (!profile || editing) {
    return (
      <LearningSetupScreen
        profile={profile}
        options={options}
        onSave={async selection => {
          await save(selection);
          setEditing(false);
        }}
        onCancel={cancel}
        onReload={() => {
          setEditing(false);
          reload();
        }}
      />
    );
  }
  return (
    <StudyTimeProvider
      key={user.id}
      accountId={user.id}
      goalMinutes={profile.daily_minutes}
    >
      <MainTabs
        user={user}
        profile={profile}
        options={options}
        selectedTab={selectedTab}
        onSelectTab={selectTab}
        onEditLearning={() => setEditing(true)}
        showPlan={showPlan}
        onOpenPlan={() => setShowPlan(true)}
      />
    </StudyTimeProvider>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  main: { flex: 1 },
  screen: { flex: 1, minWidth: 0, minHeight: 0 },
  desktopMain: { flexDirection: 'row' },
  mobileStudyStatus: { alignSelf: 'center', marginBottom: spacing.xs },
  desktopSummary: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.sm,
    minHeight: layout.desktopHeaderHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  desktopBackHeader: { flex: 1, minWidth: 0 },
  desktopBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  desktopLevel: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceTint,
    borderRadius: 999,
  },
  desktopLevelText: { ...typography.caption, color: colors.primaryText },
  floatingNavigation: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    ...(Platform.OS === 'web'
      ? {
          maxWidth: 760,
          width: '100%' as const,
          marginHorizontal: 'auto' as const,
        }
      : {}),
  },
});

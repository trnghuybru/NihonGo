import { LearningLevelContext } from '../hooks/useLearningLevel';
import { decodeRouteParam } from '../navigation/webNavigation';
import { lazy, Suspense, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Navigate, Route, Routes } from 'react-router';
import { AuthButton, AuthNotice, AuthShell } from '../components/AuthForm';
import { BottomNavigation } from '../components/BottomNavigation';
import { DesktopNavigation } from '../components/DesktopNavigation';
import { FlashcardStudyProvider } from '../components/FlashcardStudyProvider';
import { ScreenBackHeaderContext } from '../components/ScreenBackHeader';
import {
  StudyTimeProvider,
  StudyTimerBadge,
  useStudyActivity,
} from '../components/StudyTime';
import { BottomNavigationInsetContext } from '../hooks/useBottomNavigationInset';
import { useLearningPreferences } from '../hooks/useLearningPreferences';
import { useRemoteResource } from '../hooks/useSpeakingScenarios';
import { WebLayoutContext, DESKTOP_SIDEBAR_WIDTH } from '../hooks/useWebLayout';
import {
  authPaths,
  safeReturnTo,
  selectedTabForPath,
  tabPaths,
  useWebNavigation,
} from '../navigation/webNavigation';
import { authService, type User } from '../services/authService';
import type {
  LearningProfile,
  LearningOptions,
} from '../services/learningService';
import {
  flashcardService,
  FlashcardSession,
  CustomDeck,
} from '../services/flashcardService';
import { colors, layout, spacing, typography } from '../theme/theme';
import { betaGamesWeb, betaWeb } from '../config/beta';
import { CommunityExperience } from '../../web/CommunityExperience';
import { AccountScreen } from './AccountScreen';
import { DailyFlashcardQuizScreen } from './DailyFlashcardQuizScreen';
const FlashcardScreen = lazy(async () => {
  const module = await import('./FlashcardScreen');
  return { default: module.FlashcardScreen };
});
import { HomeScreen } from './HomeScreen';
import { LearningAreaScreen } from './LearningAreaScreen';
import { LearningPlanScreen } from './LearningPlanScreen';
import { LearningSetupScreen } from './LearningSetupScreen';
import { PracticeScreen } from './PracticeScreen';
const ReadingScreen = lazy(async () => {
  const module = await import('./ReadingScreen');
  return { default: module.ReadingScreen };
});
const ShadowingScreen = lazy(async () => {
  const module = await import('./ShadowingScreen');
  return { default: module.ShadowingScreen };
});
const SpeakingScenariosScreen = lazy(async () => {
  const module = await import('./SpeakingScenariosScreen');
  return { default: module.SpeakingScenariosScreen };
});
const VocabularyGameScreen = lazy(async () => {
  const module = await import('./VocabularyGameScreen');
  return { default: module.VocabularyGameScreen };
});
const VocabularyScreen = lazy(async () => {
  const module = await import('./VocabularyScreen');
  return { default: module.VocabularyScreen };
});

function FlashcardsPage() {
  const nav = useWebNavigation()!;
  const navigate = nav.navigate;
  const sessionId = /^\/flashcards\/sessions\/([^/]+)$/.exec(nav.pathname)?.[1];
  const deckId = /^\/flashcards\/decks\/([^/]+)\/edit$/.exec(nav.pathname)?.[1];
  const load = useCallback(async (): Promise<
    FlashcardSession | CustomDeck | null
  > => {
    if (sessionId) return flashcardService.session(decodeRouteParam(sessionId));
    if (deckId) return flashcardService.deck(decodeRouteParam(deckId));
    return null;
  }, [sessionId, deckId]);
  const resource = useRemoteResource(load);
  const backTo = safeReturnTo(
    typeof nav.state?.backTo === 'string' ? nav.state.backTo : '/practice',
  );
  const exit = useCallback(() => navigate(backTo), [navigate, backTo]);
  if (
    resource.state.status === 'loading' ||
    (resource.state.status === 'ready' &&
      (sessionId || deckId) &&
      resource.state.data?.id !== decodeRouteParam(sessionId || deckId!))
  )
    return (
      <AuthShell title="Flashcard" subtitle="">
        <Text style={styles.caption}>Đang tải…</Text>
      </AuthShell>
    );
  if (resource.state.status === 'error')
    return (
      <AuthShell title="Flashcard" subtitle="">
        <AuthNotice error message={resource.state.message} />
        <AuthButton label="Thử lại" onPress={resource.reload} />
        <AuthButton
          label="Bộ thẻ"
          variant="text"
          onPress={() => navigate('/flashcards', { replace: true })}
        />
      </AuthShell>
    );
  return (
    <FlashcardScreen
      key={
        sessionId ||
        deckId ||
        (nav.pathname === '/flashcards/new'
          ? 'new'
          : nav.pathname === '/flashcards/review'
          ? 'review'
          : 'catalog' + nav.search)
      }
      initialSession={
        sessionId ? (resource.state.data as FlashcardSession) : undefined
      }
      initialEditor={
        nav.pathname === '/flashcards/new'
          ? 'new'
          : deckId
          ? (resource.state.data as CustomDeck)
          : undefined
      }
      startDueReview={nav.pathname === '/flashcards/review'}
      catalogBackLabel={
        backTo === '/'
          ? 'Quay lại trang chủ'
          : backTo.startsWith('/lessons')
          ? 'Quay lại bài học'
          : 'Quay lại luyện tập'
      }
      onExit={exit}
    />
  );
}
function WebWorkspace({
  user,
  profile,
  options,
}: {
  user: User;
  profile: LearningProfile;
  options: LearningOptions;
}) {
  const nav = useWebNavigation()!;
  const navigate = nav.navigate;
  const { width } = useWindowDimensions();
  const desktop = width >= 1100;
  const [webHeader, setWebHeader] = useState<ReactNode>(null),
    [navigationHeight, setNavigationHeight] = useState(0);
  const selectedTab = selectedTabForPath(nav.pathname);
  const skill =
    /^\/practice\/(listening|speaking|reading|writing)(?:\/|$)/.exec(
      nav.pathname,
    )?.[1] as 'listening' | 'speaking' | 'reading' | 'writing' | undefined;
  const activeActivity = nav.pathname.startsWith('/flashcards')
    ? 'flashcards'
    : nav.pathname.startsWith('/games')
    ? 'games'
    : null;
  useStudyActivity(
    Boolean(
      skill ||
        activeActivity ||
        selectedTab === 'lookup' ||
        selectedTab === 'vocabulary',
    ),
  );
  const goHome = useCallback(() => navigate('/'), [navigate]);
  const goPractice = useCallback(() => navigate('/practice'), [navigate]);
  const openFlashcards = useCallback(
    (session?: FlashcardSession) =>
      navigate(
        session
          ? `/flashcards/sessions/${encodeURIComponent(session.id)}`
          : '/flashcards',
        { state: { session, backTo: '/' } },
      ),
    [navigate],
  );
  const openGames = useCallback(() => navigate('/games'), [navigate]);
  const openSkill = useCallback(
    (value: string) => navigate('/practice/' + value),
    [navigate],
  );
  const openLessons = useCallback(() => navigate('/lessons'), [navigate]);
  const openPlan = useCallback(() => navigate('/plan'), [navigate]);
  const editLearning = useCallback(
    () => navigate('/profile/learning'),
    [navigate],
  );
  const goFlashcards = useCallback(() => navigate('/flashcards'), [navigate]);
  const openQuiz = useCallback(() => navigate('/flashcards/quiz'), [navigate]);
  return (
    <FlashcardStudyProvider
      accountId={user.id}
      onOpenDue={() =>
        navigate('/flashcards/review', {
          state: { backTo: nav.pathname + nav.search },
        })
      }
    >
      <BottomNavigationInsetContext.Provider
        value={desktop ? 0 : navigationHeight}
      >
        <WebLayoutContext.Provider
          value={{
            desktop,
            contentWidth: desktop ? width - DESKTOP_SIDEBAR_WIDTH : width,
          }}
        >
          <View style={[styles.main, desktop && styles.desktopMain]}>
            {desktop ? (
              <DesktopNavigation
                user={user}
                selectedTab={selectedTab}
                onSelectTab={tab => navigate(tabPaths[tab])}
                activeSkill={skill ?? null}
                activeActivity={activeActivity}
                onOpenSkill={openSkill}
                onOpenFlashcards={() =>
                  navigate('/flashcards', {
                    state: { backTo: '/practice' },
                  })
                }
                onOpenGames={openGames}
                showGames={!betaWeb || betaGamesWeb}
              />
            ) : null}
            <ScreenBackHeaderContext.Provider
              value={desktop ? setWebHeader : null}
            >
              <View style={styles.screen}>
                {desktop ? (
                  <View
                    style={[
                      styles.topBar,
                      /^\/practice\/listening\/[^/]+$/.test(nav.pathname) &&
                        styles.listeningLessonTopBar,
                    ]}
                  >
                    <View style={styles.header}>{webHeader}</View>
                    <View style={styles.badges}>
                      <Text style={styles.badge}>
                        {profile.level === 'beginner'
                          ? 'Mới bắt đầu'
                          : profile.level}
                      </Text>
                      {nav.pathname === '/' ? (
                        <Text style={styles.badge}>
                          {profile.daily_minutes} phút/ngày
                        </Text>
                      ) : (
                        <StudyTimerBadge />
                      )}
                    </View>
                  </View>
                ) : null}
                <View style={styles.screen} testID="tour-workspace">
                  <Suspense
                    fallback={
                      <View style={styles.routeLoading}>
                        <ActivityIndicator
                          color={colors.primary}
                          accessibilityLabel="Đang tải trang"
                        />
                      </View>
                    }
                  >
                    <Routes>
                      <Route
                        path="/"
                        element={
                          <HomeScreen
                            user={user}
                            profile={profile}
                            options={options}
                            onContinueLearning={openPlan}
                            onOpenPromotion={openPlan}
                            onOpenSkill={openSkill}
                            onOpenVocabulary={openLessons}
                            onOpenFlashcards={openFlashcards}
                            onOpenQuiz={openQuiz}
                            onOpenGames={
                              betaWeb && !betaGamesWeb ? undefined : openGames
                            }
                            onSearchVocabulary={(query, entry) =>
                              navigate(
                                entry
                                  ? entry.kind === 'kanji'
                                    ? `/lookup/kanji/${encodeURIComponent(
                                        entry.target,
                                      )}?q=${encodeURIComponent(entry.word)}`
                                    : `/lookup/words/${encodeURIComponent(
                                        entry.target,
                                      )}?q=${encodeURIComponent(entry.word)}`
                                  : `/lookup?q=${encodeURIComponent(query)}`,
                              )
                            }
                          />
                        }
                      />
                      <Route
                        path="/practice"
                        element={
                          <PracticeScreen
                            onOpenSkill={openSkill}
                            onOpenGames={
                              betaWeb && !betaGamesWeb ? undefined : openGames
                            }
                            onOpenLessons={openLessons}
                            onOpenFlashcards={() =>
                              navigate('/flashcards', {
                                state: { backTo: '/practice' },
                              })
                            }
                          />
                        }
                      />
                      {[
                        '/practice/listening',
                        '/practice/listening/:videoId',
                      ].map(path => (
                        <Route
                          key={path}
                          path={path}
                          element={
                            <ShadowingScreen
                              onExit={goPractice}
                              bottomOverlayHeight={
                                desktop ? 0 : navigationHeight
                              }
                            />
                          }
                        />
                      ))}
                      {[
                        '/practice/speaking',
                        '/practice/speaking/new',
                        '/practice/speaking/scenarios/:scenarioId',
                        '/practice/speaking/sessions/:sessionId',
                      ].map(path => (
                        <Route
                          key={path}
                          path={path}
                          element={<SpeakingScenariosScreen />}
                        />
                      ))}
                      {[
                        '/practice/reading',
                        '/practice/reading/:passageId',
                      ].map(path => (
                        <Route
                          key={path}
                          path={path}
                          element={
                            <ReadingScreen
                              accountId={user.id}
                              initialLevel={profile.level}
                              onExit={goPractice}
                            />
                          }
                        />
                      ))}
                      <Route
                        path="/practice/writing"
                        element={<LearningAreaScreen area="writing" />}
                      />
                      {['/lessons', '/lessons/:lessonId'].map(path => (
                        <Route
                          key={path}
                          path={path}
                          element={
                            <VocabularyScreen
                              key={nav.pathname + nav.search}
                              area="lessons"
                              onExit={goHome}
                            />
                          }
                        />
                      ))}
                      {[
                        '/lookup',
                        '/lookup/videos',
                        '/lookup/words/:wordId',
                        '/lookup/kanji/:literal',
                      ].map(path => (
                        <Route
                          key={path}
                          path={path}
                          element={
                            <VocabularyScreen
                              key={nav.pathname + nav.search}
                              area="lookup"
                              query={
                                new URLSearchParams(nav.search).get('q') ?? ''
                              }
                              onExit={goHome}
                            />
                          }
                        />
                      ))}
                      <Route
                        path="/lookup/translate"
                        element={
                          <Navigate replace to={'/lookup' + nav.search} />
                        }
                      />
                      <Route
                        path="/flashcards/quiz"
                        element={
                          <DailyFlashcardQuizScreen
                            onExit={goFlashcards}
                            onReview={openFlashcards}
                          />
                        }
                      />
                      {[
                        '/flashcards',
                        '/flashcards/review',
                        '/flashcards/sessions/:sessionId',
                        '/flashcards/new',
                        '/flashcards/decks/:deckId/edit',
                      ].map(path => (
                        <Route
                          key={path}
                          path={path}
                          element={<FlashcardsPage />}
                        />
                      ))}
                      {[
                        '/games',
                        '/games/castle',
                        '/games/create',
                        '/games/bot',
                        '/games/write',
                        '/games/read',
                        '/games/:code',
                      ].map(path => (
                        <Route
                          key={path}
                          path={path}
                          element={
                            betaWeb && !betaGamesWeb ? (
                              <Navigate replace to="/practice" />
                            ) : (
                              <VocabularyGameScreen
                                userId={user.id}
                                onExit={goPractice}
                              />
                            )
                          }
                        />
                      ))}
                      <Route
                        path="/profile"
                        element={
                          <AccountScreen
                            user={user}
                            learningProfile={profile}
                            learningOptions={options}
                            onEditLearning={editLearning}
                          />
                        }
                      />
                      <Route
                        path="/plan"
                        element={
                          <LearningPlanScreen
                            profile={profile}
                            options={options}
                            onEdit={editLearning}
                            onBack={goHome}
                          />
                        }
                      />
                      <Route
                        path="*"
                        element={
                          <AuthShell title="Không tìm thấy trang" subtitle="">
                            <AuthButton label="Trang chủ" onPress={goHome} />
                          </AuthShell>
                        }
                      />
                    </Routes>
                  </Suspense>
                </View>
              </View>
            </ScreenBackHeaderContext.Provider>
            {!desktop ? (
              <View
                style={styles.navigation}
                onLayout={event =>
                  setNavigationHeight(event.nativeEvent.layout.height)
                }
              >
                <BottomNavigation
                  selectedTab={selectedTab}
                  onSelectTab={tab => navigate(tabPaths[tab])}
                  floating
                />
              </View>
            ) : null}
            <CommunityExperience
              key={user.id}
              accountId={user.id}
              name={user.name}
              pathname={nav.pathname}
              navigate={navigate}
              bottomInset={desktop ? 0 : navigationHeight}
            />
          </View>
        </WebLayoutContext.Provider>
      </BottomNavigationInsetContext.Provider>
    </FlashcardStudyProvider>
  );
}
export function AuthenticatedScreen({ user }: { user: User }) {
  const nav = useWebNavigation()!;
  const navigate = nav.navigate;
  const { state, reload, save } = useLearningPreferences();
  if (authPaths.has(nav.pathname))
    return (
      <Navigate
        replace
        to={safeReturnTo(new URLSearchParams(nav.search).get('returnTo'))}
      />
    );
  if (state.status !== 'ready')
    return (
      <AuthShell title="NihonGO" subtitle="">
        <AuthNotice
          error
          message={state.status === 'error' ? state.message : ''}
        />
        <AuthButton
          label="Thử lại"
          busy={state.status === 'loading'}
          onPress={reload}
        />
      </AuthShell>
    );
  const { profile, options } = state.data;
  if (!profile && nav.pathname !== '/onboarding')
    return (
      <Navigate
        replace
        to={
          '/onboarding?returnTo=' +
          encodeURIComponent(nav.pathname + nav.search)
        }
      />
    );
  if (
    !profile ||
    nav.pathname === '/profile/learning' ||
    nav.pathname === '/onboarding'
  )
    return (
      <LearningSetupScreen
        profile={profile}
        options={options}
        onSave={async values => {
          await save(values);
          navigate(
            nav.pathname === '/profile/learning'
              ? '/profile'
              : safeReturnTo(new URLSearchParams(nav.search).get('returnTo')),
            { replace: true },
          );
        }}
        onCancel={() => (profile ? navigate('/profile') : authService.logout())}
        onReload={reload}
      />
    );
  return (
    <LearningLevelContext.Provider value={profile.level}>
      <StudyTimeProvider
        key={user.id}
        accountId={user.id}
        goalMinutes={profile.daily_minutes}
      >
        <WebWorkspace user={user} profile={profile} options={options} />
      </StudyTimeProvider>
    </LearningLevelContext.Provider>
  );
}
const styles = StyleSheet.create({
  routeLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1 },
  desktopMain: { flexDirection: 'row' },
  screen: { flex: 1, minWidth: 0, minHeight: 0 },
  topBar: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minHeight: layout.desktopHeaderHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  header: { flex: 1, minWidth: 0 },
  listeningLessonTopBar: { maxWidth: '100%' },
  badges: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  badge: {
    ...typography.caption,
    color: colors.focus,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  caption: { ...typography.caption, color: colors.muted },
  navigation: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
});

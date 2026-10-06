import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { AuthButton, AuthNotice, AuthShell } from '../components/AuthForm';
import { AppTab, BottomNavigation } from '../components/BottomNavigation';
import { LearningSkill } from '../components/SkillPicker';
import { useLearningPreferences } from '../hooks/useLearningPreferences';
import { authService, User } from '../services/authService';
import { LearningOptions, LearningProfile } from '../services/learningService';
import { colors } from '../theme/theme';
import { AccountScreen } from './AccountScreen';
import { HomeScreen } from './HomeScreen';
import { LearningPlanScreen } from './LearningPlanScreen';
import { LearningAreaScreen } from './LearningAreaScreen';
import { LearningSetupScreen } from './LearningSetupScreen';
import { SpeakingScenariosScreen } from './SpeakingScenariosScreen';
import { PracticeScreen } from './PracticeScreen';

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
  const [vocabularyQuery, setVocabularyQuery] = useState('');
  const [activeSkill, setActiveSkill] = useState<LearningSkill | null>(null);
  const selectTab = useCallback(
    (tab: AppTab) => {
      setActiveSkill(null);
      onSelectTab(tab);
    },
    [onSelectTab],
  );
  const openSkill = (skill: LearningSkill) => {
    setActiveSkill(skill);
    onSelectTab('practice');
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
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
  }, [selectedTab, selectTab, showPlan, activeSkill]);

  return (
    <View style={styles.main}>
      <View style={styles.screen}>
        {showPlan ? (
          <LearningPlanScreen
            profile={profile}
            options={options}
            onEdit={onEditLearning}
            onBack={() => onSelectTab('home')}
          />
        ) : selectedTab === 'home' ? (
          <HomeScreen
            user={user}
            profile={profile}
            options={options}
            onContinueLearning={onOpenPlan}
            onOpenSkill={openSkill}
            onSearchVocabulary={query => {
              setVocabularyQuery(query);
              onSelectTab('vocabulary');
            }}
            onOpenVocabulary={() => {
              setVocabularyQuery('');
              onSelectTab('vocabulary');
            }}
            onOpenPromotion={onOpenPlan}
          />
        ) : selectedTab === 'practice' ? (
          activeSkill === 'speaking' ? (
            <SpeakingScenariosScreen />
          ) : activeSkill ? (
            <LearningAreaScreen area={activeSkill} />
          ) : (
            <PracticeScreen onOpenSkill={openSkill} />
          )
        ) : selectedTab === 'profile' ? (
          <AccountScreen
            user={user}
            learningProfile={profile}
            learningOptions={options}
            onEditLearning={onEditLearning}
          />
        ) : (
          <LearningAreaScreen area="vocabulary" query={vocabularyQuery} />
        )}
      </View>
      {selectedTab === 'practice' && activeSkill ? (
        <AuthButton
          label="Chọn kỹ năng khác"
          variant="text"
          onPress={() => setActiveSkill(null)}
        />
      ) : null}
      <BottomNavigation selectedTab={selectedTab} onSelectTab={selectTab} />
    </View>
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
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
});

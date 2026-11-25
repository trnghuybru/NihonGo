import { InstallAppHint } from '../components/InstallAppHint';
import { AuthButton } from '../components/AuthForm';
import type { DictionaryHistoryItem } from '../services/dictionaryService';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeFlashcardHub } from '../components/HomeFlashcardHub';
import type { FlashcardSession } from '../services/flashcardService';
import { DailyGoalProgress } from '../components/StudyTime';
import { StudyStreakCalendar } from '../components/StudyStreakCalendar';
import { AuthShell } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { LearningSkill, SkillPicker } from '../components/SkillPicker';
import { PromotionPanel } from '../components/PromotionPanel';
import { VocabularySearchBar } from '../components/VocabularySearchBar';
import { NihongoMascot } from '../components/NihongoMascot';
import { useWebLayout } from '../hooks/useWebLayout';
import { User } from '../services/authService';
import { LearningOptions, LearningProfile } from '../services/learningService';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';

export type { LearningSkill } from '../components/SkillPicker';

interface Props {
  user: User;
  profile: LearningProfile;
  options: LearningOptions;
  onContinueLearning: () => void;
  onOpenSkill: (skill: LearningSkill) => void;
  onSearchVocabulary: (query: string, entry?: DictionaryHistoryItem) => void;
  onOpenVocabulary: () => void;
  onOpenPromotion: () => void;
  onOpenFlashcards?: (session?: FlashcardSession) => void;
  onOpenQuiz?: () => void;
  onOpenGames?: () => void;
}

export function HomeScreen({
  user,
  profile,
  onContinueLearning,
  onOpenSkill,
  onSearchVocabulary,
  onOpenVocabulary,
  onOpenPromotion,
  onOpenFlashcards,
  onOpenQuiz,
  onOpenGames,
}: Props) {
  const { desktop } = useWebLayout();
  const webHome = Platform.OS === 'web';
  return (
    <AuthShell
      title={`Chào ${user.name}`}
      subtitle="Một chút tiếng Nhật, mỗi ngày."
      icon="user"
      card={false}
      wide
      hideHeader={webHome}
      compactHeader
      topBarAccessory={
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {profile.level === 'beginner' ? 'Mới bắt đầu' : profile.level}
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {profile.daily_minutes} phút/ngày
            </Text>
          </View>
        </View>
      }
      headerAccessory={<NihongoMascot size={104} />}
    >
      {webHome ? (
        <View nativeID="home-welcome">
          <View style={styles.welcomeCopy}>
            <Text accessibilityRole="header" style={styles.welcomeTitle}>
              Chào {user.name}
            </Text>
            <Text style={styles.dashboardCaption}>
              Học tiếng Nhật, mở ra nhiều cơ hội mới!
            </Text>
          </View>
        </View>
      ) : null}
      <InstallAppHint />
      <View nativeID={webHome ? 'home-search' : undefined} style={[styles.section, styles.searchSection]}>
        <View style={styles.searchHeading}>
          {webHome ? <HomeFeatureIcon name="vocabulary" color="#dc6910" size={22} /> : null}
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Tra cứu từ vựng
          </Text>
        </View>
        <VocabularySearchBar onSearch={onSearchVocabulary} />
      </View>
      <View nativeID={webHome ? 'home-learning-layout' : undefined} style={styles.learningOverview}>
        <View
          testID="home-learning-overview"
          style={[styles.learningOverview, desktop && styles.desktopLearningOverview]}
        >
          <View style={[styles.goalColumn, desktop && styles.desktopGoalColumn]}>
            <DailyGoalProgress />
          </View>
          <View style={[styles.calendarColumn, desktop && styles.desktopCalendarColumn]}>
            <StudyStreakCalendar accountId={user.id} />
          </View>
        </View>
        <HomeFlashcardHub
          onOpenFlashcards={onOpenFlashcards ?? onOpenVocabulary}
          onOpenQuiz={onOpenQuiz ?? onContinueLearning}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mở bài học từ vựng"
        nativeID={webHome ? 'home-vocabulary' : undefined}
        onPress={onOpenVocabulary}
        style={({ pressed }) => [
          styles.vocabularyCard,
          pressed && styles.pressed,
        ]}
      >
        {!desktop ? <NihongoMascot pose="writing" size={72} decorative /> : null}
        <View style={styles.vocabularyCopy}>
          <Text style={styles.vocabularyTitle}>Bài học từ vựng</Text>
          {webHome ? <Text style={styles.dashboardCaption}>Học theo chủ đề, luyện tập hiệu quả hơn.</Text> : null}
        </View>
        {webHome ? <Text style={styles.dashboardAction}>Xem tất cả</Text> : null}
        <HomeFeatureIcon name="arrow" color={colors.primaryText} size={20} />
      </Pressable>
      <View nativeID={webHome ? 'home-skills' : undefined} style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Luyện kỹ năng
          </Text>
          {onOpenGames ? (
            <AuthButton
              label="Game từ vựng"
              trailingIcon={webHome ? 'arrow' : undefined}
              variant="text"
              onPress={onOpenGames}
            />
          ) : (
            <Text style={styles.sectionCaption}>Học cùng Momo</Text>
          )}
        </View>
        <SkillPicker onOpenSkill={onOpenSkill} />
      </View>
      <PromotionPanel onPress={onOpenPromotion} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  searchSection: { zIndex: 30 },
  searchHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  welcomeCopy: { gap: 4, flex: 1 },
  welcomeTitle: { ...typography.title, color: '#153549', fontSize: 23, lineHeight: 29 },
  dashboardCaption: { ...typography.caption, color: '#586a7a' },
  dashboardAction: { ...typography.link, color: colors.primaryText },
  learningOverview: { gap: spacing.lg },
  desktopLearningOverview: { flexDirection: 'row', alignItems: 'stretch' },
  goalColumn: { minWidth: 0 },
  desktopGoalColumn: { flex: 1, minWidth: 280 },
  calendarColumn: { minWidth: 0 },
  desktopCalendarColumn: { flex: 2, minWidth: 0 },
  section: { gap: spacing.lg },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  sectionTitle: { ...typography.heading, color: colors.dark },
  sectionCaption: { ...typography.caption, color: colors.muted },
  badges: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTint,
  },
  badgeText: { ...typography.caption, color: colors.focus },
  pressed: { backgroundColor: colors.surfaceTint },
  vocabularyCard: {
    minHeight: 112,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  vocabularyCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  vocabularyTitle: { ...typography.title, color: colors.dark },
});

import { AuthButton } from '../components/AuthForm';
import type { DictionaryHistoryItem } from '../services/dictionaryService';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeFlashcardHub } from '../components/HomeFlashcardHub';
import type { FlashcardSession } from '../services/flashcardService';
import { DailyGoalProgress } from '../components/StudyTime';
import { AuthShell } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { LearningSkill, SkillPicker } from '../components/SkillPicker';
import { PromotionPanel } from '../components/PromotionPanel';
import { VocabularySearchBar } from '../components/VocabularySearchBar';
import { NihongoMascot } from '../components/NihongoMascot';
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
  return (
    <AuthShell
      title={`Chào ${user.name}`}
      subtitle="Một chút tiếng Nhật, mỗi ngày."
      icon="user"
      card={false}
      wide
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
      <View style={[styles.section, styles.searchSection]}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Tra cứu từ vựng
        </Text>
        <VocabularySearchBar onSearch={onSearchVocabulary} />
      </View>
      <DailyGoalProgress />
      <HomeFlashcardHub
        onOpenFlashcards={onOpenFlashcards ?? onOpenVocabulary}
        onOpenQuiz={onOpenQuiz ?? onContinueLearning}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mở bài học từ vựng"
        onPress={onOpenVocabulary}
        style={({ pressed }) => [
          styles.vocabularyCard,
          pressed && styles.pressed,
        ]}
      >
        <NihongoMascot pose="writing" size={72} decorative />
        <View style={styles.vocabularyCopy}>
          <Text style={styles.vocabularyTitle}>Bài học từ vựng</Text>
        </View>
        <HomeFeatureIcon name="arrow" color={colors.primaryText} size={20} />
      </Pressable>
      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Luyện kỹ năng
          </Text>
          {onOpenGames ? (
            <AuthButton
              label="Game từ vựng"
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

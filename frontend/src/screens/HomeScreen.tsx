import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthShell } from '../components/AuthForm';
import { HomeFeatureIcon } from '../components/HomeFeatureIcon';
import { LearningSkill, SkillPicker } from '../components/SkillPicker';
import { PromotionPanel } from '../components/PromotionPanel';
import { VocabularySearchBar } from '../components/VocabularySearchBar';
import { NihongoMascot } from '../components/NihongoMascot';
import { MISSING_DATA } from '../config/content';
import { User } from '../services/authService';
import { LearningOptions, LearningProfile } from '../services/learningService';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';

export type { LearningSkill } from '../components/SkillPicker';

interface Props {
  user: User;
  profile: LearningProfile;
  options: LearningOptions;
  onContinueLearning: () => void;
  onOpenSkill: (skill: LearningSkill) => void;
  onSearchVocabulary: (query: string) => void;
  onOpenVocabulary: () => void;
  onOpenPromotion: () => void;
}

export function HomeScreen({
  user,
  profile,
  options,
  onContinueLearning,
  onOpenSkill,
  onSearchVocabulary,
  onOpenVocabulary,
  onOpenPromotion,
}: Props) {
  const level =
    options.levels.find(option => option.id === profile.level)?.label ??
    profile.level;
  const goal =
    options.goals.find(option => option.id === profile.goal)?.label ??
    profile.goal;

  return (
    <AuthShell
      title={`Chào ${user.name}`}
      subtitle="Một chút tiếng Nhật, mỗi ngày."
      icon="user"
      card={false}
      headerAccessory={<NihongoMascot size={104} />}
    >
      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Tra cứu từ vựng
          </Text>
        </View>
        <VocabularySearchBar onSearch={onSearchVocabulary} />
        <Text style={styles.helper}>
          Hỗ trợ tiếng Nhật, romaji và nghĩa tiếng Việt.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Tiếp tục học
          </Text>
          <View style={styles.headingRule} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tiếp tục học. ${level}. ${goal}. ${profile.daily_minutes} phút mỗi ngày.`}
          onPress={onContinueLearning}
          style={({ pressed }) => [
            styles.continueCard,
            pressed ? styles.pressed : null,
          ]}
        >
          {({ pressed }) => (
            <View style={styles.continueBody}>
              <View style={styles.chips}>
                <View style={styles.levelChip}>
                  <Text style={styles.levelChipText}>{level}</Text>
                </View>
                <Text style={styles.minutes}>
                  {profile.daily_minutes} phút/ngày
                </Text>
              </View>
              <View style={styles.continueScene}>
                <View style={styles.continueCopy}>
                  <Text style={styles.continueTitle}>{goal}</Text>
                  <Text style={styles.continueDescription}>
                    Mở sách cùng Momo nhé!
                  </Text>
                </View>
                <NihongoMascot pose="reading" size={104} decorative />
              </View>
              <View
                style={[
                  styles.continueAction,
                  pressed ? styles.continueActionPressed : null,
                ]}
              >
                <Text style={styles.continueActionText}>Tiếp tục</Text>
                <HomeFeatureIcon
                  name="arrow"
                  size={19}
                  color={colors.onPrimary}
                />
              </View>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Luyện kỹ năng
          </Text>
          <Text style={styles.sectionCaption}>Học cùng Momo</Text>
        </View>
        <SkillPicker onOpenSkill={onOpenSkill} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Góc từ vựng
          </Text>
          <View style={styles.headingRule} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Từ vựng: ${MISSING_DATA}`}
          accessibilityState={{ disabled: true }}
          disabled
          style={({ pressed }) => [
            styles.wordNote,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.wordHeading}>
            <Text style={styles.wordEyebrow}>Momo mách bạn</Text>
            <Text style={styles.wordCategory}>{MISSING_DATA}</Text>
          </View>
          <Text style={styles.wordJapanese}>{MISSING_DATA}</Text>
          <Text style={styles.wordReading}>{MISSING_DATA}</Text>
          <View style={styles.wordFooter}>
            <Text style={styles.wordHint}>{MISSING_DATA}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mở khu vực học từ vựng"
          onPress={onOpenVocabulary}
          style={({ pressed }) => [
            styles.vocabularyCard,
            pressed ? styles.pressed : null,
          ]}
        >
          <NihongoMascot pose="writing" size={72} decorative />
          <View style={styles.vocabularyCopy}>
            <Text style={styles.vocabularyTitle}>Từ vựng của bạn</Text>
            <Text style={styles.vocabularyDescription}>
              Tra cứu, lưu và ôn lại những từ quan trọng.
            </Text>
          </View>
          <HomeFeatureIcon name="arrow" color={colors.primaryText} size={20} />
        </Pressable>
      </View>

      <PromotionPanel onPress={onOpenPromotion} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xl },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  sectionTitle: { ...typography.heading, color: colors.dark },
  sectionCaption: { ...typography.caption, color: colors.muted },
  headingRule: {
    flex: 1,
    minWidth: 24,
    height: 1,
    backgroundColor: colors.divider,
    alignSelf: 'center',
  },
  helper: { ...typography.body, color: colors.muted },
  continueCard: {
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  continueBody: { padding: spacing.xl, gap: spacing.lg },
  pressed: { backgroundColor: colors.surfaceTint },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  levelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.badgeBg,
  },
  levelChipText: { ...typography.caption, color: colors.badgeText },
  minutes: { ...typography.caption, color: colors.body },
  continueScene: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  continueCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  continueTitle: {
    ...typography.title,
    color: colors.dark,
  },
  continueDescription: { ...typography.body, color: colors.body },
  continueAction: {
    minHeight: layout.buttonHeight,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.primary,
  },
  continueActionPressed: { backgroundColor: colors.primaryPressed },
  continueActionText: {
    ...typography.button,
    color: colors.onPrimary,
    flexShrink: 1,
    textAlign: 'center',
  },
  vocabularyCard: {
    minHeight: 96,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  vocabularyCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  vocabularyTitle: { ...typography.label, color: colors.dark },
  vocabularyDescription: { ...typography.body, color: colors.body },
  wordNote: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    boxShadow: shadowMd,
  },
  wordHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  wordEyebrow: {
    ...typography.caption,
    color: colors.badgeText,
  },
  wordCategory: {
    ...typography.caption,
    color: colors.badgeText,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  wordJapanese: {
    ...typography.title,
    color: colors.dark,
    marginTop: spacing.xs,
  },
  wordReading: { ...typography.label, color: colors.body },
  wordFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  wordHint: { ...typography.body, color: colors.body, flex: 1 },
});

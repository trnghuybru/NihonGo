import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthShell } from '../components/AuthForm';
import {
  HomeFeatureIcon,
  HomeFeatureIconName,
} from '../components/HomeFeatureIcon';
import { LearningSkill, SkillPicker } from '../components/SkillPicker';
import {
  colors,
  layout,
  radius,
  shadowSm,
  spacing,
  typography,
} from '../theme/theme';

export function PracticeScreen({
  onOpenSkill,
  onOpenGames,
  onOpenFlashcards,
  onOpenLessons,
}: {
  onOpenSkill: (skill: LearningSkill) => void;
  onOpenGames?: () => void;
  onOpenFlashcards?: () => void;
  onOpenLessons?: () => void;
}) {
  const features: {
    label: string;
    icon: HomeFeatureIconName;
    onPress?: () => void;
  }[] = [
    { label: 'Bài học từ vựng', icon: 'reading', onPress: onOpenLessons },
    { label: 'Flashcard', icon: 'vocabulary', onPress: onOpenFlashcards },
    { label: 'Game từ vựng', icon: 'microphone', onPress: onOpenGames },
  ];
  return (
    <AuthShell title="Luyện tập" subtitle="" card={false} wide>
      <Text accessibilityRole="header" style={styles.heading}>
        Từ vựng
      </Text>
      <View style={styles.features}>
        {features
          .filter(feature => feature.onPress)
          .map(feature => (
            <Pressable
              key={feature.label}
              accessibilityRole="button"
              accessibilityLabel={feature.label}
              onPress={feature.onPress}
              style={({ pressed }) => [
                styles.feature,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.icon}>
                <HomeFeatureIcon
                  name={feature.icon}
                  color={colors.focus}
                  size={24}
                />
              </View>
              <Text style={styles.label}>{feature.label}</Text>
              <HomeFeatureIcon
                name="arrow"
                color={colors.primaryText}
                size={20}
              />
            </Pressable>
          ))}
      </View>
      <Text accessibilityRole="header" style={styles.heading}>
        Kỹ năng
      </Text>
      <SkillPicker onOpenSkill={onOpenSkill} />
    </AuthShell>
  );
}
const styles = StyleSheet.create({
  heading: { ...typography.title, color: colors.dark },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  feature: {
    flexGrow: 1,
    flexBasis: 240,
    minHeight: layout.touchTarget,
    padding: spacing.xl,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadowSm,
  },
  icon: {
    height: 48,
    width: 48,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { ...typography.label, color: colors.dark, flex: 1 },
  pressed: { backgroundColor: colors.surfaceTint },
});

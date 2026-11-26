import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
    { label: 'Flashcard', icon: 'flashcards', onPress: onOpenFlashcards },
    { label: 'Game từ vựng', icon: 'gamepad', onPress: onOpenGames },
  ];
  const web = Platform.OS === 'web';
  return (
    <AuthShell title="Luyện tập" subtitle="" card={false} wide hideHeader={web}>
      {web ? (
        <View nativeID="practice-welcome">
          <Text accessibilityRole="header" style={styles.title}>
            Luyện tập
          </Text>
        </View>
      ) : null}
      <View
        nativeID={web ? 'practice-vocabulary' : undefined}
        style={styles.section}
      >
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
                    size={20}
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
      </View>
      <View
        nativeID={web ? 'practice-skills' : undefined}
        style={styles.section}
      >
        <View>
          <Text accessibilityRole="header" style={styles.heading}>
            Luyện kỹ năng
          </Text>
        </View>
        <SkillPicker onOpenSkill={onOpenSkill} />
      </View>
    </AuthShell>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  title: {
    ...typography.title,
    fontSize: 21,
    lineHeight: 28,
    color: '#153549',
  },
  heading: { ...typography.title, color: colors.dark },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  feature: {
    flexGrow: 1,
    flexBasis: 240,
    minHeight: layout.touchTarget,
    padding: spacing.lg,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadowSm,
  },
  icon: {
    height: 40,
    width: 40,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { ...typography.label, color: colors.dark, flex: 1 },
  pressed: { backgroundColor: colors.surfaceTint },
});

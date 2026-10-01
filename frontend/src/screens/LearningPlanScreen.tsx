import { StyleSheet, Text } from 'react-native';
import { AuthButton, AuthNotice, AuthShell } from '../components/AuthForm';
import { LearningSummary } from '../components/LearningSummary';
import { LearningOptions, LearningProfile } from '../services/learningService';
import { colors, typography } from '../theme/theme';

interface Props {
  profile: LearningProfile;
  options: LearningOptions;
  onEdit: () => void;
  onBack?: () => void;
}

export function LearningPlanScreen({
  profile,
  options,
  onEdit,
  onBack,
}: Props) {
  return (
    <AuthShell
      title="Kế hoạch học tập"
      subtitle="Một mục tiêu vừa sức sẽ giúp bạn duy trì thói quen mỗi ngày."
    >
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Thiết lập hiện tại
      </Text>
      <LearningSummary selection={profile} options={options} />
      <AuthNotice message="Trình độ này do bạn tự đánh giá và có thể thay đổi bất cứ lúc nào." />
      <AuthButton label="Chỉnh sửa kế hoạch" onPress={onEdit} />
      {onBack ? (
        <AuthButton label="Về trang chủ" variant="text" onPress={onBack} />
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.heading, color: colors.dark },
});

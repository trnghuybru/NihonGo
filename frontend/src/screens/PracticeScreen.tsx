import { AuthShell } from '../components/AuthForm';
import { LearningSkill, SkillPicker } from '../components/SkillPicker';

export function PracticeScreen({
  onOpenSkill,
}: {
  onOpenSkill: (skill: LearningSkill) => void;
}) {
  return (
    <AuthShell
      title="Luyện tập"
      subtitle="Chọn kỹ năng bạn muốn luyện cùng Momo hôm nay."
      card={false}
    >
      <SkillPicker onOpenSkill={onOpenSkill} />
    </AuthShell>
  );
}

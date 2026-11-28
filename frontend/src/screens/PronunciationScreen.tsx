import { AuthShell } from '../components/AuthForm';
import { PronunciationPractice } from '../components/PronunciationPractice';
import { ScreenBackHeader } from '../components/ScreenBackHeader';
export function PronunciationScreen({ onExit }: { onExit?: () => void }) {
  return (
    <AuthShell
      title="Luyện phát âm"
      subtitle="Chọn một câu ngắn để nghe và tập đọc."
      card={false}
      wide
      hideHeader={Boolean(onExit)}
    >
      {onExit ? (
        <ScreenBackHeader
          title="Luyện phát âm"
          backLabel="Quay lại luyện tập"
          onBack={onExit}
        />
      ) : null}
      <PronunciationPractice />
    </AuthShell>
  );
}

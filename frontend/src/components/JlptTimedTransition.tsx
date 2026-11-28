import { Modal, StyleSheet, Text, View } from 'react-native';
import { Exam, ExamSection } from '../services/jlptService';
import { AuthButton, AuthNotice } from './AuthForm';
import { colors, typography } from '../theme/theme';

export function JlptTimedTransition({
  exam,
  completed,
  onStart,
  onSubmit,
  busy,
  onExit,
  error = '',
}: {
  exam: Exam;
  completed: number;
  onStart: () => void;
  onSubmit: () => void;
  busy: boolean;
  onExit: () => void;
  error?: string;
}) {
  const next: ExamSection | undefined = exam.sections[completed + 1];
  const missingAudio = next?.id === 'listening' && !exam.audio_url;
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onExit();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>
            Đã hết giờ phần {exam.sections[completed].label}
          </Text>
          <Text style={styles.body}>Phần này đã khóa đáp án.</Text>
          <AuthNotice message={error} error />
          {next ? (
            <>
              <Text style={styles.title}>
                {next.label} · {(next.duration_seconds ?? 0) / 60} phút
              </Text>
              {missingAudio ? (
                <Text style={styles.body}>
                  Chưa có tệp nghe. Bạn có thể xem kết quả các phần đã làm.
                </Text>
              ) : (
                <Text style={styles.body}>
                  Đồng hồ của phần tiếp theo chạy khi bạn bấm bắt đầu.
                </Text>
              )}
              <AuthButton
                label={`Bắt đầu ${next.label}`}
                onPress={onStart}
                disabled={missingAudio || busy}
                size="compact"
              />
            </>
          ) : null}
          {missingAudio || !next ? (
            <AuthButton
              label="Nộp bài phần đã làm"
              onPress={onSubmit}
              busy={busy}
              size="compact"
            />
          ) : null}
          <AuthButton
            label="Lưu và thoát"
            onPress={onExit}
            disabled={busy}
            size="compact"
            variant="text"
          />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(21,53,73,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.surface,
    gap: 20,
  },
  title: { ...typography.heading, fontSize: 18, color: colors.dark },
  body: { ...typography.body, lineHeight: 24, color: colors.body },
});

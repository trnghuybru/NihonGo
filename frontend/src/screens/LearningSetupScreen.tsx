import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { AuthButton, AuthNotice, AuthShell } from '../components/AuthForm';
import { LearningChoice } from '../components/LearningChoice';
import { LearningSummary } from '../components/LearningSummary';
import {
  LearningGoal,
  LearningLevel,
  LearningOptions,
  LearningProfile,
  LearningSelection,
} from '../services/learningService';
import { ApiError } from '../services/apiClient';
import { colors, radius, spacing, typography } from '../theme/theme';

interface Props {
  profile: LearningProfile | null;
  options: LearningOptions;
  onSave: (selection: LearningSelection) => Promise<void>;
  onCancel: () => void | Promise<void>;
  onReload: () => void;
}

const steps = ['Trình độ', 'Mục tiêu', 'Xác nhận'];
const titles = [
  'Bạn đang ở trình độ nào?',
  'Bạn muốn học tiếng Nhật để…',
  'Sẵn sàng cho hành trình mới',
];
const subtitles = [
  'Chọn mức gần nhất với khả năng hiện tại của bạn.',
  'Chọn một mục tiêu chính và dành chút thời gian mỗi ngày.',
  'Kiểm tra trình độ và mục tiêu trước khi lưu.',
];

export function LearningSetupScreen({
  profile,
  options,
  onSave,
  onCancel,
  onReload,
}: Props) {
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<LearningLevel | null>(
    profile?.level ?? null,
  );
  const [goal, setGoal] = useState<LearningGoal | null>(profile?.goal ?? null);
  const [minutes, setMinutes] = useState<number | null>(
    profile?.daily_minutes ?? null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const cancel = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await onCancel();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Không thực hiện được yêu cầu.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [onCancel]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (busyRef.current) {
          return true;
        }
        if (step > 0) {
          setStep(current => current - 1);
          return true;
        }
        if (profile) {
          cancel();
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [step, profile, cancel]);

  async function save() {
    if (busyRef.current || !level || !goal || minutes === null || conflict) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave({ level, goal, daily_minutes: minutes });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Không lưu được thiết lập. Vui lòng thử lại.',
      );
      setConflict(
        failure instanceof ApiError && failure.code === 'preferences_conflict',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const canContinue =
    step === 0 ? level !== null : goal !== null && minutes !== null;
  return (
    <AuthShell
      key={step}
      title={titles[step]}
      subtitle={subtitles[step]}
      footer={
        <AuthButton
          label={profile ? 'Hủy chỉnh sửa' : 'Đăng xuất'}
          variant="text"
          disabled={busy}
          onPress={cancel}
        />
      }
    >
      <View
        accessibilityLabel={`Bước ${step + 1} trên 3: ${steps[step]}`}
        accessible
        style={styles.progress}
      >
        {steps.map((label, index) => (
          <View key={label} style={styles.progressItem}>
            <View style={[styles.track, index <= step && styles.trackActive]} />
            <Text
              style={[styles.stepText, index === step && styles.stepActive]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      {step === 0 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Trình độ hiện tại"
          style={styles.choices}
        >
          {options.levels.map(option => (
            <LearningChoice
              key={option.id}
              {...option}
              selected={level === option.id}
              disabled={busy}
              onPress={() => setLevel(option.id)}
            />
          ))}
          <Text style={styles.note}>
            Đây là tự đánh giá, không phải kết quả kiểm tra hay chứng chỉ JLPT.
          </Text>
        </View>
      ) : step === 1 ? (
        <>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Mục tiêu chính"
            style={styles.choices}
          >
            {options.goals.map(option => (
              <LearningChoice
                key={option.id}
                {...option}
                selected={goal === option.id}
                disabled={busy}
                onPress={() => setGoal(option.id)}
              />
            ))}
          </View>
          <Text accessibilityRole="header" style={styles.heading}>
            Bạn dành bao nhiêu phút mỗi ngày?
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Thời gian mỗi ngày"
            style={styles.timeChoices}
          >
            {options.daily_minutes.map(value => (
              <View key={value} style={styles.timeChoice}>
                <LearningChoice
                  label={`${value} phút`}
                  selected={minutes === value}
                  disabled={busy}
                  onPress={() => setMinutes(value)}
                />
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            Chọn thời lượng phù hợp với lịch sinh hoạt của bạn.
          </Text>
        </>
      ) : level && goal && minutes !== null ? (
        <LearningSummary
          selection={{ level, goal, daily_minutes: minutes }}
          options={options}
        />
      ) : null}
      <AuthNotice message={error} error />
      {conflict ? (
        <AuthButton label="Tải lại thiết lập mới nhất" onPress={onReload} />
      ) : step < 2 ? (
        <AuthButton
          label="Tiếp tục"
          trailingIcon="arrow"
          disabled={!canContinue || busy}
          onPress={() => setStep(current => current + 1)}
        />
      ) : (
        <AuthButton
          label={profile ? 'Xác nhận thay đổi' : 'Xác nhận và bắt đầu'}
          trailingIcon="check"
          busy={busy}
          onPress={save}
        />
      )}
      {step > 0 ? (
        <AuthButton
          label="Quay lại"
          variant="text"
          disabled={busy}
          onPress={() => setStep(current => current - 1)}
        />
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: spacing.sm },
  progressItem: { flex: 1, gap: spacing.sm },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
  },
  trackActive: { backgroundColor: colors.primary },
  stepText: { ...typography.caption, color: colors.muted },
  stepActive: { color: colors.dark },
  choices: { gap: spacing.sm },
  timeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChoice: { flexBasis: '45%', flexGrow: 1 },
  heading: { ...typography.heading, color: colors.dark },
  note: { ...typography.body, color: colors.body },
});

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AuthButton,
  AuthField,
  AuthNotice,
  AuthShell,
  AuthCard,
  AuthContact,
} from '../components/AuthForm';
import { authService, Challenge, User } from '../services/authService';
import { colors, typography } from '../theme/theme';
import { LearningSummary } from '../components/LearningSummary';
import { LearningOptions, LearningProfile } from '../services/learningService';

export function AccountScreen({
  user,
  learningProfile,
  learningOptions,
  onEditLearning,
}: {
  user: User;
  learningProfile: LearningProfile;
  learningOptions: LearningOptions;
  onEditLearning: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!challenge) {
      return;
    }
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  async function run(operation: () => Promise<void>) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Có lỗi xảy ra.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const remaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  return (
    <AuthShell
      title={`Xin chào, ${user.name}`}
      subtitle="Theo dõi thiết lập học tập và quản lý tài khoản của bạn."
      icon="user"
      card={false}
      footer={
        <AuthButton
          label="Đăng xuất"
          secondary
          busy={busy}
          onPress={() => {
            run(() => authService.logout());
          }}
        />
      }
    >
      <AuthCard>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Thiết lập học tập
        </Text>
        <LearningSummary
          selection={learningProfile}
          options={learningOptions}
        />
        <AuthButton
          label="Chỉnh sửa trình độ và mục tiêu"
          variant="outline"
          disabled={busy}
          onPress={onEditLearning}
        />
      </AuthCard>
      <AuthCard>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Thông tin cá nhân
        </Text>
        <AuthContact
          label="Email"
          value={user.email}
          verified={user.email_verified}
          icon="mail"
        />
        <View style={styles.divider} />
        <AuthContact
          label="Số điện thoại"
          value={user.phone}
          verified={user.phone_verified}
          icon="phone"
        />
      </AuthCard>
      <AuthCard>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Bảo vệ tài khoản
        </Text>
        <AuthNotice message="Chỉ thông tin đã xác thực mới dùng được để đăng nhập bằng mật khẩu hoặc khôi phục tài khoản." />
        {!challenge ? (
          (['email', 'sms'] as const).map(channel => {
            const verified =
              channel === 'email' ? user.email_verified : user.phone_verified;
            return verified ? null : (
              <AuthButton
                key={channel}
                secondary
                disabled={busy}
                label={
                  channel === 'email'
                    ? 'Xác thực email'
                    : 'Xác thực số điện thoại'
                }
                onPress={() => {
                  run(async () => {
                    const result = await authService.requestContact(channel);
                    setChallenge(result);
                    setResendAt(Date.now() + result.resend_after * 1000);
                    setClock(Date.now());
                  });
                }}
              />
            );
          })
        ) : (
          <>
            <AuthNotice
              message={`Nhập mã gửi đến ${challenge.destination}. Mã có hiệu lực 10 phút.`}
            />
            <AuthField
              label="Mã xác thực"
              code
              placeholder="000000"
              value={code}
              editable={!busy}
              maxLength={6}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              onChangeText={value =>
                setCode(value.replace(/\D/g, '').slice(0, 6))
              }
            />
            <AuthButton
              label="Xác thực"
              trailingIcon="check"
              busy={busy}
              onPress={() => {
                run(async () => {
                  await authService.verifyContact(challenge.challenge_id, code);
                  setChallenge(null);
                  setCode('');
                });
              }}
            />
            <AuthButton
              label={remaining ? `Gửi lại mã sau ${remaining}s` : 'Gửi lại mã'}
              variant="text"
              secondary
              disabled={busy || remaining > 0}
              onPress={() => {
                run(async () => {
                  const result = await authService.resend(
                    challenge.challenge_id,
                  );
                  setChallenge(result);
                  setResendAt(Date.now() + result.resend_after * 1000);
                  setCode('');
                });
              }}
            />
            <AuthButton
              label="Hủy xác thực"
              variant="text"
              secondary
              disabled={busy}
              onPress={() => {
                setChallenge(null);
                setCode('');
                setError('');
              }}
            />
          </>
        )}
        <AuthNotice message={error} error />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.heading, color: colors.dark },
  divider: { height: 1, backgroundColor: colors.divider },
});

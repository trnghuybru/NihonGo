import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AuthButton,
  AuthField,
  AuthNotice,
  AuthShell,
  AuthCard,
  AuthContact,
} from '../components/AuthForm';
import {
  authService,
  Challenge,
  User,
  type AiBudget,
  type DailyQuota,
} from '../services/authService';
import { betaWeb } from '../config/beta';
import { colors, radius, spacing, typography } from '../theme/theme';
import { AuthIcon } from '../components/AuthIcon';
import { useWebLayout } from '../hooks/useWebLayout';
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
  const { desktop } = useWebLayout();
  const [pendingAction, setPendingAction] = useState<
    'verify' | 'logout' | null
  >(null);
  const busy = pendingAction !== null;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [logoutError, setLogoutError] = useState('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [aiBudget, setAiBudget] = useState<AiBudget | null>(null);
  const [dailyQuota, setDailyQuota] = useState<DailyQuota | null>(null);
  const [budgetError, setBudgetError] = useState('');
  async function reloadBudget() {
    try {
      if (betaWeb) setDailyQuota(await authService.dailyQuota());
      else setAiBudget(await authService.aiBudget());
      setBudgetError('');
    } catch (failure) {
      if (
        failure &&
        typeof failure === 'object' &&
        'status' in failure &&
        failure.status === 404
      )
        return;
      setBudgetError(betaWeb ? 'Chưa tải được lượt dùng hôm nay. Vui lòng thử lại.' : 'Chưa tải được số dư AI. Vui lòng thử lại.');
    }
  }
  useEffect(() => {
    reloadBudget();
  }, [user.id]);
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
  async function run(
    operation: () => Promise<void>,
    action: 'verify' | 'logout' = 'verify',
  ) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setPendingAction(action);
    if (action === 'logout') setLogoutError('');
    else setError('');
    try {
      await operation();
    } catch (failure) {
      if (alive.current) {
        const message =
          failure instanceof Error ? failure.message : 'Có lỗi xảy ra.';
        if (action === 'logout') setLogoutError(message);
        else setError(message);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setPendingAction(null);
    }
  }
  const remaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  return (
    <AuthShell
      title="Cá nhân"
      subtitle="Quản lý thông tin và thiết lập học tập của bạn."
      icon="user"
      card={false}
      wide={desktop}
      headerAccessory={
        <View style={styles.avatar} accessible={false}>
          <Text style={styles.avatarText}>
            {user.name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
      }
    >
      <View
        style={[styles.columns, desktop && styles.desktopColumns]}
        testID="account-layout"
      >
        <View style={styles.mainColumn} testID="account-details">
          <AuthCard>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Thông tin cá nhân
            </Text>
            <View style={styles.nameField}>
              <Text style={styles.label}>Họ và tên</Text>
              <Text selectable style={styles.name}>
                {user.name}
              </Text>
            </View>
            <View style={styles.divider} />
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
            <View style={styles.securityIntro}>
              <View style={styles.securityIcon}>
                <AuthIcon
                  name="shield"
                  size={22}
                  color={
                    user.email_verified && user.phone_verified
                      ? colors.success
                      : colors.focus
                  }
                />
              </View>
              <Text style={styles.description}>
                {user.email_verified && user.phone_verified
                  ? 'Email và số điện thoại đã được xác thực.'
                  : 'Xác thực thông tin liên hệ để đăng nhập bằng mật khẩu và khôi phục tài khoản.'}
              </Text>
            </View>
            <View style={desktop ? styles.verificationForm : undefined}>
              {!challenge ? (
                (['email', 'sms'] as const).map(channel => {
                  const verified =
                    channel === 'email'
                      ? user.email_verified
                      : user.phone_verified;
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
                          const result = await authService.requestContact(
                            channel,
                          );
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
                        await authService.verifyContact(
                          challenge.challenge_id,
                          code,
                        );
                        setChallenge(null);
                        setCode('');
                      });
                    }}
                  />
                  <AuthButton
                    label={
                      remaining ? `Gửi lại mã sau ${remaining}s` : 'Gửi lại mã'
                    }
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
            </View>
            <AuthNotice message={error} error />
          </AuthCard>
        </View>
        <View
          style={[styles.sideColumn, desktop && styles.desktopSideColumn]}
          testID="account-settings"
        >
          {dailyQuota || aiBudget || budgetError ? (
            <AuthCard>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                {dailyQuota ? 'Lượt dùng hôm nay' : 'Ví AI dùng thử'}
              </Text>
              {dailyQuota ? (
                <Text style={styles.description}>
                  Dịch video: còn {dailyQuota.video_remaining}/{dailyQuota.video_limit}.{' '}
                  Nói Live: còn {dailyQuota.live_remaining}/{dailyQuota.live_limit} phiên,{' '}
                  tối đa {dailyQuota.live_seconds_per_session / 60} phút/phiên.{' '}
                  Làm mới lúc 00:00 giờ Việt Nam.
                </Text>
              ) : null}
              {aiBudget ? (
                <Text style={styles.description}>
                  Còn {aiBudget.available_usd.toFixed(2)} USD /{' '}
                  {aiBudget.budget_usd.toFixed(2)} USD.
                  {aiBudget.expires_at
                    ? ` Hết hạn ${new Date(
                        aiBudget.expires_at * 1000,
                      ).toLocaleDateString('vi-VN')}.`
                    : ' Thời hạn 14 ngày bắt đầu từ lần dùng AI đầu tiên.'}
                </Text>
              ) : null}
              <AuthNotice message={budgetError} error />
              <AuthButton
                label={dailyQuota ? 'Cập nhật lượt dùng' : 'Cập nhật số dư'}
                variant="outline"
                onPress={reloadBudget}
              />
            </AuthCard>
          ) : null}
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
              Phiên đăng nhập
            </Text>
            <Text style={styles.description}>
              Đăng xuất tài khoản khỏi thiết bị này.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đăng xuất"
              accessibilityState={{
                disabled: busy,
                busy: pendingAction === 'logout',
              }}
              disabled={busy}
              onPress={() => run(() => authService.logout(), 'logout')}
              style={({ pressed }) => [
                styles.logout,
                busy && styles.logoutDisabled,
                pressed && styles.logoutPressed,
              ]}
            >
              {pendingAction === 'logout' ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <AuthIcon
                  name="logout"
                  size={18}
                  color={busy ? colors.disabledText : colors.danger}
                />
              )}
              <Text style={[styles.logoutText, busy && styles.disabledText]}>
                {pendingAction === 'logout' ? 'Đang đăng xuất…' : 'Đăng xuất'}
              </Text>
            </Pressable>
            <AuthNotice message={logoutError} error />
          </AuthCard>
        </View>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  columns: { gap: spacing.xl },
  desktopColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxl,
  },
  mainColumn: { flex: 1, minWidth: 0, gap: spacing.xl },
  sideColumn: { gap: spacing.xl, minWidth: 0 },
  desktopSideColumn: { width: 340, flexShrink: 0 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.brand, color: colors.focus },
  nameField: { gap: spacing.xs },
  name: { ...typography.title, color: colors.dark },
  label: { ...typography.caption, color: colors.muted },
  description: { ...typography.body, color: colors.body, flexShrink: 1 },
  securityIcon: { width: 24, flexShrink: 0 },
  verificationForm: { width: '100%', maxWidth: 400 },
  securityIntro: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  logout: {
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logoutText: { ...typography.label, color: colors.danger },
  logoutDisabled: {
    borderColor: colors.disabled,
    backgroundColor: colors.disabled,
  },
  logoutPressed: { backgroundColor: colors.dangerBg },
  disabledText: { color: colors.disabledText },
  sectionTitle: { ...typography.heading, color: colors.dark },
  divider: { height: 1, backgroundColor: colors.divider },
});

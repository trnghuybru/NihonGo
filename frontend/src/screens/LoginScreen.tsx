import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
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
  AuthSteps,
} from '../components/AuthForm';
import {
  authService,
  AuthConfig,
  Challenge,
  Provider,
  SocialProfile,
} from '../services/authService';
import { colors, spacing, typography } from '../theme/theme';
import { AppleIcon, GoogleIcon } from '../components/icons';

type Stage = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const PROVIDER_NAMES: Record<Provider, string> = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
};

export function LoginScreen() {
  const [stage, setStage] = useState<Stage>('login');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [social, setSocial] = useState<SocialProfile | null>(null);
  const [socialPending, setSocialPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Có lỗi xảy ra. Vui lòng thử lại.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    const result = await authService.config();
    setConfig(result);
  }, []);

  const resumeSocial = useCallback(async () => {
    const result = await authService.resumeSocial();
    if (!result) {
      return;
    }
    if ('status' in result && result.status === 'pending') {
      setSocialPending(true);
    } else {
      setSocialPending(false);
      if ('status' in result && result.status === 'profile_required') {
        setSocial(result);
        setName(result.name);
        setEmail(result.email);
        setPassword('');
        setConfirmation('');
        setStage('register');
        setNotice('Bổ sung hồ sơ và xác thực email để hoàn tất đăng ký.');
      }
    }
  }, []);

  useEffect(() => {
    run(async () => {
      await loadConfig();
      await resumeSocial();
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') {
        run(resumeSocial);
      }
    });
    const links = Linking.addEventListener('url', event => {
      if (event.url === 'nihongoflow://auth/callback') {
        run(resumeSocial);
      }
    });
    return () => {
      appState.remove();
      links.remove();
    };
  }, [loadConfig, resumeSocial, run]);

  useEffect(() => {
    if (!challenge) {
      return;
    }
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  function receiveChallenge(result: Challenge, nextStage: Stage) {
    setChallenge(result);
    setResendAt(Date.now() + result.resend_after * 1000);
    setClock(Date.now());
    setCode('');
    setPassword('');
    setConfirmation('');
    setStage(nextStage);
  }

  function navigate(next: Stage) {
    setStage(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    setCode('');
    setChallenge(null);
    setSocial(null);
  }

  async function submit() {
    if (stage === 'login') {
      if (!identifier.trim() || !password) {
        throw new Error('Nhập email/số điện thoại và mật khẩu.');
      }
      await authService.login(identifier.trim(), password);
    } else if (stage === 'register') {
      if (name.trim().length < 2 || !email.trim() || !phone.trim()) {
        throw new Error('Vui lòng nhập đầy đủ tên, email và số điện thoại.');
      }
      if (!social && (password.length < 15 || password !== confirmation)) {
        throw new Error(
          'Mật khẩu cần ít nhất 15 ký tự và khớp với phần xác nhận.',
        );
      }
      const result = await authService.register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        ...(social ? { social_token: social.social_token } : { password }),
      });
      receiveChallenge(result, 'verify');
      setNotice(
        'Mã đã được gửi qua email và có hiệu lực 10 phút. Vui lòng kiểm tra cả thư rác.',
      );
    } else if (stage === 'verify' && challenge) {
      if (!/^\d{6}$/.test(code)) {
        throw new Error('Nhập đủ 6 chữ số trong mã xác thực.');
      }
      await authService.verify(challenge.challenge_id, code);
    } else if (stage === 'forgot') {
      if (!identifier.trim()) {
        throw new Error('Nhập email hoặc số điện thoại đã xác thực.');
      }
      receiveChallenge(await authService.forgot(identifier.trim()), 'reset');
      setNotice(
        'Nếu thông tin này thuộc tài khoản đã xác thực, bạn sẽ nhận được mã đặt lại mật khẩu.',
      );
    } else if (stage === 'reset' && challenge) {
      if (
        !/^\d{6}$/.test(code) ||
        password.length < 15 ||
        password !== confirmation
      ) {
        throw new Error(
          'Nhập mã 6 chữ số và mật khẩu mới ít nhất 15 ký tự, khớp phần xác nhận.',
        );
      }
      await authService.reset(challenge.challenge_id, code, password);
      navigate('login');
      setNotice('Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.');
    }
  }

  const titles: Record<Stage, string> = {
    login: 'Chào mừng trở lại!',
    register: social ? 'Hoàn tất hồ sơ' : 'Tạo tài khoản',
    verify: 'Xác thực tài khoản',
    forgot: 'Quên mật khẩu?',
    reset: 'Đặt lại mật khẩu',
  };
  const subtitles: Record<Stage, string> = {
    login: 'Đăng nhập để tiếp tục hành trình học tiếng Nhật.',
    register: 'Mã xác thực sẽ được gửi đến email bạn đăng ký.',
    verify: `Nhập mã 6 chữ số gửi đến ${challenge?.destination || ''}.`,
    forgot: 'Nhập email hoặc số điện thoại bạn đã xác thực.',
    reset: `Nhập mã xác thực gửi đến ${
      challenge?.destination || ''
    } và mật khẩu mới.`,
  };
  const labels: Record<Stage, string> = {
    login: 'Đăng nhập',
    register: 'Tiếp tục',
    verify: 'Xác thực và đăng nhập',
    forgot: 'Gửi mã khôi phục',
    reset: 'Lưu mật khẩu mới',
  };
  const remaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const showPassword =
    stage === 'login' || stage === 'reset' || (stage === 'register' && !social);

  return (
    <AuthShell
      title={titles[stage]}
      subtitle={subtitles[stage]}
      icon={
        stage === 'register'
          ? 'user'
          : stage === 'verify' || stage === 'forgot'
          ? 'mail'
          : 'lock'
      }
      eyebrow={
        stage === 'register'
          ? 'Bắt đầu hành trình'
          : stage === 'login'
          ? undefined
          : 'Bảo vệ tài khoản'
      }
      footer={
        stage === 'login' ? (
          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>Chưa có tài khoản?</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Đăng ký ngay"
              accessibilityState={{ disabled: busy || socialPending }}
              disabled={busy || socialPending}
              onPress={() => navigate('register')}
              style={styles.signupAction}
            >
              <Text
                style={[
                  styles.signupLink,
                  busy || socialPending ? styles.signupDisabled : null,
                ]}
              >
                Đăng ký ngay
              </Text>
            </Pressable>
          </View>
        ) : undefined
      }
    >
      {stage === 'register' || stage === 'verify' ? (
        <AuthSteps current={stage === 'register' ? 1 : 2} />
      ) : null}
      <AuthNotice message={notice} />
      {stage === 'register' ? (
        <>
          <AuthField
            label="Họ và tên"
            icon="user"
            placeholder="Nhập họ và tên"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            maxLength={100}
            editable={!busy}
          />
          <AuthField
            label="Email"
            icon="mail"
            placeholder="Nhập email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            maxLength={254}
            editable={!busy}
          />
          <AuthField
            label="Số điện thoại"
            icon="phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="Nhập số điện thoại"
            maxLength={32}
            editable={!busy}
          />
          {config && !config.channels.includes('email') ? (
            <AuthNotice message="Dịch vụ gửi email xác thực chưa khả dụng. Vui lòng thử lại sau." />
          ) : null}
        </>
      ) : null}
      {stage === 'login' || stage === 'forgot' ? (
        <AuthField
          label="Email hoặc số điện thoại"
          icon="user"
          placeholder="Email hoặc số điện thoại đã xác thực"
          value={identifier}
          onChangeText={setIdentifier}
          autoComplete="username"
          maxLength={254}
          editable={!busy}
        />
      ) : null}
      {stage === 'verify' || stage === 'reset' ? (
        <AuthField
          label="Mã xác thực"
          code
          placeholder="Nhập mã xác thực"
          value={code}
          onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          editable={!busy}
        />
      ) : null}
      {showPassword ? (
        <AuthField
          label={stage === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'}
          password
          icon="lock"
          placeholder={
            stage === 'login' ? 'Nhập mật khẩu' : 'Tạo mật khẩu của bạn'
          }
          value={password}
          onChangeText={setPassword}
          maxLength={128}
          editable={!busy}
          autoComplete={stage === 'login' ? 'current-password' : 'new-password'}
          onSubmitEditing={() => {
            if (stage === 'login') {
              run(submit);
            }
          }}
        />
      ) : null}
      {showPassword && stage !== 'login' ? (
        <>
          <AuthNotice message="Dùng một cụm từ dài từ 15 đến 128 ký tự. Mật khẩu có phân biệt chữ hoa và chữ thường." />
          <AuthField
            label="Xác nhận mật khẩu"
            password
            icon="lock"
            placeholder="Nhập lại mật khẩu"
            value={confirmation}
            onChangeText={setConfirmation}
            autoComplete="new-password"
            maxLength={128}
            editable={!busy}
          />
        </>
      ) : null}
      {stage === 'login' ? (
        <View style={styles.forgotAction}>
          <AuthButton
            label="Quên mật khẩu?"
            variant="text"
            disabled={busy || socialPending}
            onPress={() => navigate('forgot')}
          />
        </View>
      ) : null}
      <AuthNotice message={error} error />
      {!config ? (
        <AuthButton
          label="Thử kết nối lại"
          secondary
          busy={busy}
          onPress={() => {
            run(loadConfig);
          }}
        />
      ) : null}
      <AuthButton
        label={labels[stage]}
        trailingIcon="arrow"
        busy={busy}
        disabled={
          socialPending ||
          (stage === 'register' && !config?.channels.includes('email'))
        }
        onPress={() => {
          run(submit);
        }}
      />
      {challenge ? (
        <AuthButton
          secondary
          variant="text"
          label={remaining ? `Gửi lại mã sau ${remaining}s` : 'Gửi lại mã'}
          disabled={busy || remaining > 0}
          onPress={() => {
            run(async () => {
              const result = await authService.resend(challenge.challenge_id);
              setChallenge(result);
              setResendAt(Date.now() + result.resend_after * 1000);
              setCode('');
              setNotice('Đã gửi mã mới.');
            });
          }}
        />
      ) : null}
      {stage === 'login' ? (
        <>
          {(config?.providers.length ?? 0) > 0 ? (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.divider}>Hoặc tiếp tục bằng</Text>
              <View style={styles.dividerLine} />
            </View>
          ) : null}
          {(config?.providers || []).map(provider => (
            <AuthButton
              key={provider}
              label={PROVIDER_NAMES[provider]}
              icon={
                provider === 'google' ? (
                  <GoogleIcon size={20} />
                ) : provider === 'apple' ? (
                  <AppleIcon size={20} color={colors.dark} />
                ) : undefined
              }
              secondary
              disabled={busy || socialPending}
              onPress={() => {
                run(async () => {
                  await authService.startSocial(provider);
                  setSocialPending(true);
                });
              }}
            />
          ))}
        </>
      ) : (
        <AuthButton
          label="Quay lại đăng nhập"
          variant="text"
          secondary
          disabled={busy}
          onPress={() => navigate('login')}
        />
      )}
      {socialPending ? (
        <>
          <AuthNotice message="Hoàn tất đăng nhập trong trình duyệt, sau đó quay lại ứng dụng." />
          <AuthButton
            label="Tôi đã hoàn tất đăng nhập"
            secondary
            disabled={busy}
            onPress={() => {
              run(resumeSocial);
            }}
          />
          <AuthButton
            label="Hủy đăng nhập mạng xã hội"
            variant="text"
            secondary
            disabled={busy}
            onPress={() => {
              run(async () => {
                await authService.cancelSocial();
                setSocialPending(false);
              });
            }}
          />
        </>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  signupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.xs,
  },
  signupPrompt: { ...typography.body, color: colors.body },
  signupAction: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  signupLink: {
    ...typography.link,
    color: colors.primaryText,
  },
  signupDisabled: { color: colors.disabledText },
  forgotAction: { alignSelf: 'flex-end', marginTop: -spacing.sm },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  divider: { ...typography.caption, color: colors.muted, textAlign: 'center' },
});

import {
  APP_HOME_PATH,
  authPaths,
  safeReturnTo,
  useWebNavigation,
} from '../navigation/webNavigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { AppleIcon, GoogleIcon } from '../components/icons';
import { NihongoMascot } from '../components/NihongoMascot';
import { LoginCharacterRain } from '../components/LoginCharacterRain';

const BETA_SIGNUP_URL = 'https://forms.gle/SYYD5H2M54CfhuLg6';

type Stage = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const PROVIDER_NAMES: Record<Provider, string> = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
};

const stagePaths: Record<Stage, string> = {
  login: '/login',
  register: '/register',
  forgot: '/forgot-password',
  verify: '/verify',
  reset: '/reset-password',
};

export function LoginScreen() {
  const { width } = useWindowDimensions();
  const compactInvite = Platform.OS !== 'web' || width < 900;
  const web = useWebNavigation();
  const webRef = useRef(web);
  webRef.current = web;
  const [stageState, setStageState] = useState<Stage>('login');
  const stage = web
    ? (Object.keys(stagePaths).find(
        key => stagePaths[key as Stage] === web.pathname,
      ) as Stage | undefined) ?? stageState
    : stageState;
  const setStage = useCallback((next: Stage) => {
    setStageState(next);
    const nav = webRef.current;
    if (nav) {
      const target = safeReturnTo(
        authPaths.has(nav.pathname)
          ? new URLSearchParams(nav.search).get('returnTo')
          : nav.pathname + nav.search,
      );
      nav.navigate(
        stagePaths[next] +
          (target === APP_HOME_PATH
            ? ''
            : '?returnTo=' + encodeURIComponent(target)),
      );
    }
  }, []);
  useEffect(() => {
    // Logout may already have changed the browser URL while this render still
    // holds the previous private route. Do not replace that newer navigation.
    if (
      web &&
      !authPaths.has(web.pathname) &&
      (typeof window === 'undefined' ||
        !window.location ||
        window.location.pathname.replace(/\/+$/, '') === web.pathname)
    )
      web.navigate(
        '/login' +
          (safeReturnTo(web.pathname + web.search) === APP_HOME_PATH
            ? ''
            : '?returnTo=' +
              encodeURIComponent(safeReturnTo(web.pathname + web.search))),
        { replace: true },
      );
  }, [web]);
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
  const [socialLinking, setSocialLinking] = useState(false);
  useEffect(() => {
    if (web && !challenge && (stage === 'verify' || stage === 'reset')) {
      const target = stage === 'verify' ? '/register' : '/forgot-password';
      web.navigate(target + web.search, { replace: true });
    }
  }, [web, stage, challenge]);
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

  const receiveChallenge = useCallback(
    (result: Challenge, nextStage: Stage) => {
      setChallenge(result);
      setResendAt(Date.now() + result.resend_after * 1000);
      setClock(Date.now());
      setCode('');
      setPassword('');
      setConfirmation('');
      setStage(nextStage);
    },
    [setStage],
  );

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
      } else if ('status' in result && result.status === 'link_required') {
        setSocialLinking(true);
        receiveChallenge(result, 'verify');
        setNotice(
          'Nhập mã gửi đến email để liên kết Google với tài khoản hiện có.',
        );
      }
    }
  }, [setStage, receiveChallenge]);

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

  function navigate(next: Stage) {
    setStage(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    setCode('');
    setChallenge(null);
    setSocial(null);
    setSocialLinking(false);
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
      if (!social && (password.length < 8 || password !== confirmation)) {
        throw new Error(
          'Mật khẩu cần ít nhất 8 ký tự và khớp với phần xác nhận.',
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
      if (socialLinking) {
        await authService.verifySocialLink(challenge.challenge_id, code);
      } else {
        await authService.verify(challenge.challenge_id, code);
      }
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
        password.length < 8 ||
        password !== confirmation
      ) {
        throw new Error(
          'Nhập mã 6 chữ số và mật khẩu mới ít nhất 8 ký tự, khớp phần xác nhận.',
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
    verify: socialLinking ? 'Liên kết Google' : 'Xác thực tài khoản',
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
    verify: socialLinking ? 'Liên kết và đăng nhập' : 'Xác thực và đăng nhập',
    forgot: 'Gửi mã khôi phục',
    reset: 'Lưu mật khẩu mới',
  };
  const scenicLogin = Platform.OS === 'web' && stage === 'login';
  const providers = config?.providers ?? [];
  const showUnavailableGoogle = scenicLogin && config !== null && !providers.includes('google');
  const remaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const showPassword =
    stage === 'login' || stage === 'reset' || (stage === 'register' && !social);

  return (
    <AuthShell
      scenicLogin={scenicLogin}
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
      backgroundDecoration={
        stage === 'login' ? <LoginCharacterRain /> : undefined
      }
      floatingAccessory={
        stage === 'login' ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Điền khảo sát đăng ký beta"
            onPress={() => Linking.openURL(BETA_SIGNUP_URL)}
            style={[styles.betaMascot, compactInvite && !scenicLogin && styles.betaMascotCompact]}
          >
            <View style={[styles.betaSpeech, compactInvite && !scenicLogin && styles.betaSpeechCompact]}>
              <Text style={styles.betaSpeechTitle}>Chưa đăng ký beta?</Text>
              <Text style={styles.betaSpeechCopy}>
                Điền khảo sát để nhận lời mời từ Momo trong 24 giờ nhé!
              </Text>
              <Text style={styles.signupLink}>Điền khảo sát đăng ký beta →</Text>
              <View style={compactInvite && !scenicLogin ? styles.betaSpeechTailCompact : styles.betaSpeechTail} />
            </View>
            <NihongoMascot pose="wave" size={scenicLogin ? 76 : compactInvite ? 72 : 112} decorative />
          </Pressable>
        ) : undefined
      }
      footer={
        stage === 'login' ? (
          <View testID="signup-footer" style={styles.signupFooter}>
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
          </View>
        ) : undefined
      }
    >
      {(stage === 'register' || stage === 'verify') && !socialLinking ? (
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
          labelIcon={scenicLogin ? 'mail' : undefined}
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
          labelIcon={scenicLogin ? 'lock' : undefined}
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
          <AuthNotice message="Mật khẩu cần ít nhất 8 ký tự (tối đa 128 ký tự)." />
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
        <View nativeID={scenicLogin ? 'scenic-login-forgot' : undefined} style={styles.forgotAction}>
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
          {providers.length > 0 || showUnavailableGoogle ? (
            <View nativeID={scenicLogin ? 'scenic-login-divider' : undefined} style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.divider}>Hoặc tiếp tục bằng</Text>
              <View style={styles.dividerLine} />
            </View>
          ) : null}
          {showUnavailableGoogle ? (
            <AuthButton
              label="Google"
              icon={<GoogleIcon size={22} />}
              secondary
              disabled
              onPress={() => {}}
            />
          ) : null}
          {providers.map(provider => (
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
  signupFooter: { alignItems: 'center' },
  betaMascot: { alignItems: 'flex-end' },
  betaMascotCompact: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  betaSpeech: {
    width: 232,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
    marginBottom: -spacing.sm,
  },
  betaSpeechCompact: {
    flex: 1,
    width: 'auto',
    maxWidth: 260,
    padding: spacing.md,
    marginBottom: 0,
  },
  betaSpeechTail: {
    position: 'absolute',
    right: 32,
    bottom: -6,
    width: 12,
    height: 12,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
  },
  betaSpeechTailCompact: {
    position: 'absolute',
    right: -6,
    top: '45%',
    width: 12,
    height: 12,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
  },
  betaSpeechTitle: { ...typography.label, color: colors.dark },
  betaSpeechCopy: { ...typography.caption, color: colors.body },
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

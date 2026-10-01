import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';
import { EyeIcon, EyeOffIcon } from './icons';
import { AuthIcon, AuthIconName } from './AuthIcon';
import { BrandLogo } from './BrandLogo';

export function AuthCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  icon = 'lock',
  eyebrow,
  card = true,
  headerAccessory,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon?: AuthIconName;
  eyebrow?: string;
  card?: boolean;
  headerAccessory?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        <Svg
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          viewBox="0 0 400 900"
        >
          <Defs>
            <RadialGradient id="rose">
              <Stop offset="0" stopColor="#F9CCD6" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#F9CCD6" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="peach">
              <Stop offset="0" stopColor="#FFDDB7" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#FFDDB7" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx="30" cy="410" rx="300" ry="460" fill="url(#rose)" />
          <Ellipse cx="390" cy="170" rx="210" ry="280" fill="url(#peach)" />
        </Svg>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          Platform.OS === 'android'
            ? {
                paddingTop: insets.top + spacing.lg,
                paddingBottom: insets.bottom + spacing.xxl,
              }
            : null,
        ]}
      >
        <View style={styles.topBar}>
          <BrandLogo />
          <View style={styles.languageBadge}>
            <Text style={styles.languageText}>日本語</Text>
          </View>
        </View>
        <View style={styles.header}>
          {eyebrow ? (
            <View style={styles.eyebrowRow}>
              <View style={styles.emblem}>
                <AuthIcon name={icon} size={26} />
              </View>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
            </View>
          ) : null}
          <View style={styles.headerMain}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            {headerAccessory ?? null}
          </View>
        </View>
        {card ? (
          <AuthCard>{children}</AuthCard>
        ) : (
          <View style={styles.sections}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthField({
  label,
  password = false,
  icon,
  code = false,
  error,
  onFocus,
  onBlur,
  style,
  ...props
}: TextInputProps & {
  label: string;
  password?: boolean;
  icon?: AuthIconName;
  code?: boolean;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
          props.editable === false ? styles.inputDisabled : null,
        ]}
      >
        {icon && !code ? (
          <View style={styles.inputIcon}>
            <AuthIcon
              name={icon}
              color={focused ? colors.primaryText : colors.muted}
            />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primaryText}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
          secureTextEntry={password && !visible}
          style={[styles.input, code ? styles.codeInput : null, style]}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            disabled={props.editable === false}
            onPress={() => setVisible(value => !value)}
            style={styles.showButton}
          >
            {visible ? (
              <EyeOffIcon size={20} color={colors.body} />
            ) : (
              <EyeIcon size={20} color={colors.body} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <AuthNotice message={error} error /> : null}
    </View>
  );
}

export function AuthButton({
  label,
  onPress,
  busy = false,
  secondary = false,
  disabled = false,
  variant,
  icon,
  trailingIcon,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'text';
  icon?: React.ReactNode;
  trailingIcon?: AuthIconName;
}) {
  const kind = variant ?? (secondary ? 'outline' : 'primary');
  const isDisabled = disabled || busy;
  const textColor = disabled
    ? colors.disabledText
    : kind === 'primary'
    ? colors.onPrimary
    : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary'
          ? styles.primary
          : kind === 'outline'
          ? styles.secondary
          : styles.textButton,
        disabled ? styles.disabled : null,
        pressed
          ? kind === 'primary'
            ? styles.primaryPressed
            : styles.secondaryPressed
          : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.buttonText,
              { color: textColor },
              kind === 'text' ? styles.textButtonLabel : null,
            ]}
          >
            {label}
          </Text>
          {trailingIcon ? (
            <AuthIcon name={trailingIcon} size={19} color={textColor} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

export function AuthNotice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <View style={[styles.noticeBox, error ? styles.errorBox : null]}>
      <Text
        accessibilityRole={error ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        style={[styles.notice, error ? styles.error : null]}
      >
        {message}
      </Text>
    </View>
  ) : null;
}

export function AuthSteps({ current }: { current: 1 | 2 }) {
  return (
    <View
      style={styles.steps}
      accessibilityLabel={`Bước ${current} trên 2: ${
        current === 1 ? 'Thông tin' : 'Xác thực email'
      }`}
    >
      <View style={styles.step}>
        <View style={styles.stepActive}>
          {current === 2 ? (
            <AuthIcon name="check" size={13} color={colors.onPrimary} />
          ) : (
            <Text style={styles.stepNumber}>1</Text>
          )}
        </View>
        <Text style={styles.stepLabel}>Thông tin</Text>
      </View>
      <View style={styles.stepLine} />
      <View style={styles.step}>
        <View style={current === 2 ? styles.stepActive : styles.stepInactive}>
          <Text style={styles.stepNumber}>2</Text>
        </View>
        <Text style={styles.stepLabel}>Xác thực email</Text>
      </View>
    </View>
  );
}

export function AuthContact({
  label,
  value,
  verified,
  icon,
}: {
  label: string;
  value: string;
  verified: boolean;
  icon: AuthIconName;
}) {
  return (
    <View style={styles.contact}>
      <View style={styles.contactIcon}>
        <AuthIcon name={icon} size={21} />
      </View>
      <View style={styles.contactDetails}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text selectable style={styles.contactValue}>
          {value}
        </Text>
        <View
          style={[
            styles.statusBadge,
            verified ? styles.verifiedBadge : styles.pendingBadge,
          ]}
        >
          {verified ? (
            <AuthIcon name="check" size={12} color={colors.success} />
          ) : (
            <View style={styles.pendingDot} />
          )}
          <Text
            style={[
              styles.statusText,
              { color: verified ? colors.success : colors.badgeText },
            ]}
          >
            {verified ? 'Đã xác thực' : 'Chưa xác thực'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.section,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.section,
  },
  languageBadge: {
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  languageText: { ...typography.caption, color: colors.body },
  header: { gap: spacing.sm, marginBottom: spacing.xxl },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  emblem: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { ...typography.label, color: colors.primaryText, flexShrink: 1 },
  title: { ...typography.title, color: colors.dark },
  subtitle: { ...typography.body, color: colors.body },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  sections: { gap: spacing.xl },
  footer: { marginTop: spacing.xl },
  field: { gap: spacing.sm },
  label: { ...typography.label, color: colors.body },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.inputHeight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceTint,
  },
  inputFocused: { borderColor: colors.focus, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger },
  inputDisabled: { backgroundColor: colors.background },
  inputIcon: { paddingLeft: spacing.lg },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.inputHeight - 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.input,
    color: colors.inputText,
  },
  codeInput: {
    ...typography.code,
    letterSpacing: 7,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  showButton: {
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    minHeight: layout.buttonHeight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  textButton: {
    backgroundColor: 'transparent',
    minHeight: layout.touchTarget,
    paddingVertical: spacing.sm,
  },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  secondaryPressed: { backgroundColor: colors.badgeBg },
  disabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  buttonText: { ...typography.button, flexShrink: 1, textAlign: 'center' },
  textButtonLabel: { ...typography.link },
  noticeBox: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.small,
    borderCurve: 'continuous',
    padding: spacing.md,
  },
  notice: { ...typography.body, color: colors.body },
  errorBox: { backgroundColor: colors.dangerBg },
  error: { color: colors.danger },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepActive: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInactive: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { ...typography.caption, color: colors.dark },
  stepLabel: { ...typography.caption, color: colors.body },
  stepLine: {
    height: 1,
    minWidth: 12,
    flex: 1,
    backgroundColor: colors.divider,
  },
  contact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  contactIcon: {
    width: 44,
    height: 44,
    backgroundColor: colors.badgeBg,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactDetails: { flex: 1, minWidth: 0, gap: spacing.xs },
  contactLabel: { ...typography.caption, color: colors.muted },
  contactValue: { ...typography.label, color: colors.dark },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    marginTop: spacing.xs,
  },
  verifiedBadge: { backgroundColor: colors.successBg },
  pendingBadge: { backgroundColor: colors.badgeBg },
  statusText: { ...typography.caption },
  pendingDot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.badgeText,
  },
});

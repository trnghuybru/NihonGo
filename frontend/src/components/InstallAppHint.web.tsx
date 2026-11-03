import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';
import { XIcon } from './icons';

const DISMISSED_KEY = 'nihongo:pwa:install-hint:v1';

function isStandalone() {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function isDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function InstallAppHint() {
  const [installed, setInstalled] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(isDismissed);
  // iPadOS can identify itself as a Mac when requesting the desktop site.
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const update = () => setInstalled(isStandalone());
    const onInstalled = () => setInstalled(true);
    display.addEventListener('change', update);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      display.removeEventListener('change', update);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!ios || installed || dismissed) return null;
  return (
    <View style={styles.card} testID="pwa-install-hint">
      <View style={styles.heading}>
        <Image
          source={require('../assets/mascot/nihongo-app-icon.png')}
          style={styles.icon}
          accessible={false}
        />
        <Text style={styles.title}>NihonGO trên màn hình chính</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ẩn hướng dẫn thêm vào màn hình chính"
          onPress={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISSED_KEY, 'dismissed');
            } catch {
              /* Storage may be unavailable in private browsing. */
            }
          }}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <XIcon size={16} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.body}>
        Chọn{' '}
        <Text style={styles.emphasis}>
          Chia sẻ → Thêm vào màn hình chính → Thêm
        </Text>{' '}
        để mở NihonGO như một ứng dụng.
      </Text>
      <Text style={styles.caption}>
        Nếu có tuỳ chọn “Mở dưới dạng ứng dụng web”, hãy bật lên nhé.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.small,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: 10 },
  title: { ...typography.label, color: colors.dark, flex: 1 },
  body: { ...typography.body, color: colors.body },
  emphasis: { ...typography.caption, color: colors.primaryText },
  caption: { ...typography.caption, color: colors.muted },
  close: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  pressed: { backgroundColor: colors.surfaceTint },
});

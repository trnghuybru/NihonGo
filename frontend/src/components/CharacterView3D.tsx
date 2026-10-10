import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { apiBaseUrl } from '../config/api';
import { AuthButton } from './AuthForm';
import { colors, radius, spacing, typography } from '../theme/theme';

export function CharacterView3D({
  isSpeaking,
  portrait = false,
}: {
  isSpeaking: boolean;
  portrait?: boolean;
}) {
  const webview = useRef<WebView<unknown>>(null);
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    webview.current?.postMessage(
      JSON.stringify({ type: 'SET_SPEAKING', isSpeaking }),
    );
  }, [isSpeaking, loaded]);
  useEffect(() => {
    if (loaded)
      webview.current?.postMessage(
        JSON.stringify({ type: 'SET_FRAMING', portrait }),
      );
  }, [loaded, portrait]);
  useEffect(() => {
    if (loaded || error) return;
    const timer = setTimeout(
      () => setError('Tải nhân vật quá lâu. Hãy kiểm tra kết nối máy chủ.'),
      30000,
    );
    return () => clearTimeout(timer);
  }, [generation, loaded, error]);
  const retry = () => {
    setLoaded(false);
    setError('');
    setGeneration(value => value + 1);
  };
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'LOADED') {
        setLoaded(true);
        setError('');
      }
      if (data.type === 'ERROR')
        setError('Không thể dựng nhân vật 3D. Hãy thử lại.');
    } catch {
      /* Ignore unrelated WebView messages. */
    }
  };
  const origin = apiBaseUrl();
  return (
    <View style={[styles.stage, portrait ? styles.portraitStage : null]}>
      <WebView<unknown>
        ref={webview}
        key={generation}
        source={{ uri: `${origin}/api/character-view` }}
        originWhitelist={[origin]}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        style={styles.canvas}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={request =>
          request.url.startsWith(`${origin}/api/character-view`) ||
          request.url === 'about:blank'
        }
        onContentProcessDidTerminate={() =>
          setError('Nhân vật 3D đã dừng. Hãy tải lại.')
        }
        onError={() => setError('Không tải được nhân vật. Kiểm tra máy chủ.')}
      />
      {!loaded || error ? (
        <View style={styles.overlay}>
          {error ? (
            <>
              <Text style={styles.hint}>{error}</Text>
              <AuthButton
                label="Tải lại nhân vật"
                variant="text"
                onPress={retry}
              />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primaryText} />
              <Text style={styles.hint}>Đang tải Aoi…</Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  portraitStage: { minHeight: 0, borderRadius: 0 },
  stage: {
    flex: 1,
    minHeight: 160,
    overflow: 'hidden',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  canvas: { flex: 1, backgroundColor: colors.surface },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  hint: { ...typography.body, color: colors.muted, textAlign: 'center' },
});

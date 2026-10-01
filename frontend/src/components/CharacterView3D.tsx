import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { DEFAULT_HOST_IP } from '../services/chatStreamService';
import { colors } from '../theme/theme';

interface CharacterView3DProps {
  isSpeaking: boolean;
  height?: number | string;
  characterName?: string;
  statusText?: string;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  containerStyle?: ViewStyle;
  showOverlayHeader?: boolean;
}

export const CharacterView3D: React.FC<CharacterView3DProps> = ({
  isSpeaking,
  height,
  characterName = 'Aoi (あおい)',
  statusText: _statusText,
  onToggleCollapse,
  isCollapsed = false,
  containerStyle,
  showOverlayHeader = true,
}) => {
  const webViewRef = useRef<any>(null);
  const crashCountRef = useRef(0);
  const [loadKey, setLoadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Gọi trực tiếp endpoint WebGL nhúng từ Flask backend với cache-busting
  const webViewUrl = `http://${DEFAULT_HOST_IP}:5001/api/character-view?k=${loadKey}`;

  // Gửi trạng thái isSpeaking vào Three.js trong WebView
  useEffect(() => {
    if (webViewRef.current) {
      const message = JSON.stringify({
        type: 'SET_SPEAKING',
        isSpeaking,
      });
      webViewRef.current.postMessage(message);
    }
  }, [isSpeaking]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'LOADED') {
        setIsLoading(false);
        setLoadError(null);
        if (webViewRef.current) {
          webViewRef.current.postMessage(
            JSON.stringify({
              type: 'SET_SPEAKING',
              isSpeaking,
            }),
          );
        }
      } else if (data.type === 'PROGRESS') {
        if (typeof data.percent === 'number') {
          setDownloadProgress(data.percent);
        }
      } else if (data.type === 'CONSOLE') {
        console.log(`[WebView-3D ${data.level || 'info'}]`, data.text);
      } else if (data.type === 'ERROR') {
        setIsLoading(false);
        setLoadError(data.message || 'Lỗi dựng hình 3D');
      }
    } catch {
      // ignore
    }
  };

  const handleRetry = () => {
    crashCountRef.current = 0;
    setIsLoading(true);
    setLoadError(null);
    setDownloadProgress(0);
    setLoadKey(prev => prev + 1);
  };

  if (isCollapsed) {
    return (
      <Pressable style={styles.collapsedBar} onPress={onToggleCollapse}>
        <View style={styles.badgeIndicator}>
          <Text style={styles.avatarMiniIcon}>🌸</Text>
          <Text style={styles.characterMiniName}>{characterName}</Text>
          {isSpeaking && (
            <View style={styles.speakingMiniBadge}>
              <Text style={styles.speakingMiniText}>🗣️ Đang nói</Text>
            </View>
          )}
        </View>
        <Text style={styles.expandText}>Hiện nhân vật 3D ▾</Text>
      </Pressable>
    );
  }

  const containerSizing =
    height !== undefined
      ? { height }
      : { flex: 1, minHeight: 350, width: '100%' as const };

  return (
    <View style={[styles.cardContainer, containerSizing, containerStyle]}>
      {/* Header trạng thái nhân vật (nếu bật) */}
      {showOverlayHeader && (
        <View style={styles.topInfoBar}>
          <View style={styles.characterTag}>
            <Text style={styles.characterTagText}>🌸 {characterName}</Text>
            {isSpeaking ? (
              <View style={styles.speakingPill}>
                <Text style={styles.speakingPillText}>🗣️ Đang nói...</Text>
              </View>
            ) : (
              <View style={styles.idlePill}>
                <Text style={styles.idlePillText}>👂 Lắng nghe</Text>
              </View>
            )}
          </View>

          {onToggleCollapse && (
            <Pressable style={styles.collapseButton} onPress={onToggleCollapse}>
              <Text style={styles.collapseButtonText}>Thu gọn ▴</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* 3D Canvas WebView: Load trực tiếp từ HTTP endpoint */}
      <View style={styles.webviewWrapper}>
        <WebView
          key={loadKey}
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ uri: webViewUrl }}
          style={styles.webview}
          opaque={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          scrollEnabled={false}
          bounces={false}
          scalesPageToFit={false}
          onMessage={handleWebViewMessage}
          onContentProcessDidTerminate={() => {
            console.warn('[CharacterView3D] WebContent process terminated!');
            crashCountRef.current += 1;
            if (crashCountRef.current <= 1) {
              setIsLoading(true);
              setLoadKey(prev => prev + 1);
            } else {
              setIsLoading(false);
              setLoadError('Tiến trình đồ họa WebGL bị ngắt');
            }
          }}
          onLoadEnd={() => {
            // Timeout bảo hiểm 15s nếu GLB nạp quá lâu
            const timer = setTimeout(() => setIsLoading(false), 15000);
            return () => clearTimeout(timer);
          }}
          onError={(e: any) => {
            console.warn('Lỗi kết nối WebView:', e?.nativeEvent);
            setLoadError('Không thể kết nối máy chủ 3D');
            setIsLoading(false);
          }}
        />

        {/* Loading Spinner & Progress */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>
              Đang nạp nhân vật 3D... {downloadProgress > 0 ? `${downloadProgress}%` : ''}
            </Text>
            {downloadProgress > 0 && (
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${downloadProgress}%` }]} />
              </View>
            )}
          </View>
        )}

        {/* Error Fallback */}
        {loadError && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorEmoji}>🌸</Text>
            <Text style={styles.errorText}>Aoi - AI Sensei</Text>
            <Text style={styles.errorSubtext}>{loadError}</Text>
            <Pressable style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Thử lại 🔄</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    backgroundColor: '#F7F4FA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFE7F6',
  },
  badgeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatarMiniIcon: {
    fontSize: 16,
  },
  characterMiniName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.dark,
  },
  speakingMiniBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  speakingMiniText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  expandText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  topInfoBar: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  characterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  characterTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.dark,
  },
  speakingPill: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  speakingPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  idlePill: {
    backgroundColor: '#EAE5F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  idlePillText: {
    color: colors.body,
    fontSize: 10,
    fontWeight: '600',
  },
  collapseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  collapseButtonText: {
    fontSize: 11,
    color: colors.muted,
  },
  webviewWrapper: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FAF8FC',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(250, 248, 252, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  progressBarBg: {
    width: 140,
    height: 4,
    backgroundColor: '#E5DFEE',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  errorOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#F7F4FA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  errorEmoji: {
    fontSize: 36,
    marginBottom: 2,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
  },
  errorSubtext: {
    fontSize: 12,
    color: colors.muted,
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

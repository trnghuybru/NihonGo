import { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { VideoExample } from '../services/videoExamplesService';
import { colors, radius, shadowMd, spacing, typography } from '../theme/theme';
import { AuthButton, AuthNotice } from './AuthForm';
import { HighlightedCaption, videoTimestamp } from './VideoExampleCard';

// Match the identifiers registered by the native projects. YouTube requires an app Referer.
export const YOUTUBE_APP_ORIGIN =
  Platform.OS === 'android'
    ? 'https://com.frontend'
    : 'https://com.trnghuybru.datnfrontend';

export function videoPlayerHtml(example: VideoExample) {
  if (
    !/^[A-Za-z0-9_-]{11}$/.test(example.video.youtube_id) ||
    !Number.isFinite(example.start_seconds) ||
    !Number.isFinite(example.end_seconds) ||
    example.start_seconds < 0 ||
    example.end_seconds <= example.start_seconds
  ) {
    throw new Error('Dữ liệu video không hợp lệ.');
  }
  const clip = JSON.stringify({
    videoId: example.video.youtube_id,
    startSeconds: example.start_seconds,
    endSeconds: example.end_seconds,
  });
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>
</head><body><div id="player"></div><script>
var clip=${clip};
var endTimer=null;
var sentencePausePending=true;
function send(type,code){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:type,code:code}));}}
function clearEndTimer(){if(endTimer!==null){clearInterval(endTimer);endTimer=null;}}
function checkSentenceEnd(target){
 if(sentencePausePending && target.getCurrentTime()>=clip.endSeconds){
  sentencePausePending=false;
  clearEndTimer();target.pauseVideo();send('clip-ended');
 }
}
function onPlaybackState(e){
 clearEndTimer();
 if(sentencePausePending && e.data===YT.PlayerState.PLAYING){
  endTimer=setInterval(function(){checkSentenceEnd(e.target);},100);
  checkSentenceEnd(e.target);
 }
}
window.addEventListener('pagehide',clearEndTimer);
function onYouTubeIframeAPIReady(){
 window.player=new YT.Player('player',{width:'100%',height:'100%',
  videoId:${JSON.stringify(example.video.youtube_id)},
  playerVars:{playsinline:1,controls:1,origin:${JSON.stringify(
    YOUTUBE_APP_ORIGIN,
  )}},
  events:{onReady:function(e){e.target.cueVideoById({videoId:clip.videoId,startSeconds:clip.startSeconds});e.target.playVideo();send('ready');},
   onStateChange:onPlaybackState,
   onError:function(e){clearEndTimer();send('error',e.data);},onAutoplayBlocked:function(){send('autoplay-blocked');}}
 });
}
</script><script src="https://www.youtube.com/iframe_api" onerror="send('error','network')"></script></body></html>`;
}

export function VideoExamplePlayer({
  example,
  query,
  position,
  count,
  onPrevious,
  onNext,
}: {
  example: VideoExample;
  query: string;
  position: number;
  count: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const source = useMemo(
    () => ({
      html: videoPlayerHtml(example),
      baseUrl: `${YOUTUBE_APP_ORIGIN}/`,
    }),
    [example],
  );
  useEffect(() => {
    const listener = AppState.addEventListener('change', state =>
      setActive(state === 'active'),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    setLoaded(false);
    setError('');
    setAutoplayBlocked(false);
  }, [example.id, generation, active]);
  useEffect(() => {
    if (!active || loaded || error) return;
    const timer = setTimeout(
      () =>
        setError('Video tải quá lâu. Bạn có thể thử lại hoặc mở trên YouTube.'),
      25000,
    );
    return () => clearTimeout(timer);
  }, [active, loaded, error, example.id, generation]);
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'ready') {
        setLoaded(true);
        setError('');
      }
      if (message.type === 'error')
        setError(
          'Không phát được video trong app. Bạn có thể mở trên YouTube.',
        );
      if (message.type === 'autoplay-blocked') setAutoplayBlocked(true);
    } catch {
      /* Ignore unrelated player messages. */
    }
  };
  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Nghe trong ngữ cảnh
        </Text>
        <Text style={styles.caption}>
          Đoạn {position}/{count}
        </Text>
      </View>
      <View style={styles.player}>
        {active ? (
          <WebView
            key={`${example.id}-${generation}`}
            testID="youtube-example-player"
            source={source}
            originWhitelist={[
              YOUTUBE_APP_ORIGIN,
              'https://www.youtube.com',
              'https://www.youtube-nocookie.com',
            ]}
            javaScriptEnabled
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            scrollEnabled={false}
            onMessage={onMessage}
            onError={() =>
              setError('Không tải được video. Hãy kiểm tra kết nối mạng.')
            }
            onContentProcessDidTerminate={() =>
              setError('Video đã dừng. Hãy thử lại.')
            }
            onShouldStartLoadWithRequest={request => {
              if (request.isTopFrame === false) return true;
              return (
                request.url === 'about:blank' ||
                request.url.startsWith(`${YOUTUBE_APP_ORIGIN}/`) ||
                request.url.startsWith('https://www.youtube.com/embed/') ||
                request.url.startsWith(
                  'https://www.youtube-nocookie.com/embed/',
                )
              );
            }}
            style={styles.webview}
          />
        ) : null}
      </View>
      {!loaded && !error ? (
        <Text style={styles.body}>Đang tải video…</Text>
      ) : null}
      {autoplayBlocked ? (
        <Text style={styles.body}>Nhấn nút phát trong video để nghe.</Text>
      ) : null}
      <AuthNotice error message={error} />
      <HighlightedCaption text={example.search_text} query={query} />
      <Text style={styles.body} numberOfLines={2}>
        {example.video.title}
      </Text>
      <Text style={styles.caption}>
        {example.video.channel} · {videoTimestamp(example.start_seconds)}
      </Text>
      <View style={styles.actions}>
        <AuthButton
          label="Ví dụ trước"
          variant="text"
          disabled={!onPrevious}
          onPress={onPrevious || (() => undefined)}
        />
        <AuthButton
          label={error ? 'Thử phát lại' : 'Nghe lại'}
          variant="outline"
          onPress={() => setGeneration(value => value + 1)}
        />
        <AuthButton
          label="Ví dụ tiếp"
          variant="text"
          disabled={!onNext}
          onPress={onNext || (() => undefined)}
        />
      </View>
      <AuthButton
        label="Mở trên YouTube"
        variant="text"
        onPress={() => {
          setActive(false);
          Linking.openURL(example.watch_url).catch(() => {
            setError('Không mở được YouTube. Hãy thử lại.');
            setActive(true);
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.divider,
    boxShadow: shadowMd,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...typography.heading, color: colors.dark, flex: 1 },
  player: {
    height: 230,
    minWidth: 200,
    borderRadius: radius.small,
    overflow: 'hidden',
    backgroundColor: colors.dark,
  },
  webview: { flex: 1, backgroundColor: colors.dark },
  body: { ...typography.body, color: colors.body },
  caption: { ...typography.caption, color: colors.muted },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});

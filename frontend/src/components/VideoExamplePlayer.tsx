import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { VideoExample } from '../services/videoExamplesService';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';
import { AuthNotice } from './AuthForm';
import { HighlightedCaption, videoTimestamp } from './VideoExampleCard';
import { ChevronLeftIcon, ChevronRightIcon, ReplayIcon } from './icons';

// Match the identifiers registered by the native projects. YouTube requires an app Referer.
export const YOUTUBE_APP_ORIGIN =
  Platform.OS === 'android'
    ? 'https://com.frontend'
    : 'https://com.trnghuybru.datnfrontend';

export function videoPlayerHtml(
  example: VideoExample,
  playbackRate = 1,
  loop = false,
  timeline?: VideoExample[],
  continuous = false,
) {
  if (
    !/^[A-Za-z0-9_-]{11}$/.test(example.video.youtube_id) ||
    !Number.isFinite(example.start_seconds) ||
    !Number.isFinite(example.end_seconds) ||
    example.start_seconds < 0 ||
    example.end_seconds <= example.start_seconds ||
    ![0.5, 0.75, 1, 1.25].includes(playbackRate)
  ) {
    throw new Error('Dữ liệu video không hợp lệ.');
  }
  const clip = JSON.stringify({
    id: example.id,
    continuous,
    videoId: example.video.youtube_id,
    startSeconds: example.start_seconds,
    endSeconds: example.end_seconds,
    playbackRate,
    loop,
  });
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>
</head><body><div id="player"></div><script>
var clip=${clip};
var timeline=${JSON.stringify(
    timeline?.map(segment => ({
      start: segment.start_seconds,
      end: segment.end_seconds,
    })) ?? null,
  )};
var lastCaption=-2;
var endTimer=null;
var sentencePausePending=true;
var lastLoopSeek=0;
function send(type,code){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:type,code:code}));}}
function clearEndTimer(){if(endTimer!==null){clearInterval(endTimer);endTimer=null;}}
function updateCaption(target){
 if(!timeline)return;
 var time=target.getCurrentTime(), low=0, high=timeline.length-1, index=-1;
 while(low<=high){var mid=Math.floor((low+high)/2);if(timeline[mid].start<=time){index=mid;low=mid+1;}else{high=mid-1;}}
 if(index>=0 && time>=timeline[index].end)index=-1;
 if(index!==lastCaption){lastCaption=index;send('caption',{index:index,clipId:clip.id});}
}
window.updateShadowing=function(next){
 if(!window.player)return;
 var seek=clip.id!==next.id || next.replay;
 var rearm=seek || clip.continuous!==next.continuous || clip.loop!==next.loop;
 clip.id=next.id;clip.startSeconds=next.start;clip.endSeconds=next.end;
 clip.continuous=next.continuous;clip.loop=next.loop;
 if(rearm)sentencePausePending=true;
 if(window.player.getAvailablePlaybackRates().indexOf(next.rate)>=0){window.player.setPlaybackRate(next.rate);send('rate-supported');}else{send('rate-unsupported');}
 lastCaption=-2;
 if(seek){window.player.seekTo(next.start,true);window.player.playVideo();}
 updateCaption(window.player);
};
function checkSentenceEnd(target){
 updateCaption(target);
 if(!clip.continuous && sentencePausePending && target.getCurrentTime()>=clip.endSeconds){
  if(clip.loop){
   if(Date.now()-lastLoopSeek>500){lastLoopSeek=Date.now();target.seekTo(clip.startSeconds,true);target.playVideo();}
   return;
  }
  sentencePausePending=false;
  if(!timeline)clearEndTimer();target.pauseVideo();send('clip-ended');
 }
}
function onPlaybackState(e){
 if(e.data===YT.PlayerState.PLAYING)send('playing');
 clearEndTimer();
 updateCaption(e.target);
 if(timeline || (sentencePausePending && e.data===YT.PlayerState.PLAYING)){
  endTimer=setInterval(function(){if(!timeline || e.target.getPlayerState()===YT.PlayerState.PLAYING){checkSentenceEnd(e.target);}else{updateCaption(e.target);}},100);
  if(e.data===YT.PlayerState.PLAYING)checkSentenceEnd(e.target);
 }
}
window.addEventListener('pagehide',clearEndTimer);
function onYouTubeIframeAPIReady(){
 window.player=new YT.Player('player',{width:'100%',height:'100%',
  videoId:${JSON.stringify(example.video.youtube_id)},
  playerVars:{playsinline:1,controls:1,origin:${JSON.stringify(
    YOUTUBE_APP_ORIGIN,
  )}},
  events:{onReady:function(e){send('ready');e.target.cueVideoById({videoId:clip.videoId,startSeconds:clip.startSeconds});
    if(e.target.getAvailablePlaybackRates().indexOf(clip.playbackRate)>=0){e.target.setPlaybackRate(clip.playbackRate);}else{send('rate-unsupported');}
    e.target.playVideo();if(timeline){onPlaybackState({target:e.target,data:YT.PlayerState.PLAYING});}},
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
  hideCaption = false,
  playbackRate = 1,
  loop = false,
  timeline,
  continuous = false,
  onCaptionChange,
  onReplay,
  seekRequest = 0,
  videoOnly = false,
  pausedForLookup = false,
}: {
  example: VideoExample;
  query: string;
  position: number;
  count: number;
  onPrevious?: () => void;
  onNext?: () => void;
  hideCaption?: boolean;
  playbackRate?: number;
  loop?: boolean;
  timeline?: VideoExample[];
  continuous?: boolean;
  onCaptionChange?: (index: number) => void;
  onReplay?: () => void;
  seekRequest?: number;
  videoOnly?: boolean;
  pausedForLookup?: boolean;
}) {
  const lastSeekRequest = useRef(0);
  const playerRef = useRef<WebView<unknown>>(null);
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  // Automatic caption changes never replace the video source.
  const initialExample = timeline ? timeline[0] : example;
  const initialRate = timeline ? 1 : playbackRate;
  const initialLoop = timeline ? false : loop;
  const source = useMemo(
    () => ({
      html: videoPlayerHtml(
        initialExample,
        initialRate,
        initialLoop,
        timeline,
        Boolean(timeline),
      ),
      baseUrl: `${YOUTUBE_APP_ORIGIN}/`,
    }),
    [initialExample, initialRate, initialLoop, timeline],
  );
  const sessionId = timeline
    ? timeline[0].video.youtube_id
    : `${example.id}-${playbackRate}-${loop}`;
  useEffect(() => {
    if (!timeline || !loaded || !active) return;
    const replay = lastSeekRequest.current !== seekRequest;
    lastSeekRequest.current = seekRequest;
    playerRef.current?.injectJavaScript(
      `window.updateShadowing && window.updateShadowing(${JSON.stringify({
        id: example.id,
        start: example.start_seconds,
        end: example.end_seconds,
        rate: playbackRate,
        loop,
        continuous,
        replay,
      })});true;`,
    );
  }, [
    timeline,
    loaded,
    active,
    example,
    playbackRate,
    loop,
    continuous,
    seekRequest,
  ]);
  useEffect(() => {
    if (pausedForLookup && loaded && active)
      playerRef.current?.injectJavaScript(
        'window.player && window.player.pauseVideo();true;',
      );
  }, [pausedForLookup, loaded, active, generation]);
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
  }, [sessionId, generation, active]);
  useEffect(() => {
    if (!active || loaded || error) return;
    const timer = setTimeout(
      () => setError('Video tải quá lâu. Nhấn nút replay để thử lại.'),
      25000,
    );
    return () => clearTimeout(timer);
  }, [active, loaded, error, sessionId, generation]);
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'ready') {
        setLoaded(true);
        setError('');
      }
      if (
        message.type === 'caption' &&
        timeline &&
        message.code?.clipId === example.id &&
        Number.isInteger(message.code.index) &&
        message.code.index >= -1 &&
        message.code.index < timeline.length
      ) {
        onCaptionChange?.(message.code.index);
      }
      if (message.type === 'error')
        setError('Không phát được video. Nhấn nút replay để thử lại.');
      if (message.type === 'playing') {
        setAutoplayBlocked(false);
        if (pausedForLookup)
          playerRef.current?.injectJavaScript(
            'window.player && window.player.pauseVideo();true;',
          );
      }
      if (message.type === 'autoplay-blocked') setAutoplayBlocked(true);
      if (message.type === 'rate-supported')
        setError(previous =>
          previous === 'Video này không hỗ trợ tốc độ đã chọn. Hãy chọn 1×.'
            ? ''
            : previous,
        );
      if (message.type === 'rate-unsupported')
        setError('Video này không hỗ trợ tốc độ đã chọn. Hãy chọn 1×.');
    } catch {
      /* Ignore unrelated player messages. */
    }
  };
  return (
    <View
      style={[
        styles.content,
        timeline && styles.timelineContent,
        videoOnly && styles.videoOnly,
      ]}
    >
      {!timeline ? (
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Nghe trong ngữ cảnh
          </Text>
          <Text style={styles.caption}>
            Đoạn {position}/{count}
          </Text>
        </View>
      ) : null}
      <View style={[styles.player, timeline && styles.timelinePlayer]}>
        {active ? (
          <WebView
            ref={playerRef}
            key={`${sessionId}-${generation}`}
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
      {timeline ? null : hideCaption ? (
        <Text style={styles.caption}>Phụ đề đang ẩn.</Text>
      ) : (
        <HighlightedCaption text={example.search_text} query={query} />
      )}
      {!timeline ? (
        <>
          <Text style={styles.body} numberOfLines={2}>
            {example.video.title}
          </Text>
          <Text style={styles.caption}>
            {example.video.channel} · {videoTimestamp(example.start_seconds)}
          </Text>
        </>
      ) : null}
      {videoOnly && error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thử phát lại"
          onPress={() => setGeneration(value => value + 1)}
          style={styles.retryLink}
        >
          <Text style={styles.retryLabel}>Thử phát lại</Text>
        </Pressable>
      ) : null}
      {!videoOnly ? (
        <View style={styles.actions}>
          {!videoOnly ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ví dụ trước"
              accessibilityState={{ disabled: !onPrevious }}
              disabled={!onPrevious}
              onPress={onPrevious}
              style={({ pressed }) => [
                styles.iconButton,
                styles.navigationButton,
                pressed && styles.pressed,
              ]}
            >
              <ChevronLeftIcon
                color={onPrevious ? colors.body : colors.disabledText}
              />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={error ? 'Thử phát lại' : 'Nghe lại'}
            hitSlop={videoOnly ? 6 : 0}
            onPress={() => {
              if (onReplay && loaded && !error) {
                onReplay();
              } else if (timeline && loaded && !error) {
                playerRef.current?.injectJavaScript(
                  `window.updateShadowing && window.updateShadowing(${JSON.stringify(
                    {
                      id: example.id,
                      start: example.start_seconds,
                      end: example.end_seconds,
                      rate: playbackRate,
                      loop,
                      continuous,
                      replay: true,
                    },
                  )});true;`,
                );
              } else setGeneration(value => value + 1);
            }}
            style={({ pressed }) => [
              styles.iconButton,
              styles.replayButton,
              videoOnly && styles.compactIconButton,
              pressed && styles.pressed,
            ]}
          >
            <ReplayIcon size={videoOnly ? 18 : 22} color={colors.primaryText} />
          </Pressable>
          {!videoOnly ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ví dụ tiếp"
              accessibilityState={{ disabled: !onNext }}
              disabled={!onNext}
              onPress={onNext}
              style={({ pressed }) => [
                styles.iconButton,
                styles.navigationButton,
                pressed && styles.pressed,
              ]}
            >
              <ChevronRightIcon
                color={onNext ? colors.body : colors.disabledText}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
  videoOnly: {
    padding: 0,
    gap: 0,
    borderWidth: 0,
    boxShadow: 'none',
    backgroundColor: colors.background,
  },
  retryLink: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  retryLabel: { ...typography.caption, color: colors.primaryText },
  timelineContent: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.small,
  },
  timelinePlayer: { height: undefined, aspectRatio: 16 / 9 },
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  iconButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIconButton: { width: 36, height: 36 },
  navigationButton: { backgroundColor: colors.surfaceTint },
  replayButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  pressed: { backgroundColor: colors.surfaceTint },
});

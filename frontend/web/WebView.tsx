import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet } from 'react-native';
type Props = {
  source: { html?: string; uri?: string; baseUrl?: string };
  style?: unknown;
  testID?: string;
  accessibilityLabel?: string;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onError?: () => void;
};
const frameStyle = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  border: 0,
} as const;
export const WebView = forwardRef(function BrowserWebView(
  { source, style, testID, accessibilityLabel, onMessage, onError }: Props,
  ref,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onMessage, onError });
  callbacks.current = { onMessage, onError };
  const [fetched, setFetched] = useState('');
  const channel = useMemo(
    () =>
      Array.from(crypto.getRandomValues(new Uint8Array(16)), value =>
        value.toString(16).padStart(2, '0'),
      ).join(''),
    [],
  );
  const pending = useRef<string[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    if (!source.uri) return;
    const controller = new AbortController();
    setFetched('');
    fetch(source.uri, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Iframe unavailable');
        return response.text();
      })
      .then(setFetched)
      .catch(() => {
        if (!controller.signal.aborted) callbacks.current.onError?.();
      });
    return () => controller.abort();
  }, [source.uri]);
  const html = useMemo(() => {
    const content = source.html || fetched;
    if (!content) return undefined;
    const base = source.uri || source.baseUrl || window.location.href;
    const bridge = `<base href="${base
      .replaceAll('&', '&amp;')
      .replaceAll(
        '"',
        '&quot;',
      )}"><script>window.ReactNativeWebView={postMessage:function(data){parent.postMessage({channel:${JSON.stringify(
      channel,
    )},data:data},${JSON.stringify(window.location.origin)})}};</script>`;
    return content.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  }, [source.html, source.uri, source.baseUrl, fetched, channel]);
  useEffect(() => {
    loaded.current = false;
    pending.current = [];
  }, [html]);
  const inject = (script: string) => {
    if (!loaded.current) {
      pending.current.push(script);
      return;
    }
    const target = frame.current?.contentWindow as
      | (Window & { eval: (script: string) => unknown })
      | null;
    target?.eval(script);
  };
  useImperativeHandle(ref, () => ({
    injectJavaScript: inject,
    postMessage(data: string) {
      inject(
        `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(
          data,
        )}}));`,
      );
    },
  }));
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== window.location.origin ||
        event.data?.channel !== channel ||
        typeof event.data.data !== 'string'
      )
        return;
      callbacks.current.onMessage?.({ nativeEvent: { data: event.data.data } });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [channel]);
  return (
    <iframe
      ref={frame}
      title={
        accessibilityLabel || (source.uri ? 'Nhân vật Aoi' : 'Video luyện nghe')
      }
      data-testid={testID}
      srcDoc={html}
      allow="autoplay; fullscreen"
      allowFullScreen
      style={{
        ...frameStyle,
        ...StyleSheet.flatten(style as never),
      }}
      onError={() => callbacks.current.onError?.()}
      onLoad={() => {
        loaded.current = true;
        for (const script of pending.current.splice(0)) inject(script);
      }}
    />
  );
});
export default WebView;

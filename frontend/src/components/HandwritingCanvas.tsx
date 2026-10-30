import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, radius } from '../theme/theme';

// The same canvas runs on WebView (iOS/Android) and the existing iframe web adapter.
export const handwritingCanvasHtml = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:white}canvas{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair}</style>
</head><body><canvas width="320" height="320" aria-label="Vùng viết ký tự tiếng Nhật"></canvas><script>
const canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d');
ctx.fillStyle='white';ctx.fillRect(0,0,320,320);ctx.strokeStyle='#181818';ctx.fillStyle='#181818';ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';
let pointer=null;
function point(event){const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(320,(event.clientX-rect.left)*320/rect.width)),y:Math.max(0,Math.min(320,(event.clientY-rect.top)*320/rect.height))};}
canvas.addEventListener('pointerdown',event=>{if(pointer!==null)return;event.preventDefault();pointer=event.pointerId;canvas.setPointerCapture(pointer);window.ReactNativeWebView.postMessage('stroke-start');const p=point(event);ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(p.x,p.y);});
canvas.addEventListener('pointermove',event=>{if(event.pointerId!==pointer)return;event.preventDefault();const p=point(event);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y);});
function finish(event){if(event.pointerId!==pointer)return;pointer=null;window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));}
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
</script></body></html>`;
const source = { html: handwritingCanvasHtml };
export function HandwritingCanvas({
  onChange,
  onStrokeStart,
}: {
  onChange: (image: string) => void;
  onStrokeStart?: () => void;
}) {
  return (
    <View style={styles.frame}>
      <WebView
        source={source}
        accessibilityLabel="Vùng viết tay tiếng Nhật"
        testID="handwriting-canvas"
        originWhitelist={['about:blank']}
        javaScriptEnabled
        scrollEnabled={false}
        onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
        onMessage={event => {
          const value = event.nativeEvent.data;
          if (value === 'stroke-start') {
            onStrokeStart?.();
            return;
          }
          if (
            value.startsWith('data:image/png;base64,') &&
            value.length < 700000
          )
            onChange(value);
        }}
        style={styles.canvas}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: 1,
    alignSelf: 'center',
    borderRadius: radius.small,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  canvas: { flex: 1, backgroundColor: '#FFFFFF' },
});

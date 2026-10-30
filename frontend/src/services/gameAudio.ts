import { PermissionsAndroid, Platform } from 'react-native';
import { audioClient } from './gameAudioCore';
export type { GameAudio } from './gameAudioCore';
let registered = false;
export function createGameAudio() {
  return audioClient({
    async start() {
      const native = await import('@livekit/react-native');
      if (!registered) {
        native.registerGlobals();
        registered = true;
      }
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED)
          throw new Error('Hãy cấp quyền micro để chơi mode đọc.');
      }
      await native.AudioSession.startAudioSession();
    },
    async stop() {
      const native = await import('@livekit/react-native');
      await native.AudioSession.stopAudioSession();
    },
    attach() {
      return () => {};
    },
  });
}

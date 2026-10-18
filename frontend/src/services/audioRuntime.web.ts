import * as browserAudio from '../../web/audioApi';
export function getAudioRuntime(): typeof import('react-native-audio-api') {
  return browserAudio as unknown as typeof import('react-native-audio-api');
}

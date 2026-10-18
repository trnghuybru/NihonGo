/** Load native audio only when a conversation needs it. */
export function getAudioRuntime(): typeof import('react-native-audio-api') {
  return require('react-native-audio-api');
}

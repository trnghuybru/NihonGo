import { Platform } from 'react-native';
// Experimental branch only. Set false to compare with the existing Live transport.
export const speakingTtsExperiment = Platform.OS === 'web';

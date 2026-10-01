import { Platform } from 'react-native';

// On a physical device, set this to your computer's LAN IP (same Wi-Fi).
const DEVELOPMENT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
// Set your HTTPS API origin before creating a release build. No secrets belong here.
const PRODUCTION_API_URL: string = '';

export function apiBaseUrl(): string {
  const url = __DEV__ ? DEVELOPMENT_API_URL : PRODUCTION_API_URL;
  if (!url || (!__DEV__ && !url.startsWith('https://'))) {
    throw new Error('Chưa cấu hình địa chỉ HTTPS của máy chủ.');
  }
  return url.replace(/\/$/, '');
}

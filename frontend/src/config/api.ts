import { Platform } from 'react-native';

// Enable this only when testing on a physical phone on the same Wi-Fi.
const USE_PHYSICAL_DEVICE = false;
const COMPUTER_LAN_IP = '10.0.14.71';
export const DEVELOPMENT_HOST_IP = USE_PHYSICAL_DEVICE
  ? COMPUTER_LAN_IP
  : Platform.OS === 'android'
  ? '10.0.2.2'
  : 'localhost';
const DEVELOPMENT_API_URL = `http://${DEVELOPMENT_HOST_IP}:5001`;
// Set your HTTPS API origin before creating a release build. No secrets belong here.
const PRODUCTION_API_URL: string = '';

export function apiBaseUrl(): string {
  const url = __DEV__ ? DEVELOPMENT_API_URL : PRODUCTION_API_URL;
  if (!url || (!__DEV__ && !url.startsWith('https://'))) {
    throw new Error('Chưa cấu hình địa chỉ HTTPS của máy chủ.');
  }
  return url.replace(/\/$/, '');
}

// Browser preview: per-tab storage, cleared when the tab closes. This is not native Keychain.
const prefix = 'nihongo.web.v1.';
export const ACCESSIBLE = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'session' };
export async function setGenericPassword(
  username: string,
  password: string,
  options: { service: string },
) {
  sessionStorage.setItem(
    prefix + options.service,
    JSON.stringify({ username, password }),
  );
  return true;
}
export async function getGenericPassword(options: { service: string }) {
  const value = sessionStorage.getItem(prefix + options.service);
  if (!value) return false;
  try {
    return JSON.parse(value) as { username: string; password: string };
  } catch {
    sessionStorage.removeItem(prefix + options.service);
    return false;
  }
}
export async function resetGenericPassword(options: { service: string }) {
  sessionStorage.removeItem(prefix + options.service);
  return true;
}

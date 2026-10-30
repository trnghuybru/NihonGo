import { createContext, useContext } from 'react';
import type { AppTab } from '../components/BottomNavigation';
export type WebNavigation = {
  pathname: string;
  search: string;
  key: string;
  state: Record<string, unknown> | null;
  navigate: (
    to: string,
    options?: { replace?: boolean; state?: unknown },
  ) => void;
  back: (fallback: string) => void;
};
export const WebNavigationContext = createContext<WebNavigation | null>(null);
export function useWebNavigation() {
  return useContext(WebNavigationContext);
}
export const tabPaths: Record<AppTab, string> = {
  home: '/',
  practice: '/practice',
  lookup: '/lookup',
  vocabulary: '/lessons',
  profile: '/profile',
};
export const authPaths = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/verify',
  '/reset-password',
]);
export function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export function safeReturnTo(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some(character => character.charCodeAt(0) < 32)
  )
    return '/';
  try {
    const url = new URL(value, 'https://nihongo.invalid');
    return url.origin === 'https://nihongo.invalid' &&
      !authPaths.has(url.pathname.replace(/\/+$/, '')) &&
      url.pathname.replace(/\/+$/, '') !== '/onboarding'
      ? url.pathname + url.search
      : '/';
  } catch {
    return '/';
  }
}
export function selectedTabForPath(path: string): AppTab {
  if (/^\/(practice|flashcards|games)(\/|$)/.test(path)) return 'practice';
  if (/^\/lessons(\/|$)/.test(path)) return 'vocabulary';
  if (/^\/lookup(\/|$)/.test(path)) return 'lookup';
  if (/^\/profile(\/|$)/.test(path)) return 'profile';
  return 'home';
}
// RN Web renders Pressable with href as an anchor. Native keeps its existing handler.
export function navigationLink(
  nav: WebNavigation | null,
  href: string,
  action: () => void,
) {
  return nav
    ? {
        href,
        onPress: (event: {
          preventDefault?: () => void;
          metaKey?: boolean;
          ctrlKey?: boolean;
          shiftKey?: boolean;
          altKey?: boolean;
        }) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          event.preventDefault?.();
          action();
        },
      }
    : { onPress: action };
}

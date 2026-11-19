import { resolveApiOrigin } from './apiOrigin';

// Unconfigured builds keep the existing same-origin/Vite proxy behavior.
export const DEVELOPMENT_HOST_IP =
  typeof window === 'undefined' ? 'localhost' : window.location.hostname;
export function apiBaseUrl(): string {
  return resolveApiOrigin(
    import.meta.env.VITE_API_ORIGIN,
    window.location.origin,
    import.meta.env.DEV,
  );
}

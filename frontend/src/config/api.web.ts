// Same-origin requests use the Vite proxy locally; production must route /api to the backend.
export const DEVELOPMENT_HOST_IP =
  typeof window === 'undefined' ? 'localhost' : window.location.hostname;
export function apiBaseUrl(): string {
  return window.location.origin;
}

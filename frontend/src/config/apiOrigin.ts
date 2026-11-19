// Keep the origin separate from /api so HTTP, Socket.IO and Live share it.
export function resolveApiOrigin(
  configured: string | undefined,
  fallback: string,
  development = false,
): string {
  const value = configured?.trim();
  if (!value) return fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_ORIGIN phải là HTTPS origin hợp lệ.');
  }
  if (
    (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('VITE_API_ORIGIN phải là HTTPS origin, không kèm đường dẫn.');
  }
  return url.origin;
}

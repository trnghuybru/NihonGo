// Compatibility for old clients and the existing Google OAuth callback URL.
// Current web builds call the API directly; static frontend requests bypass this
// Function through _routes.json and do not consume Function requests.
const backendOrigin = 'https://api.momonihongo.app';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/static/') ||
      url.pathname.startsWith('/socket.io/')
    ) {
      const target = new URL(backendOrigin);
      target.pathname = url.pathname;
      target.search = url.search;
      const upstream = new Request(target, request);
      upstream.headers.delete('Host');
      // Return the original response, including WebSocket 101 upgrades. Manual
      // redirects keep OAuth provider redirects in the user's browser.
      return fetch(upstream, { redirect: 'manual' });
    }
    return env.ASSETS.fetch(request);
  },
};

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(
  new URL('../../frontend/public/_worker.js', import.meta.url),
  'utf8',
);
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

test('legacy API proxy preserves POST, bearer auth, body and query', async () => {
  const previous = globalThis.fetch;
  const response = new Response('ok');
  globalThis.fetch = async (request, options) => {
    assert.equal(request.url, 'https://api.momonihongo.app/api/auth/refresh?check=1');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('Authorization'), 'Bearer test-only');
    assert.equal(request.headers.get('Origin'), 'https://momonihongo.app');
    assert.equal(request.headers.get('Host'), null);
    assert.equal(await request.text(), '{"refresh_token":"test-only"}');
    assert.equal(options.redirect, 'manual');
    return response;
  };
  try {
    const request = new Request('https://momonihongo.app/api/auth/refresh?check=1', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-only',
        Origin: 'https://momonihongo.app',
        Host: 'momonihongo.app',
      },
      body: '{"refresh_token":"test-only"}',
    });
    assert.equal(await worker.fetch(request, {}), response);
  } finally {
    globalThis.fetch = previous;
  }
});

test('OAuth redirects and WebSocket upgrade responses pass through untouched', async () => {
  const previous = globalThis.fetch;
  const upgrade = { status: 101, webSocket: {} };
  globalThis.fetch = async (request, options) => {
    assert.equal(new URL(request.url).origin, 'https://api.momonihongo.app');
    assert.equal(request.headers.get('Upgrade'), 'websocket');
    assert.equal(options.redirect, 'manual');
    return upgrade;
  };
  try {
    const request = new Request('https://momonihongo.app/socket.io/?EIO=4&transport=websocket', {
      headers: { Upgrade: 'websocket' },
    });
    assert.equal(await worker.fetch(request, {}), upgrade);
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: 'https://accounts.google.com/test-only' },
    });
    globalThis.fetch = async (request, options) => {
      assert.equal(request.url, 'https://api.momonihongo.app/api/auth/oauth/google/callback?code=test-only');
      assert.equal(options.redirect, 'manual');
      return redirect;
    };
    assert.equal(
      await worker.fetch(new Request('https://momonihongo.app/api/auth/oauth/google/callback?code=test-only'), {}),
      redirect,
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test('static assets and SPA routes use the Pages asset binding', async () => {
  const asset = new Response('frontend');
  const env = { ASSETS: { fetch: async () => asset } };
  for (const path of ['/', '/learn/lesson-1', '/games/ABCD', '/assets/index-hash.js']) {
    assert.equal(await worker.fetch(new Request('https://momonihongo.app' + path), env), asset);
  }
});

test('only compatibility routes invoke Functions; asset cache overrides revalidation', async () => {
  const routes = JSON.parse(await readFile(new URL('../../frontend/public/_routes.json', import.meta.url)));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ['/api/*', '/static/*', '/socket.io/*']);
  assert.deepEqual(routes.exclude, []);
  const headers = await readFile(new URL('../../frontend/public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /Cache-Control: public, max-age=0, must-revalidate/);
  assert.match(headers, /\/assets\/\*\n\s+! Cache-Control\n\s+Cache-Control: public, max-age=31536000, immutable/);
});

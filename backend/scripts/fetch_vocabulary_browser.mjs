// Read public lessons using a separate Chrome profile; no personal cookies are read.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [manifestPath, executable, profile, delaySeconds] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const allowed = /^https:\/\/www\.vnjpclub\.com\/(mimikara-n3-tu-vung|mimi-kara-n2-goi)\/(unit-\d+-bai-\d+|katakana-[ab]|unit-(2|3|11)-a)\.html$/;
if (!manifest.every(item => allowed.test(item.url))) throw new Error('Unsupported public lesson URL.');
const missing = manifest.filter(item => !existsSync(item.cache_file));
if (!missing.length) process.exit(0);
const delay = Math.max(30, Number(delaySeconds));
if (!Number.isFinite(delay)) throw new Error('Invalid request delay.');
mkdirSync(profile, { recursive: true });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const browser = spawn(executable, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--blink-settings=imagesEnabled=false',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
let launchError;
browser.on('error', error => { launchError = error; });
let socket;
const pending = new Map();
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (existsSync(portFile)) {
      const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        const info = await response.json();
        socket = new WebSocket(info.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', reject, { once: true });
        });
        break;
      } catch { /* Wait for Chrome to finish starting. */ }
    }
    await pause(200);
  }
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Chrome did not start.');
  let nextId = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Browser command timed out: ${method}`));
    }, 45000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  let lastRequest = Date.now();
  for (const [index, item] of missing.entries()) {
    await pause(Math.max(0, delay * 1000 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    const navigation = await send('Page.navigate', { url: item.url }, sessionId);
    if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
    let html;
    for (let attempt = 0; attempt < 40; attempt++) {
      await pause(500);
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
          url:location.href,
          limited:document.body?.innerText.includes('Quá nhiều request'),
          ready:document.readyState!=='loading' && !!document.querySelector('.entry-content .boxtv, .entry-content [data-ykhp]')
        })`, returnByValue: true,
      }, sessionId);
      if (exceptionDetails || !result.value) continue;
      const page = JSON.parse(result.value);
      if (page.limited) throw new Error('Website temporarily limits requests. Stop and retry later.');
      if (page.url !== item.url || !page.ready) continue;
      const response = await send('Runtime.evaluate', {
        expression: 'document.documentElement.outerHTML', returnByValue: true,
      }, sessionId);
      html = response.result.value;
      break;
    }
    if (!html) throw new Error(`Public lesson unavailable or browser verification incomplete: ${item.url}`);
    mkdirSync(dirname(item.cache_file), { recursive: true });
    writeFileSync(item.cache_file, html, 'utf8');
    console.log(`[browser ${index + 1}/${missing.length}] Saved ${item.url}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const request of pending.values()) clearTimeout(request.timeout);
  socket?.close();
  browser.kill('SIGTERM');
}

// Disposable real HTTP gateway and mounted production controls; no unit runner or live installation.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'apps/daemon/package.json');
const deskRequire = createRequire(root + 'apps/desk/package.json');
const load = name => import(root + 'apps/daemon/dist/' + name + '.js');
const { openDb } = await load('db/index'), { createAuth } = await load('auth');
const { createLedger } = await load('ledger'), { createApprovals } = await load('approvals');
const { createGateway } = await load('gateway');
const { serve } = require('@hono/node-server');
const dir = mkdtempSync('/tmp/oag-host-copy-'), db = openDb(dir);
const auth = createAuth({ db, ownerToken: 'synthetic-owner-host-copy' }), ledger = createLedger(db);
const app = createGateway({ db, auth, ledger, approvals: createApprovals(db, ledger), dispatch() {}, dataDir: dir });
const server = serve({ fetch: app.fetch, hostname: '0.0.0.0', port: 0 });
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`, realFetch = globalThis.fetch;
const headers = { origin, 'content-type': 'application/json', 'x-openag-host': '1' };
const post = (extra = {}, body = { name: 'Host browser' }, target = origin) => realFetch(target + '/devices/host', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
let vite, dom, renderRoot;
try {
  // Host sign-in is only the protected Unix socket (pnpm desk:open); no HTTP request can mint a device.
  for (const extra of [{}, { 'sec-fetch-site': 'same-origin' }]) assert.equal((await post(extra)).status, 401, JSON.stringify(extra));
  assert.equal(auth.listDevices().length, 0, 'Loopback HTTP never creates a device');
  assert.equal((await realFetch(origin + '/whoami')).status, 401, 'Ordinary API still requires a token');
  assert.equal((await realFetch(origin + '/stream')).status, 401);
  const html = await realFetch(origin);
  assert.equal(html.headers.get('x-frame-options'), 'DENY');
  assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  console.log('PASS no loopback HTTP sign-in route, token-required API and frame protection');

  const { JSDOM } = deskRequire('jsdom'), React = deskRequire('react'), { act } = React;
  dom = new JSDOM('<div id="root"></div>', { url: origin, pretendToBeVisual: true });
  for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'localStorage', 'getComputedStyle', 'Event', 'CustomEvent', 'KeyboardEvent', 'InputEvent']) globalThis[name] = name === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[name];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const { createServer } = await import(deskRequire.resolve('vite'));
  vite = await createServer({ configFile: false, root: root + 'apps/desk', resolve: { alias: { '@': root + 'apps/desk/src' } }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { createRoot } = deskRequire('react-dom/client'); renderRoot = createRoot(document.getElementById('root'));
  const { Login } = await vite.ssrLoadModule('/src/components/Login.tsx');
  const { MessageCopyButton } = await vite.ssrLoadModule('/src/components/Feed.tsx');
  const { CodeBlockCopyButton } = await vite.ssrLoadModule('/src/components/ui/code-block.tsx');
  const settle = fn => act(async () => { fn?.(); await new Promise(resolve => setTimeout(resolve, 30)); });
  const render = child => settle(() => renderRoot.render(child));
  let attempts = 0;
  globalThis.fetch = async () => { attempts++; throw Error('Login must not call the daemon before the user submits'); };
  for (const url of [origin, 'http://localhost:4747/', 'http://100.64.0.1:4747/']) {
    dom.reconfigure({ url });
    await render(React.createElement(React.StrictMode, null, React.createElement(Login, { key: url, notice: null, onSignedIn() { throw Error('no automatic sign-in'); } })));
    assert.ok(document.querySelector('#pair-code'), `${url} shows pairing`);
    assert.match(document.body.textContent, /pnpm desk:open/);
  }
  assert.equal(attempts, 0, 'No automatic host request from any address');
  dom.reconfigure({ url: origin });
  console.log('PASS mounted Login: pairing on localhost and remote addresses, no automatic host request');

  let copied, fallbackCalls = 0, refuse = false;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  document.execCommand = command => {
    assert.equal(command, 'copy'); fallbackCalls++;
    const field = document.activeElement;
    assert.equal(field.tagName, 'TEXTAREA'); assert.equal(field.selectionStart, 0); assert.equal(field.selectionEnd, field.value.length);
    copied = field.value; return !refuse;
  };
  for (const [Component, props] of [[MessageCopyButton, { text: 'Mobile 🌿\nexact text' }], [CodeBlockCopyButton, { value: 'Mobile 🌿\nexact text' }]]) {
    await render(React.createElement('div', { role: 'dialog' }, React.createElement(Component, props)));
    const button = document.querySelector('button'); await settle(() => { button.focus(); button.click(); });
    assert.equal(copied, 'Mobile 🌿\nexact text'); assert.equal(button.getAttribute('aria-label'), 'Copied');
    assert.equal(document.activeElement, button); assert.equal(document.querySelector('textarea'), null);
    refuse = true; await settle(() => button.click());
    assert.match(document.body.textContent, /Could not copy/); assert.equal(document.querySelector('textarea'), null);
    refuse = false;
  }
  const previousCalls = fallbackCalls;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text; } } });
  await render(React.createElement(MessageCopyButton, { key: 'secure', text: 'HTTPS copy' }));
  await settle(() => document.querySelector('button').click());
  assert.equal(copied, 'HTTPS copy'); assert.equal(fallbackCalls, previousCalls, 'Secure contexts retain async clipboard');
  console.log('PASS mounted message/code Copy: absent clipboard, exact Unicode/multiline selection, focus/cleanup, refusal and secure path');
} finally {
  if (renderRoot) await deskRequire('react').act(async () => renderRoot.unmount());
  globalThis.fetch = realFetch; await vite?.close(); dom?.window.close();
  await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true });
}

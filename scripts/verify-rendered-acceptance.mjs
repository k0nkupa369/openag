// Rendered desk acceptance: real Chromium at desktop and phone sizes in light and dark against a disposable gateway.
// No live data, provider or model is used. Screenshots go to OPENAG_EVIDENCE_DIR (default: a temporary folder).
// Usage: OPENAG_PLAYWRIGHT_MODULE=<playwright-core> node scripts/verify-rendered-acceptance.mjs [ticket...]
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { startFixture } from './bot-models-fixture.mjs';
import { createMcpInteractions } from '../apps/daemon/dist/mcp/interactions.js';
import { requestInputTool } from '../apps/daemon/dist/tools/input.js';
import { toExecutors } from '../apps/daemon/dist/tools/registry.js';
import { createRoom, addMember } from '../apps/daemon/dist/rooms.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OPENAG_PLAYWRIGHT_MODULE || 'playwright');
export const VARIANTS = [
  { name: 'desktop-light', viewport: { width: 1440, height: 1000 }, theme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1440, height: 1000 }, theme: 'dark' },
  { name: 'phone-light', viewport: { width: 390, height: 844 }, theme: 'light', mobile: true },
  { name: 'phone-dark', viewport: { width: 390, height: 844 }, theme: 'dark', mobile: true },
];
const evidence = process.env.OPENAG_EVIDENCE_DIR || mkdtempSync(join(tmpdir(), 'openag-rendered-'));
mkdirSync(evidence, { recursive: true });

export async function startHarness(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'openag-bot-models-')), ownerToken = randomUUID();
  const f = await startFixture(dir, ownerToken, 0, options);
  const req = (path, method = 'GET', body, token = ownerToken) => fetch(f.url + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async (path, method, body, token) => { const r = await req(path, method, body, token); assert.ok(r.ok, `${method || 'GET'} ${path}: ${r.status} ${await r.clone().text()}`); return r.json(); };
  const device = (await json('/devices', 'POST', { name: 'Rendered acceptance', access: 'full' })).token;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  /** Render `hash` in every variant; `act(page)` reaches the state, `check(page)` adds state assertions. */
  async function capture(ticket, state, hash, { act, check, variants = VARIANTS, token = device, reducedMotion = 'reduce' } = {}) {
    for (const v of variants) {
      const context = await browser.newContext({ viewport: v.viewport, isMobile: !!v.mobile, hasTouch: !!v.mobile, deviceScaleFactor: 1, reducedMotion, colorScheme: v.theme });
      await context.addInitScript(({ token, theme }) => { if (token) localStorage.setItem('openag-token', token); localStorage.setItem('openag.theme', theme); }, { token, theme: v.theme });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_BLOCKED/.test(m.text())) errors.push('console: ' + m.text()); });
      await page.goto(`${f.url}/${hash}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      let actError = null;
      if (act) { try { await act(page, v); } catch (e) { actError = 'act: ' + e.message.split('\n')[0]; } }
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      const file = join(evidence, `${ticket}-${state}-${v.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const problems = [];
      if (overflow > 1) problems.push(`horizontal overflow ${overflow}px`);
      if (actError) problems.push(actError);
      if (errors.length) problems.push(...errors);
      if (check) { try { await check(page, v); } catch (e) { problems.push('check: ' + e.message.split('\n')[0]); } }
      results.push({ ticket, state, variant: v.name, file, problems });
      await context.close();
    }
  }
  async function close() { await browser.close(); await f.close?.(); rmSync(dir, { recursive: true, force: true }); }
  return { f, req, json, device, ownerToken, capture, results, close };
}

export function report(results) {
  const failed = results.filter(r => r.problems.length);
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${r.ticket} ${r.state} ${r.variant}${r.problems.length ? ' :: ' + r.problems.join(' | ') : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} renders passed automatic checks. Screenshots: ${evidence}`);
  return failed.length === 0;
}

/** A small RGB gradient PNG, so the crop editor gets a real raster image. */
export function gradientPng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length); return out; };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = Math.round(255 * x / w); raw[i + 1] = Math.round(255 * y / h); raw[i + 2] = 180; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const HOSTILE = '<img src=x onerror=alert(1)><script>alert(2)</script>';
const LONG = 'A long, multi-line message that should wrap inside its bubble and quote preview without widening the page. ' + 'unbrokenwordwithoutanyspaces'.repeat(6) + '\nSecond line keeps its break.\nThird line ' + HOSTILE;
const reply = page => page.getByRole('button', { name: 'Reply to message' });
const composer = page => page.getByPlaceholder(/^Message /);

/** Record what the browser reports for `selector` at the moment a match mounts or changes state, before any animation can finish. */
const watch = (page, selector) => page.evaluate(selector => {
  const seen = (window.__motion ??= {})[selector] = [], recorded = new Set();
  const record = el => {
    const s = getComputedStyle(el), key = [el, el.getAttribute('data-active'), el.hasAttribute('data-ending-style')];
    if ([...recorded].some(k => k.every((part, i) => part === key[i]))) return; recorded.add(key);
    seen.push({ animations: el.getAnimations().map(a => a.animationName ?? a.transitionProperty), instant: el.getAttribute('data-instant'), active: el.getAttribute('data-active'), ending: el.hasAttribute('data-ending-style'), duration: s.transitionDuration, easing: s.transitionTimingFunction });
  };
  new MutationObserver(() => document.querySelectorAll(selector).forEach(record)).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-active', 'data-ending-style', 'data-open'] });
}, selector);
const seen = (page, selector) => page.evaluate(selector => window.__motion?.[selector] ?? [], selector);
const HOUSE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const NO_MOTION = { reducedMotion: 'no-preference', variants: VARIANTS.slice(0, 1) };
/** The first record of a popup that opened: it must exist and is what the user saw on its first frame. */
const firstOpen = async (page, selector) => { const r = (await seen(page, selector)).find(x => !x.ending); assert.ok(r, `${selector} opened`); return r; };

/** Ticket scenarios: each seeds its own data in the shared disposable gateway, then captures states. */
export const SCENARIOS = {
  async 'OA-476'(h) {
    const { ledger } = h.f;
    ledger.append('main', 'boss', 'bot_output', { text: 'Short agent answer to reply to.' });
    ledger.append('main', 'user', 'message', { text: LONG });
    const up = await (await fetch(h.f.url + '/rooms/main/uploads', { method: 'POST', headers: { authorization: 'Bearer ' + h.ownerToken, 'content-type': 'text/plain', 'x-file-name': 'notes.txt' }, body: 'attachment body' })).json();
    await h.json('/rooms/main/messages', 'POST', { text: '', attachments: [up.attachment.id] });
    await h.f.runner.drain?.();
    const pick = async (page, index) => { const target = page.getByRole('article').nth(index); await target.hover(); await reply(page).nth(index).click(); };
    const quoted = page => page.getByLabel('Reply preview');
    await h.capture('OA-476', 'agent-target-selected', '#/room/main', {
      act: page => pick(page, 0),
      check: async page => { assert.ok(await quoted(page).isVisible(), 'reply preview shown'); assert.ok(await composer(page).evaluate(el => el === document.activeElement), 'composer focused'); },
    });
    await h.capture('OA-476', 'long-hostile-target-selected', '#/room/main', {
      act: page => pick(page, 1),
      check: async page => { assert.ok(await quoted(page).isVisible()); assert.equal(await page.evaluate(() => window.__xss === undefined && !document.querySelector('[onerror]')), true, 'hostile text stays literal'); },
    });
    await h.capture('OA-476', 'attachment-target-selected', '#/room/main', { act: page => pick(page, 2), check: async page => assert.ok(await quoted(page).isVisible()) });
    await h.capture('OA-476', 'escape-cancels', '#/room/main', {
      act: async page => { await pick(page, 0); await composer(page).press('Escape'); },
      check: async page => assert.equal(await quoted(page).count(), 0, 'Escape removes the reply preview'),
    });
    await h.capture('OA-476', 'sent-with-quote', '#/room/main', {
      variants: VARIANTS.slice(0, 1),
      act: async page => { await pick(page, 1); await composer(page).fill('Replying to the long message.'); await composer(page).press('Enter'); await page.getByText('Replying to the long message.').first().waitFor(); },
      check: async page => assert.equal(await quoted(page).count(), 0, 'composer clears the reply after sending'),
    });
    await h.capture('OA-476', 'sent-quote-after-reload', '#/room/main', { check: async page => assert.ok(await page.getByRole('blockquote').count() >= 1 || await page.locator('blockquote').count() >= 1, 'sent quote renders in history') });
  },

  /** OA-466 long-history rendering: latest view, scrolled away with jump-to-latest, load earlier, typing during incoming events. */
  async 'OA-466'(h) {
    const { db, ledger } = h.f;
    createRoom(db, { id: 'long', name: 'long', leadBotId: 'boss' }); addMember(db, 'long', 'boss');
    for (let i = 1; i <= 150; i++) {
      ledger.append('long', 'user', 'message', { text: `Question ${i}: ` + 'a sentence of context. '.repeat(1 + i % 4) });
      ledger.append('long', 'boss', 'bot_output', { text: `Answer ${i}\n\n- point one\n- point two` + (i % 10 === 0 ? '\n\n| Item | State |\n| --- | --- |\n| A | ok |' : '') });
    }
    const scroller = page => page.locator('[data-slot="message-scroller"]').first();
    const jump = page => page.getByRole('button', { name: 'Jump to latest message' });
    /** Load earlier must sit in its own ruled row above the transcript, never over a visible message. */
    const earlierControlClear = async page => {
      const r = await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find(b => /^Load(ing)? earlier messages/.test(b.textContent));
        const log = document.querySelector('[role="log"]').getBoundingClientRect(), b = button.getBoundingClientRect(), row = button.parentElement;
        const covered = [...document.querySelectorAll('[role="article"]')].filter(a => { const e = a.getBoundingClientRect(), top = Math.max(e.top, log.top), bottom = Math.min(e.bottom, log.bottom); return bottom > top && top < b.bottom && bottom > b.top && e.left < b.right && e.right > b.left; }).length;
        return { covered, gap: log.top - b.bottom, rule: parseFloat(getComputedStyle(row).borderBottomWidth), ruleWidth: row.getBoundingClientRect().width, logWidth: log.width };
      });
      assert.equal(r.covered, 0, 'Load earlier never covers a visible message');
      assert.ok(r.gap >= 0, `Load earlier sits above the transcript (gap ${r.gap}px)`);
      assert.ok(r.rule >= 1 && Math.abs(r.ruleWidth - r.logWidth) <= 1, `a full-width rule separates Load earlier from the transcript (border ${r.rule}px, ${Math.round(r.ruleWidth)} of ${Math.round(r.logWidth)}px)`);
    };
    await h.capture('OA-466', 'latest', '#/room/long', { check: async page => assert.ok(await page.getByText('Answer 150').first().isVisible(), 'opens at the latest message') });
    await h.capture('OA-466', 'scrolled-up-jump', '#/room/long', {
      act: async page => { await scroller(page).hover(); for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -1500); await page.waitForTimeout(500); },
      check: async page => { assert.ok(await jump(page).isVisible(), 'jump-to-latest shown when scrolled away'); await earlierControlClear(page); },
    });
    await h.capture('OA-466', 'load-earlier', '#/room/long', {
      act: async page => {
        for (let i = 0; i < 40 && !(await page.getByRole('button', { name: 'Load earlier messages' }).isVisible()); i++) { await scroller(page).hover(); await page.mouse.wheel(0, -3000); await page.waitForTimeout(80); }
        // The first message fully below the load button is the reading anchor; it must not jump when history is prepended.
        const topVisible = () => page.evaluate(() => { const items = [...document.querySelectorAll('[role="article"]')].map(e => ({ t: e.getAttribute('aria-label') + '|' + e.textContent.slice(0, 40), y: e.getBoundingClientRect().top })); const a = items.find(i => i.y > 120); return a; });
        const before = await topVisible();
        await page.getByRole('button', { name: 'Load earlier messages' }).click(); await page.waitForTimeout(800);
        const y = await page.evaluate(t => { const e = [...document.querySelectorAll('[role="article"]')].find(e => e.getAttribute('aria-label') + '|' + e.textContent.slice(0, 40) === t); return e ? e.getBoundingClientRect().top : null; }, before.t);
        h.anchor = { before, after: y };
      },
      check: async page => { assert.ok(h.anchor?.after !== null && Math.abs(h.anchor.after - h.anchor.before.y) < 48, `reading anchor moved from ${Math.round(h.anchor?.before?.y)} to ${Math.round(h.anchor?.after)}px after loading earlier history`); await earlierControlClear(page); },
    });
    await h.capture('OA-466', 'typing-during-incoming', '#/room/long', {
      variants: VARIANTS.slice(0, 1),
      act: async page => {
        await composer(page).click(); await composer(page).type('Draft that must survive ');
        for (let i = 1; i <= 5; i++) ledger.append('long', 'boss', 'bot_output', { text: `Incoming ${i} while typing` });
        await page.waitForTimeout(600); await composer(page).type('incoming replies.');
      },
      check: async page => { assert.equal(await composer(page).inputValue(), 'Draft that must survive incoming replies.', 'draft intact'); assert.ok(await page.getByText('Incoming 5 while typing').isVisible(), 'new replies shown while at latest'); },
    });
  },

  /** Sign-in redesign (0.7.0): unpaired join page, Full invite link, and a revoked device. */
  async 'sign-in'(h) {
    await h.capture('sign-in', 'unpaired', '#/', { token: '', check: async page => { assert.ok(await page.getByRole('heading', { level: 1, name: 'Connect this device' }).isVisible(), 'page h1 names the sign-in'); assert.ok(await page.getByLabel('Device name').isVisible(), 'device name field'); } });
    const code = (await h.json('/devices/pairing-codes', 'POST', { access: 'full' }).catch(() => null))?.code;
    if (code) await h.capture('sign-in', 'full-invite', `#/join/${code.slice(0, 4)}-${code.slice(4)}/full`, { token: '', check: async page => assert.ok(await page.getByRole('button', { name: 'Connect device' }).isVisible()) });
    const revoked = await h.json('/devices', 'POST', { name: 'Old phone' });
    await h.req(`/devices/${encodeURIComponent(revoked.id ?? revoked.device?.id)}`, 'DELETE');
    await h.capture('sign-in', 'revoked-device', '#/', {
      token: revoked.token,
      check: async page => {
        const alert = page.getByRole('alert').filter({ hasText: /revoked or its token is no longer valid/ });
        assert.ok(await alert.isVisible(), 'revoked message');
        const [a, tabs] = [await alert.boundingBox(), await page.getByRole('tablist', { name: 'Sign-in method' }).boundingBox()];
        assert.ok(a.y + a.height <= tabs.y, `revoked Alert sits above the form (Alert bottom ${Math.round(a.y + a.height)}, form top ${Math.round(tabs.y)})`);
      },
    });
  },

  /** OA-460 name and OA-462 uploaded image: profile page, crop dialog, saved image, read-only Limited device. */
  async 'OA-460'(h) {
    const png = gradientPng(480, 320), name = page => page.getByLabel('Name', { exact: true });
    const upload = async page => { await page.getByLabel('Upload avatar image').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png }); await page.getByRole('dialog').waitFor(); };
    await h.capture('OA-460', 'profile-default', '#/settings/profile', { check: async page => assert.ok(await name(page).isVisible(), 'name field') });
    await h.capture('OA-460', 'profile-edited', '#/settings/profile', {
      act: async page => { await name(page).fill('Taylor with a considerably longer display name'); },
      check: async page => { assert.ok(await page.getByRole('button', { name: 'Save profile' }).isEnabled(), 'Save enabled'); assert.ok(await page.getByRole('button', { name: 'Cancel' }).isVisible(), 'Cancel shown'); },
    });
    const busyButton = async (page, label) => { const button = page.getByRole('button', { name: label }); assert.ok(await button.isDisabled({ timeout: 5000 }), `${label} button is disabled while busy`); assert.ok(await button.getByRole('status', { name: 'Loading' }).isVisible(), `${label} button shows a spinner`); };
    await h.capture('OA-460', 'saving-busy', '#/settings/profile', {
      act: async page => { await page.route('**/settings/profile', route => { if (route.request().method() !== 'PUT') return route.continue(); }); await name(page).fill('Taylor'); await page.getByRole('button', { name: 'Save profile' }).click(); },
      check: async page => { await busyButton(page, 'Saving…'); assert.ok(await name(page).isDisabled(), 'the FieldSet disables the form while saving'); },
    });
    await h.capture('OA-462', 'reading-busy', '#/settings/profile', {
      act: async page => { await page.evaluate(() => { HTMLImageElement.prototype.decode = () => new Promise(() => {}); }); await page.getByLabel('Upload avatar image').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png }); },
      check: async page => { await busyButton(page, 'Reading image…'); assert.equal(await page.getByText('Reading image…').count(), 1, 'the busy text lives only in the button'); },
    });
    await h.capture('OA-462', 'crop-dialog', '#/settings/profile', { act: upload, check: async page => { assert.ok(await page.getByRole('dialog', { name: 'Adjust your image' }).isVisible()); assert.equal(await page.getByRole('slider', { name: 'Zoom image' }).count(), 1, 'exactly one zoom slider'); assert.ok(await page.getByRole('slider', { name: 'Zoom image' }).isVisible(), 'zoom slider'); } });
    await h.capture('OA-462', 'crop-zoomed', '#/settings/profile', {
      act: async page => { await upload(page); for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click(); },
    });
    await h.capture('OA-462', 'saved-with-image', '#/settings/profile', {
      variants: VARIANTS.slice(0, 1),
      act: async page => { await upload(page); await page.getByRole('button', { name: 'Use image' }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByRole('button', { name: 'Save profile' }).click(); await page.getByText('Profile saved.').waitFor(); },
      check: async page => assert.ok(await page.getByRole('button', { name: 'Remove image' }).isVisible(), 'Remove image shown'),
    });
    await h.capture('OA-462', 'image-after-reload', '#/settings/profile', { check: async page => assert.ok(await page.getByRole('button', { name: 'Remove image' }).isVisible(), 'saved image persists') });
    const limited = (await h.json('/devices', 'POST', { name: 'Limited phone' })).token;
    await h.capture('OA-460', 'limited-read-only', '#/settings/profile', { token: limited, check: async page => { assert.ok(await page.getByText('Full access is required to edit the profile.').isVisible()); assert.ok(await name(page).isDisabled(), 'name disabled'); } });
  },

  /** OA-459 saved reflection memory (Memories and Reflection) and OA-390 agent avatars (editor, rotation, expression). */
  async 'OA-459'(h) {
    await h.json('/bots/boss/memory', 'PUT', { text: '- Prefers short status updates in the morning.\n- Invoices go to the shared finance inbox.\n- ' + 'A long remembered preference that should wrap without widening the page. '.repeat(3) });
    const created = await h.json('/rooms', 'POST', { id: 'dm-boss', name: 'boss', kind: 'direct', members: ['boss'] }); const direct = created.room?.id ?? created.id ?? 'dm-boss';
    assert.ok(direct, 'direct chat for boss');
    await h.capture('OA-459', 'saved-memory', `#/room/${encodeURIComponent(direct)}/panel/settings/memories`, { act: async page => { await page.getByText('Invoices go to the shared finance inbox', { exact: false }).first().scrollIntoViewIfNeeded(); }, check: async page => assert.ok(await page.getByText('Invoices go to the shared finance inbox', { exact: false }).first().isVisible(), 'saved notes shown') });
    await h.capture('OA-459', 'reflection-panel', '#/settings/proactive/reflection');
    const view = page => page.getByLabel(/^Avatar view/);
    const settings = `#/room/${encodeURIComponent(direct)}/panel/settings`, open = page => page.getByRole('button', { name: 'Change avatar' }).first().click();
    const font = (page, text) => page.getByText(text, { exact: true }).first().evaluate(el => getComputedStyle(el).fontFamily);
    await h.capture('OA-390', 'agent-settings', settings, {
      check: async page => {
        assert.ok(await page.getByRole('button', { name: 'Change avatar' }).first().isVisible(), 'Change avatar shown');
        for (const help of ['Previous handles stay reserved to this agent.', 'Per turn. Tool execution is separately limited to 40 calls.']) assert.ok(!/mono/i.test(await font(page, help)), `help text uses the field description font: ${help}`);
        assert.ok(/mono/i.test(await font(page, 'api · @boss')), 'runtime and handle identifiers stay monospace');
      },
    });
    await h.capture('OA-390', 'avatar-editor', settings, { act: async page => { await open(page); await view(page).waitFor(); }, check: async page => assert.ok(await view(page).isVisible(), 'avatar view shown') });
    await h.capture('OA-390', 'avatar-turned-expression', settings, {
      act: async page => { await open(page); await view(page).focus(); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight'); const pick = page.getByLabel('Try an expression'); if (await pick.count()) await pick.first().click(); },
    });
  },

  /** OA-477 questions and decisions, OA-473 provider forms, and the surviving OA-469/OA-474 surfaces (approval card, tool outcomes). */
  async 'OA-477'(h) {
    const { db, ledger, approvals } = h.f;
    for (const id of ['questions', 'approval', 'provider', 'activity']) { createRoom(db, { id, name: id, leadBotId: 'boss' }); addMember(db, id, 'boss'); }
    await h.json('/rooms/questions/messages', 'POST', { text: 'ASK' });
    await h.f.runner.drain();
    approvals.request({ roomId: 'approval', botId: 'boss', toolName: 'write_file', toolClass: 'act-local', payload: { path: 'notes/plan.md', content: '# Plan\n\n- Draft the reply\n- ' + 'long-line-'.repeat(30) } });
    db.prepare("INSERT INTO turns(id,room_id,bot_id,status,state_json,created_at,updated_at) VALUES('turn-provider','provider','boss','running','{}',?,?)").run(Date.now(), Date.now());
    const scope = { serverId: 'synthetic', toolName: 'QUERY', context: { dataDir: h.f.dir ?? '/tmp', botId: 'boss', roomId: 'provider', turnId: 'turn-provider', toolCallId: 'call-provider' }, valid: () => true };
    h.pendingForm = h.broker.request(scope, { mode: 'form', message: 'The provider needs the invoice amount and whether to include delivery.', requestedSchema: { type: 'object', properties: { amount: { type: 'number', title: 'Amount' }, delivery: { type: 'boolean', title: 'Include delivery' }, currency: { type: 'string', title: 'Currency', enum: ['NZD', 'AUD', 'USD'] } }, required: ['amount'] } }, h.abort.signal).catch(() => {});
    const turnId = 'turn-activity';
    ledger.append('activity', 'user', 'message', { text: 'Check the three sources.' });
    ledger.append('activity', 'boss', 'turn_started', { turnId });
    for (const [n, tool, ok, status, message] of [[1, 'mcp.synthetic.LOOKUP', true], [2, 'mcp.synthetic.UPDATE', false, 'error', 'Provider returned 500'], [3, 'run_shell', false, 'unknown', 'Interrupted before a result was recorded']]) {
      ledger.append('activity', 'boss', 'tool_call', { turnId, toolCallId: 'c' + n, tool, args: { query: 'item ' + n } });
      ledger.append('activity', 'boss', 'tool_result', { turnId, toolCallId: 'c' + n, tool, ok, ...(ok ? { result: { rows: 3 }, invocationOutcome: 'returned', executionOutcome: 'completed', effectVerification: 'not-checked' } : { status, message, executionOutcome: status === 'unknown' ? 'unknown' : 'failed', ...(status === 'unknown' ? { invocationOutcome: 'returned' } : {}) }) });
    }
    ledger.append('activity', 'boss', 'bot_output', { turnId, text: 'One source answered, one failed and one is unconfirmed.' });
    ledger.append('activity', 'boss', 'turn_finished', { turnId, status: 'finished' });
    const question = page => page.getByRole('article').filter({ hasText: 'Which local option?' });
    await h.capture('OA-477', 'open-question', '#/room/questions', { check: async page => { assert.ok(await question(page).isVisible(), 'question shown'); assert.ok(await question(page).getByRole('button', { name: 'Dismiss' }).isVisible(), 'Dismiss shown'); } });
    await h.capture('OA-477', 'replying-to-question', '#/room/questions', {
      act: async page => { await question(page).hover(); await question(page).getByRole('button', { name: 'Reply to message' }).click(); },
      check: async page => {
        const preview = page.getByLabel('Reply preview');
        assert.ok(await preview.locator('blockquote', { hasText: 'Which local option?' }).isVisible(), 'question answer shows the quote block a message reply uses');
        assert.ok(await preview.getByRole('button', { name: 'Cancel reply' }).isVisible(), 'Cancel reply exits question mode');
        await composer(page).press('Escape');
        assert.equal(await preview.count(), 0, 'Escape cancels the question answer');
      },
    });
    await h.capture('OA-469', 'pending-approval-card', '#/room/approval', { check: async page => assert.ok(await page.getByText(/Waiting for you/i).first().isVisible(), 'pending badge shown') });
    await h.capture('OA-469', 'approval-expanded', '#/room/approval', {
      act: async page => { for (const b of await page.getByRole('button', { name: /proposal|details|review/i }).all()) await b.click().catch(() => {}); },
    });
    await h.capture('OA-473', 'provider-form', '#/room/provider', { check: async page => { assert.ok(await page.getByText(/invoice amount/).first().isVisible(), 'form message'); assert.ok(await page.getByLabel(/Amount/).first().isVisible(), 'Amount field'); } });
    await h.capture('OA-474', 'tool-outcomes-expanded', '#/room/activity', {
      act: async page => { await page.getByText(/3 operations/).click(); await page.waitForTimeout(300); },
      check: async (page, v) => {
        for (const t of ['LOOKUP', 'UPDATE', 'run_shell']) assert.ok(await page.getByText(t, { exact: false }).first().isVisible(), t + ' line visible');
        assert.ok(await page.getByText(/1 failed/).isVisible(), 'only the real failure counts as failed');
        const titles = await page.getByText('boss · Activity', { exact: true }).evaluateAll(els => els.map(el => ({ scroll: el.scrollWidth, client: el.clientWidth })));
        assert.ok(titles.length > 0, 'activity summary shown');
        for (const t of titles) assert.ok(t.scroll <= t.client, `summary title "boss · Activity" is whole (${t.scroll}px of text in ${t.client}px)`);
        if (!v.mobile) { const d = await page.getByText('3 operations · 1 failed · 1 unconfirmed', { exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth); assert.ok(d, 'summary counts are whole when the row has room'); }
      },
    });
  },

  /** Motion with normal motion preferences: keyboard-driven UI appears instantly; sheets and jump-to-latest use the house curve with faster exits. */
  async motion(h) {
    const { db, ledger } = h.f;
    createRoom(db, { id: 'motion', name: 'motion', leadBotId: 'boss' }); addMember(db, 'motion', 'boss');
    for (let i = 1; i <= 60; i++) ledger.append('motion', 'boss', 'bot_output', { text: `Answer ${i}\n\n` + 'a line of context. '.repeat(6) });
    const palette = '[data-slot="dialog-content"]:has([data-slot="command"])', menu = '[data-slot="dropdown-menu-content"]', popover = '[data-slot="popover-content"]', tooltip = '[data-slot="tooltip-content"]';
    const mentions = '[data-slot="popover-content"][aria-label="Agent mentions"]', panel = '[data-slot="sheet-content"]', backdrop = '[data-slot="sheet-overlay"]', jump = '[data-slot="message-scroller-button"][data-direction="end"]';
    const still = (r, what) => assert.deepEqual(r.animations, [], `${what} appears without animation (running: ${r.animations.join(', ')})`);
    const moves = (r, what) => assert.ok(r.animations.length > 0, `${what} keeps its open animation`);
    const model = async page => { await composer(page).click(); const trigger = page.getByRole('button', { name: /^Model: / }).first(); await trigger.waitFor(); return trigger; };
    await h.capture('motion', 'command-palette-instant', '#/room/main', {
      ...NO_MOTION,
      act: async page => { await watch(page, palette); await watch(page, '[data-slot="dialog-overlay"]'); await page.keyboard.press('ControlOrMeta+k'); await page.locator(palette).waitFor(); },
      check: async page => { still(await firstOpen(page, palette), 'Cmd+K palette'); still(await firstOpen(page, '[data-slot="dialog-overlay"]'), 'Cmd+K backdrop'); },
    });
    await h.capture('motion', 'other-dialog-animates', '#/settings/profile', {
      ...NO_MOTION,
      act: async page => { await watch(page, '[data-slot="dialog-content"]'); await page.getByLabel('Upload avatar image').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: gradientPng(480, 320) }); await page.getByRole('dialog').waitFor(); },
      check: async page => moves(await firstOpen(page, '[data-slot="dialog-content"]'), 'a pointer-opened dialog'),
    });
    await h.capture('motion', 'menu-keyboard-instant', '#/room/main', {
      ...NO_MOTION,
      act: async page => { await watch(page, menu); await (await model(page)).focus(); await page.keyboard.press('Enter'); await page.locator(menu).waitFor(); },
      check: async page => { const r = await firstOpen(page, menu); assert.ok(r.instant, 'a keyboard-opened menu is marked instant'); still(r, 'a keyboard-opened menu'); },
    });
    await h.capture('motion', 'menu-pointer-animates', '#/room/main', {
      ...NO_MOTION,
      act: async page => { await watch(page, menu); await (await model(page)).click(); await page.locator(menu).waitFor(); },
      check: async page => { const r = await firstOpen(page, menu); assert.equal(r.instant, null, 'a pointer-opened menu is not instant'); moves(r, 'a pointer-opened menu'); },
    });
    await h.capture('motion', 'popover-keyboard-instant', '#/room/main', {
      ...NO_MOTION,
      act: async page => { await watch(page, popover); await page.getByRole('button', { name: /^Options for / }).first().focus(); await page.keyboard.press('Enter'); await page.locator(popover).waitFor(); },
      check: async page => still(await firstOpen(page, popover), 'a keyboard-opened popover'),
    });
    await h.capture('motion', 'tooltip-focus-instant', '#/room/main', {
      ...NO_MOTION,
      act: async page => { await watch(page, tooltip); await page.getByRole('button', { name: 'Open side panel' }).focus(); await page.locator(tooltip).waitFor(); },
      check: async page => still(await firstOpen(page, tooltip), 'a focus-opened tooltip'),
    });
    await h.capture('motion', 'tooltip-group-instant', '#/room/motion', {
      ...NO_MOTION,
      act: async page => {
        const article = page.getByRole('article').last(); await article.hover();
        const copy = article.getByRole('button', { name: 'Copy message' }), reply = article.getByRole('button', { name: 'Reply to message' });
        await copy.hover(); await page.waitForTimeout(300);
        h.tooltipEarly = await page.locator(tooltip).count();
        await page.getByText('Copy message', { exact: true }).last().waitFor();
        const t = Date.now(); await reply.hover(); await page.locator(tooltip).filter({ hasText: /^Reply$/ }).waitFor();
        h.tooltipNext = { ms: Date.now() - t, ...await page.locator(tooltip).filter({ hasText: /^Reply$/ }).evaluate(el => ({ instant: el.getAttribute('data-instant'), animations: el.getAnimations().map(a => a.animationName ?? a.transitionProperty) })) };
      },
      check: async () => {
        assert.equal(h.tooltipEarly, 0, 'the first tooltip still waits for its hover delay');
        assert.ok(h.tooltipNext.ms < 200, `the adjacent tooltip opens without the delay (${h.tooltipNext.ms}ms)`);
        assert.equal(h.tooltipNext.instant, 'delay', 'the adjacent tooltip is marked instant by the shared provider');
        assert.deepEqual(h.tooltipNext.animations, [], `the adjacent tooltip appears without animation (running: ${h.tooltipNext.animations.join(', ')})`);
      },
    });
    for (const id of ['alpha', 'bravo']) { createRoom(db, { id, name: id, leadBotId: 'boss' }); addMember(db, id, 'boss'); }
    await h.capture('motion', 'sidebar-drag-tracks', '#/room/main', {
      ...NO_MOTION,
      act: async page => {
        const row = id => page.locator(`[data-nav-kind="rooms"][data-nav-id="${id}"]`);
        const order = () => page.locator('[data-nav-kind="rooms"]').evaluateAll(rows => rows.map(r => r.dataset.navId));
        const shift = id => row(id).evaluate(el => { const m = getComputedStyle(el).transform; return m === 'none' ? 0 : new DOMMatrix(m).m42; });
        h.dragBefore = await order();
        const [first, second] = h.dragBefore, handle = row(first).getByRole('button', { name: /^Drag .* to reorder$/ });
        const box = await handle.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        const last = await row(h.dragBefore.at(-1)).boundingBox(), own = await row(first).boundingBox(), max = last.y + last.height - (own.y + own.height);
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x, y + 13, { steps: 4 }); h.dragTrack = await shift(first);
        await page.mouse.move(x, y + max + 100, { steps: 6 }); h.dragEdge = { shift: await shift(first), max };
        await page.mouse.move(x, y - 50, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300); h.dragCancel = { order: await order(), shift: await shift(first) };
        const target = await row(second).boundingBox();
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, target.y + target.height / 2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
        h.dragAfter = { order: await order(), shift: await shift(first), first, second };
      },
      check: async () => {
        assert.ok(Math.abs(h.dragTrack - 13) <= 1, `the dragged row follows the pointer 1:1 (moved ${h.dragTrack}px for 13px)`);
        const { shift, max } = h.dragEdge;
        assert.ok(Math.abs(shift - (max + 20)) <= 2, `past the list end the row moves a fifth of the overshoot (moved ${shift}px, end ${max}px, pointer ${max + 100}px)`);
        assert.deepEqual(h.dragCancel.order, h.dragBefore, 'releasing outside a target keeps the order');
        assert.equal(h.dragCancel.shift, 0, 'a cancelled drag returns the row home');
        const expected = [...h.dragBefore]; expected.splice(0, 2, h.dragAfter.second, h.dragAfter.first);
        assert.deepEqual(h.dragAfter.order, expected, 'dropping on the next row reorders the list');
        assert.equal(h.dragAfter.shift, 0, 'the dropped row settles with no leftover transform');
      },
    });
    const PHONE_MOTION = { reducedMotion: 'no-preference', variants: [VARIANTS[2]] }, nav = '[data-mobile="true"][data-swipe-direction]', navBackdrop = '[data-slot="drawer-overlay"]';
    const openNav = async page => { await page.getByRole('button', { name: /^Open navigation/ }).first().click(); await page.locator(nav).waitFor(); await page.waitForTimeout(600); };
    const navState = page => page.evaluate(([nav, backdrop]) => {
      const popup = document.querySelector(nav), dim = document.querySelector(backdrop);
      return popup && { x: Math.round(popup.getBoundingClientRect().left), swiping: popup.hasAttribute('data-swiping'), dim: dim ? +getComputedStyle(dim).opacity : null };
    }, [nav, navBackdrop]);
    /** A one-finger horizontal swipe through CDP touch events: Base UI drawers track touch, not mouse drags. */
    const swipe = async (page, x, y, dx, steps, { hold = 0, release = true } = {}) => {
      const cdp = h.cdp ??= new WeakMap(); if (!cdp.has(page)) cdp.set(page, await page.context().newCDPSession(page));
      const send = (type, px) => cdp.get(page).send('Input.dispatchTouchEvent', { type, touchPoints: px === undefined ? [] : [{ x: px, y }] });
      await send('touchStart', x);
      for (let i = 1; i <= steps; i++) { await send('touchMove', x + dx * i / steps); await page.waitForTimeout(16); }
      if (hold) await page.waitForTimeout(hold);
      if (release) await send('touchEnd');
      return () => send('touchEnd');
    };
    await h.capture('motion', 'phone-nav-swipe-closes', '#/room/main', {
      ...PHONE_MOTION,
      act: async page => {
        await openNav(page); h.navOpen = await navState(page);
        const box = await page.locator(nav).boundingBox(), y = box.y + box.height / 2, x = box.x + box.width * 0.7;
        const lift = await swipe(page, x, y, -80, 8, { release: false });
        h.navMid = await navState(page);
        await swipe(page, x - 80, y, -40, 4, { release: false }); h.navLater = await navState(page);
        await swipe(page, x - 120, y, -100, 5, { release: false }); await lift();
        await page.locator(nav).waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
        h.navClosed = await page.locator(nav).count();
      },
      check: async () => {
        assert.ok(h.navMid.swiping, `the drawer is in its swiping state while dragged (${JSON.stringify({ open: h.navOpen, mid: h.navMid, closed: h.navClosed })})`);
        // Base UI waits for a short movement before it claims the gesture (so taps and vertical scrolls pass through), then tracks 1:1.
        assert.ok(h.navOpen.x - h.navMid.x >= 50, `the drawer moves with the finger (left edge ${h.navOpen.x} -> ${h.navMid.x}px for an 80px drag)`);
        assert.ok(Math.abs((h.navMid.x - h.navLater.x) - 40) <= 3, `once claimed, the drawer tracks the finger 1:1 (${h.navMid.x - h.navLater.x}px for 40px)`);
        assert.ok(h.navMid.dim < h.navOpen.dim, `the backdrop fades with the swipe (${h.navOpen.dim} -> ${h.navMid.dim})`);
        assert.equal(h.navClosed, 0, 'a long swipe toward the edge closes the drawer');
      },
    });
    await h.capture('motion', 'phone-nav-short-drag-stays', '#/room/main', {
      ...PHONE_MOTION,
      act: async page => {
        await openNav(page); h.navOpen = await navState(page);
        const box = await page.locator(nav).boundingBox(), y = box.y + box.height / 2, x = box.x + box.width * 0.7;
        await swipe(page, x, y, -20, 20, { hold: 150 }); await page.waitForTimeout(600);
        h.navAfter = await navState(page);
      },
      check: async () => {
        assert.ok(h.navAfter, 'a short slow drag leaves the drawer open');
        assert.equal(h.navAfter.x, h.navOpen.x, 'the drawer snaps back to its open position');
      },
    });
    await h.capture('motion', 'mention-picker-instant', '#/room/main', {
      ...NO_MOTION,
      act: async page => { await watch(page, mentions); await composer(page).click(); await page.keyboard.type('@'); await page.locator(mentions).waitFor(); },
      check: async page => still(await firstOpen(page, mentions), 'the @mention picker'),
    });
    await h.capture('motion', 'sheet-easing', '#/settings', {
      ...NO_MOTION,
      act: async page => {
        await watch(page, panel); await watch(page, backdrop);
        await page.getByRole('button', { name: 'New room' }).first().click(); await page.locator(panel).waitFor(); await page.waitForTimeout(400);
        h.sheetOpen = await page.locator(panel).evaluate(el => ({ duration: getComputedStyle(el).transitionDuration, easing: getComputedStyle(el).transitionTimingFunction }));
        h.backdropOpen = await page.locator(backdrop).evaluate(el => ({ duration: getComputedStyle(el).transitionDuration, easing: getComputedStyle(el).transitionTimingFunction }));
        await page.locator(panel).getByRole('button', { name: 'Close' }).click(); await page.locator(panel).waitFor({ state: 'detached' });
      },
      check: async page => {
        assert.deepEqual(h.sheetOpen, { duration: '0.2s', easing: HOUSE }, `open sheet panel: 200ms house curve (got ${JSON.stringify(h.sheetOpen)})`);
        assert.deepEqual(h.backdropOpen, { duration: '0.2s', easing: HOUSE }, `open sheet backdrop: 200ms house curve (got ${JSON.stringify(h.backdropOpen)})`);
        const closing = (await seen(page, panel)).find(r => r.ending), dim = (await seen(page, backdrop)).find(r => r.ending);
        assert.ok(closing && dim, 'sheet panel and backdrop reached their closing state');
        assert.deepEqual({ duration: closing.duration, easing: closing.easing }, { duration: '0.15s', easing: HOUSE }, `closing sheet panel: 150ms house curve (got ${closing.duration} ${closing.easing})`);
        assert.deepEqual({ duration: dim.duration, easing: dim.easing }, { duration: '0.15s', easing: HOUSE }, `closing sheet backdrop: 150ms house curve (got ${dim.duration} ${dim.easing})`);
        assert.ok(closing.animations.includes('translate') && closing.animations.includes('opacity'), `closing sheet slides and fades (transitions: ${closing.animations.join(', ')})`);
      },
    });
    await h.capture('motion', 'jump-to-latest-exit', '#/room/motion', {
      ...NO_MOTION,
      act: async page => {
        const scroller = page.locator('[data-slot="message-scroller"]').first();
        await scroller.hover(); for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -1500);
        await page.locator(`${jump}[data-active="true"]`).waitFor(); await watch(page, jump);
        await page.locator(jump).click(); await page.locator(`${jump}[data-active="false"]`).waitFor();
      },
      check: async page => {
        const exit = (await seen(page, jump)).find(r => r.active === 'false');
        assert.ok(exit, 'jump-to-latest left after jumping');
        assert.deepEqual({ duration: exit.duration, easing: exit.easing }, { duration: '0.15s', easing: HOUSE }, `jump-to-latest exit: 150ms house curve (got ${exit.duration} ${exit.easing})`);
      },
    });
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const wanted = process.argv.slice(2);
  let broker;
  const h = await startHarness({
    tools: toExecutors([requestInputTool]),
    mcpInteractions(db, ledger) { return broker = createMcpInteractions(db, ledger, { waitMs: 600000 }); },
    runTurn: async ctx => {
      if (ctx.message.payload.text === 'ASK') { await ctx.callTool('request_input', { prompt: 'Which local option?' }); return; }
      ctx.ledger.append(ctx.room.id, ctx.bot.id, 'bot_output', { turnId: ctx.turnId, text: 'Received the message.' });
    },
  });
  h.broker = broker; h.abort = new AbortController();
  try {
    for (const [ticket, run] of Object.entries(SCENARIOS)) if (!wanted.length || wanted.includes(ticket)) await run(h);
  } finally { h.abort.abort(); h.broker?.close(); await h.close(); }
  process.exitCode = report(h.results) ? 0 : 1;
}

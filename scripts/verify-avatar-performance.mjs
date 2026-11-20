// OA-390 real-browser performance: agent avatars in Chromium against a disposable gateway, motion allowed.
// Measures frame pacing, long tasks and main-thread busy time for the animated chat-header avatar at idle,
// scrolling a long transcript of static sender avatars, and dragging the avatar editor.
// Desktop runs unthrottled; phone runs with touch and a 4x CPU slowdown. No live data, provider or model.
// Usage: OPENAG_PLAYWRIGHT_MODULE=<playwright-core> node scripts/verify-avatar-performance.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startHarness } from './verify-rendered-acceptance.mjs';
import { createRoom, addMember } from '../apps/daemon/dist/rooms.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OPENAG_PLAYWRIGHT_MODULE || 'playwright');

const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, cpu: 1, budget: { idleBusy: 0.05, idleP95: 20, scrollP95: 20, dragP95: 20, longTasks: 0 } },
  { name: 'phone-4x', viewport: { width: 390, height: 844 }, mobile: true, cpu: 4, budget: { idleBusy: null, idleP95: 34, scrollP95: 50, dragP95: 50, longTasks: 3 } },
];

/**
 * Record rAF intervals, long tasks and main-thread time while `during` runs for about `ms`.
 * `busy` is page-owned work (script, layout, style). `task` is all main-thread task time, which in headless
 * Chromium also includes CPU raster that a GPU device offloads, so it is reported but not budgeted. CDP durations
 * under CPU throttling are not comparable with unthrottled ones (the same work reports about a third of the time),
 * so throttled profiles budget frames and long tasks only (`idleBusy: null`).
 */
async function measure(page, cdp, ms, during = async () => page.waitForTimeout(ms)) {
  await page.evaluate(() => {
    window.__perf = { frames: [], long: [], stop: false };
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perf.long.push(e.duration); }).observe({ type: 'longtask' });
    let last = performance.now();
    const tick = now => { window.__perf.frames.push(now - last); last = now; if (!window.__perf.stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const page0 = m => m.ScriptDuration + m.LayoutDuration + m.RecalcStyleDuration;
  const m0 = await metrics(), w0 = Date.now();
  await during();
  const m1 = await metrics(), seconds = (Date.now() - w0) / 1000;
  const busy = (page0(m1) - page0(m0)) / seconds, task = (m1.TaskDuration - m0.TaskDuration) / seconds;
  const { frames, long } = await page.evaluate(() => { window.__perf.stop = true; return window.__perf; });
  const sorted = frames.slice(1).sort((a, b) => a - b), pick = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { frames: sorted.length, fps: Math.round(sorted.length / (sorted.reduce((a, b) => a + b, 0) / 1000)), p50: +pick(0.5).toFixed(1), p95: +pick(0.95).toFixed(1), max: +(sorted.at(-1) ?? 0).toFixed(1), longTasks: long.length, longMs: Math.round(long.reduce((a, b) => a + b, 0)), busy: +busy.toFixed(3), task: +task.toFixed(3) };
}

const h = await startHarness();
const { db, ledger } = h.f;
const direct = await h.json('/rooms', 'POST', { id: 'dm-boss', name: 'boss', kind: 'direct', members: ['boss'] });
const dm = direct.room?.id ?? direct.id ?? 'dm-boss';
createRoom(db, { id: 'long', name: 'long', leadBotId: 'boss' }); addMember(db, 'long', 'boss');
for (let i = 1; i <= 150; i++) {
  ledger.append('long', 'user', 'message', { text: `Question ${i}: ` + 'a sentence of context. '.repeat(1 + i % 4) });
  ledger.append('long', 'boss', 'bot_output', { text: `Answer ${i}\n\n- point one\n- point two` });
}
const browser = await chromium.launch({ headless: true });
const rows = [], failures = [];
const check = (profile, scenario, ok, message) => { if (!ok) failures.push(`${profile} ${scenario}: ${message}`); };

for (const p of PROFILES) {
  const open = async hash => {
    const context = await browser.newContext({ viewport: p.viewport, isMobile: !!p.mobile, hasTouch: !!p.mobile, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    await context.addInitScript(token => localStorage.setItem('openag-token', token), h.device);
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(`${h.f.url}/${hash}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2000); // Let startup work finish so idle measures steady state.
    if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    return { context, page, cdp };
  };

  // 1. Idle conversation: the header avatar is the only animated one; sender avatars stay static.
  {
    const { context, page, cdp } = await open(`#/room/${encodeURIComponent(dm)}`);
    const avatars = await page.evaluate(() => ({ animated: document.querySelectorAll('[data-animated="true"]').length, total: document.querySelectorAll('[data-shape]').length }));
    const r = await measure(page, cdp, 5000);
    rows.push({ profile: p.name, scenario: 'idle header avatar', ...r, ...avatars });
    check(p.name, 'idle', avatars.animated >= 1, 'no animated header avatar was rendered, so idle motion was not measured');
    check(p.name, 'idle', p.budget.idleBusy === null || r.busy <= p.budget.idleBusy, `main thread busy ${r.busy} > ${p.budget.idleBusy}`);
    check(p.name, 'idle', r.p95 <= p.budget.idleP95, `p95 frame ${r.p95}ms > ${p.budget.idleP95}ms`);
    check(p.name, 'idle', r.longTasks <= p.budget.longTasks, `${r.longTasks} long tasks`);
    await context.close();
  }

  // 2. Scroll a long transcript of static sender avatars from the latest message upwards.
  {
    const { context, page, cdp } = await open('#/room/long');
    const avatars = await page.evaluate(() => ({ animated: [...document.querySelectorAll('[data-animated="true"]')].filter(e => e.closest('[role="log"]')).length, total: document.querySelectorAll('[role="log"] [data-shape]').length }));
    const scroller = page.locator('[data-slot="message-scroller"]').first();
    const box = await scroller.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const r = await measure(page, cdp, 3000, async () => { for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(50); } });
    rows.push({ profile: p.name, scenario: 'scroll static avatars', ...r, animated: avatars.animated, total: avatars.total });
    check(p.name, 'scroll', avatars.total > 0, 'no sender avatars rendered in the transcript');
    check(p.name, 'scroll', avatars.animated === 0, `${avatars.animated} transcript avatars animate`);
    check(p.name, 'scroll', r.p95 <= p.budget.scrollP95, `p95 frame ${r.p95}ms > ${p.budget.scrollP95}ms`);
    await context.close();
  }

  // 3. Drag the avatar editor view (pointer follow) for about two seconds.
  {
    const { context, page, cdp } = await open(`#/room/${encodeURIComponent(dm)}/panel/settings`);
    await page.getByRole('button', { name: 'Change avatar' }).first().click();
    const view = page.getByLabel(/^Avatar view/); await view.waitFor();
    const b = await view.boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const r = await measure(page, cdp, 2000, async () => {
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (let i = 0; i < 120; i++) { await page.mouse.move(cx + Math.sin(i / 10) * b.width * 0.3, cy + Math.cos(i / 13) * b.height * 0.2); await page.waitForTimeout(16); }
      await page.mouse.up();
    });
    rows.push({ profile: p.name, scenario: 'editor drag', ...r });
    check(p.name, 'drag', r.p95 <= p.budget.dragP95, `p95 frame ${r.p95}ms > ${p.budget.dragP95}ms`);
    check(p.name, 'drag', r.longTasks <= p.budget.longTasks, `${r.longTasks} long tasks`);
    await context.close();
  }
}
await browser.close(); await h.close();
console.table(rows);
if (failures.length) { console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('PASS avatar performance: idle header motion, static transcript avatars and editor drag within budget (Chromium, controlled fixture).');

// Real desk in Chromium; disposable gateway and synthetic history responses. No live data or unit runner.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OPENAG_PLAYWRIGHT_MODULE || 'playwright');
const evidence = new URL('../docs/notes/evidence/oa500/', import.meta.url);
mkdirSync(evidence, { recursive: true });
const child = spawn(process.execPath, ['scripts/verify-reflection-memory.mjs', '--preview'], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const ready = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error('Disposable preview timed out')), 60_000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/PREVIEW (http:\/\/127\.0\.0\.1:\d+) — pair code ([A-Z0-9-]+)/);
      if (match) { clearTimeout(deadline); resolve(match); }
    });
    child.once('exit', code => { clearTimeout(deadline); reject(Error(`Preview exited: ${code}`)); });
    child.stderr.on('data', () => {}); // Controlled failure-path diagnostics are expected in the gateway journey.
  });
  const [, url, code] = ready;
  const response = await fetch(`${url}/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: 'Reflection browser acceptance' }) });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  assert.ok(token);
  browser = await chromium.launch({ headless: true });
  const coverage = [];
  const now = Date.now();
  const aliases = { gmail: 'owner-with-a-long-account-name@example.test', outlook: 'Work account' };
  const outcomes = ['incomplete', 'digest', 'no_new_items', 'quiet', 'unavailable', 'needs_sign_in', 'permission_missing', 'rate_limited', 'running', 'interrupted', 'cancelled', 'unsupported', 'not_checked', 'ping'];
  const runs = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, service: i % 2 ? 'outlook' : 'gmail', accountId: i % 2 ? 'work' : 'personal', startedAt: now - i * 3600000, endedAt: i === 8 ? null : now - i * 3600000 + 2000, status: outcomes[i % outcomes.length], reason: i === 0 ? 'The check was incomplete; its coverage was not advanced' : 'Recorded check outcome', items: i % 3, decisionId: null, fromAt: now - 86400000, untilAt: now - 3600000, evidence: i === 1 ? [{ id: 'evidence-1', version: '1', text: 'A retained source excerpt. <script>untrusted()</script>', reference: 'source-reference-1' }] : [] }));
  const fixture = { revision: 1, enabled: true, checking: false, nextCheckAt: now + 3600000, services: [{ id: 'gmail' }, { id: 'outlook' }], accounts: [{ service: 'gmail', accountId: 'personal', alias: aliases.gmail, status: 'incomplete', reason: runs[0].reason, lastSuccessAt: now - 7200000, coveredUntil: now - 7200000, lastAttemptAt: now }, { service: 'outlook', accountId: 'work', alias: aliases.outlook, status: 'checked', reason: null, lastSuccessAt: now, coveredUntil: now, lastAttemptAt: now }], runs };
  for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', locale: 'en-NZ', timezoneId: 'Pacific/Auckland' });
    await context.addInitScript(({ token, theme }) => { localStorage.setItem('openag-token', token); localStorage.setItem('openag.theme', theme); }, { token, theme });
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/proactive', route => { assert.equal(route.request().method(), 'GET'); return route.fulfill({ json: fixture }); });
    await page.route('**/wake/decisions?*', route => route.fulfill({ json: { decisions: [{ id: 50, ts: now, botId: 'Bot', verdict: 'ping', decision: 'digest', suppressedBy: 'active_hours', reason: 'An alert held until the next brief.', feedback: null }] } }));
    await page.route('**/wake/decisions/50/feedback', route => { writes.push({ method: route.request().method(), body: route.request().postDataJSON() }); return route.fulfill({ json: { id: 50, feedback: 'should_have_pinged' } }); });
    await page.goto(`${url}/#/settings/proactive/history`);
    const history = page.getByRole('region', { name: 'Recent checks', exact: true });
    await history.waitFor();
    assert.equal(await history.getByRole('button', { name: 'View check:', exact: false }).count(), 10);
    assert.equal(await history.getByRole('button', { name: 'Newer', exact: true }).isDisabled(), true);
    await page.screenshot({ path: new URL(`history-${width}-${theme}.png`, evidence).pathname });
    await history.scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`recent-${width}-${theme}.png`, evidence).pathname });
    const trigger = history.getByRole('button', { name: 'View check:', exact: false }).first();
    await trigger.click();
    const sheet = page.getByRole('dialog');
    await sheet.getByText(runs[0].reason, { exact: true }).waitFor();
    await sheet.getByText('Requested window', { exact: true }).waitFor();
    await sheet.getByText('No evidence recorded', { exact: true }).waitFor();
    await page.waitForFunction(() => { const node = document.querySelector('[role=dialog]'); return node && !node.hasAttribute('data-starting-style') && getComputedStyle(node).opacity === '1'; });
    const geometry = await sheet.boundingBox();
    assert.ok(geometry.x >= 0 && geometry.x + geometry.width <= width + 1);
    await page.screenshot({ animations: 'disabled', path: new URL(`detail-${width}-${theme}.png`, evidence).pathname });
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await history.getByRole('button', { name: 'View check:', exact: false }).nth(1).click();
    await sheet.getByText('source-reference-1', { exact: true }).waitFor();
    assert.ok(await sheet.getByText('A retained source excerpt. <script>untrusted()</script>', { exact: true }).isVisible());
    await page.keyboard.press('Escape');
    await history.getByRole('button', { name: 'Older', exact: true }).click();
    await history.getByText('11–20 of 23 checks', { exact: true }).waitFor();
    await history.getByRole('button', { name: 'View check:', exact: false }).first().click();
    await page.keyboard.press('Escape');
    assert.ok(await history.getByText('11–20 of 23 checks', { exact: true }).isVisible());
    await history.getByRole('button', { name: 'Older', exact: true }).click();
    await history.getByText('21–23 of 23 checks', { exact: true }).waitFor();
    assert.equal(await history.getByRole('button', { name: 'View check:', exact: false }).count(), 3);
    assert.equal(await history.getByRole('button', { name: 'Older', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await history.getByText('1–10 of 23 checks', { exact: true }).waitFor();
    const held = page.getByRole('region', { name: 'Held-back alerts', exact: true });
    await held.scrollIntoViewIfNeeded();
    await held.getByRole('button', { name: 'Should have pinged', exact: true }).click();
    await held.getByText('Noted', { exact: true }).waitFor();
    assert.deepEqual(writes, [{ method: 'POST', body: { verdict: 'should_have_pinged' } }]);
    await page.screenshot({ path: new URL(`held-${width}-${theme}.png`, evidence).pathname });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // Empty history and failed refresh keep their own explicit states.
    await page.unroute('**/proactive');
    await page.route('**/proactive', route => route.fulfill({ json: { ...fixture, accounts: [], runs: [] } }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByText('No recent checks', { exact: true }).waitFor();
    await page.unroute('**/proactive');
    await page.route('**/proactive', route => route.fulfill({ status: 503, json: { error: 'History temporarily unavailable' } }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'History temporarily unavailable' }).waitFor();
    assert.deepEqual(errors, []);
    coverage.push({ width, theme, historyPaging: '10/10/3', detailReasonWindowEvidence: true, emptyAndFailureStates: true, escapedUntrustedText: true, noDocumentOverflow: true, escapeFocusRestored: true, feedbackOnlyWrite: true });
    await context.close();
  }
  writeFileSync(new URL('coverage.json', evidence), JSON.stringify(coverage, null, 2) + '\n');
  console.log('PASS Chromium desktop/phone light/dark history, paging, details/evidence, focus, refresh, empty/failure and feedback-only writes.');

} finally {
  await browser?.close();
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  if (child.exitCode === null) await exited;
}

// Real Chromium against a disposable gateway. No unit runner, live data or model/provider calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OPENAG_PLAYWRIGHT_MODULE || 'playwright');
const evidence = new URL('../docs/notes/evidence/oa496/', import.meta.url);
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
  for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ token, theme }) => { localStorage.setItem('openag-token', token); localStorage.setItem('openag.theme', theme); }, { token, theme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/#/settings/proactive/reflection`);
    await page.getByRole('region', { name: 'Recent runs', exact: true }).waitFor();
    await page.getByRole('button', { name: 'View reflection', exact: false }).first().waitFor();
    await page.getByRole('region', { name: 'Recent runs', exact: true }).scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${width}/${theme}: document overflow`);
    await page.screenshot({ path: new URL(`history-${width}-${theme}.png`, evidence).pathname });
    const trigger = page.getByRole('button', { name: 'View reflection', exact: false }).first();
    await trigger.click();
    const sheet = page.getByRole('dialog');
    await sheet.getByText('Prefers tea over coffee', { exact: true }).waitFor();
    assert.ok(await sheet.getByText('Proposed memory notes', { exact: true }).isVisible());
    const geometry = await sheet.boundingBox();
    assert.ok(geometry.x >= 0 && geometry.x + geometry.width <= width + 1);
    await page.screenshot({ path: new URL(`detail-${width}-${theme}.png`, evidence).pathname });
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape restores trigger focus');
    // Exercise read failure and empty/invalid content without changing any retained run.
    await page.route('**/reflection/runs/*', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Full access required' }) }));
    await trigger.click();
    await page.getByRole('alert').filter({ hasText: 'Full access required' }).waitFor();
    await page.keyboard.press('Escape');
    await page.unroute('**/reflection/runs/*');
    for (const proposals of [null, []]) {
      await page.route('**/reflection/runs/*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ botId: 'bot', proposals }) }));
      await trigger.click();
      await page.getByText(proposals === null ? 'No retained detail' : 'Nothing new to keep', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.unroute('**/reflection/runs/*');
    }
    // Retained skill content is rendered as text, with no approval action in this view.
    await page.getByRole('button', { name: 'View reflection', exact: false }).last().click();
    await page.getByText('Proposed skills', { exact: true }).waitFor();
    await page.getByText('1. List wins', { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`skill-${width}-${theme}.png`, evidence).pathname });
    await page.keyboard.press('Escape');
    const status = await (await fetch(`${url}/reflection`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const stateRuns = ['running', 'interrupted'].map((state, i) => ({ ...status.runs[0], id: 900 + i, status: state, finishedAt: state === 'running' ? null : Date.now(), memoryProposals: 0, skillProposals: 0 }));
    await page.route('**/reflection', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...status, running: true, runs: stateRuns }) }));
    await page.getByRole('button', { name: 'Refresh runs', exact: true }).click();
    await page.getByText('Running', { exact: true }).waitFor();
    await page.getByText('Interrupted', { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`states-${width}-${theme}.png`, evidence).pathname });
    await page.unroute('**/reflection');
    await page.route('**/reflection', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...status, runs: [] }) }));
    await page.getByRole('button', { name: 'Refresh runs', exact: true }).click();
    await page.getByText('No runs yet', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    coverage.push({ width, theme, documentOverflow: false, detailWidth: geometry.width, escapeFocusRestored: true, errorAndEmptyStates: true, skillDraft: true, runningInterruptedAndNoRuns: true, pageErrors: errors });
    await context.close();
  }
  writeFileSync(new URL('coverage.json', evidence), JSON.stringify(coverage, null, 2) + '\n');
  console.log('PASS real Chromium desktop/phone light/dark history/details, real proposal read, no overflow, Escape/focus and refused/missing/empty states.');
} finally {
  await browser?.close();
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  if (child.exitCode === null) await exited;
}

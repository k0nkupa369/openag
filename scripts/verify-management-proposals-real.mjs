// Explicit manual gate (OA-347): the real built daemon on a temporary data dir and port, driven through the installed Claude Code
// and Codex subscriptions. Each default bot is asked, in one conversation, to propose an automation and then to pause it; the
// owner token accepts each card. Synthetic local automations only; the live service and its data are never touched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const adapters = ['claude', 'codex'].filter(a => process.argv.includes(`--authorized-${a}`));
if (!adapters.length) throw Error('This manual gate spends real subscription turns: pass --authorized-claude and/or --authorized-codex.');
const root = fileURLToPath(new URL('../', import.meta.url)), load = p => import(root + 'apps/daemon/dist/' + p + '.js');
const dir = mkdtempSync(join(tmpdir(), 'openag-proposals-real-')), token = randomBytes(32).toString('hex'), port = 47000 + Math.floor(Math.random() * 900);

// Seed before the daemon starts: two ACP bots, one conversation each, Claude as the default.
{
  const { openDb } = await load('db/index'), { createBot, createRoom, addMember } = await load('rooms'), { setSetting } = await load('settings');
  const db = openDb(dir);
  createBot(db, { id: 'bot', name: 'Bot', runtime: 'acp', model: 'claude-code', config: {} });
  createBot(db, { id: 'cdx', name: 'Codex Bot', runtime: 'acp', model: 'codex', config: { adapter: 'codex' } });
  for (const [room, bot] of [['chat-claude', 'bot'], ['chat-codex', 'cdx']]) { createRoom(db, { id: room, name: room, leadBotId: bot }); addMember(db, room, bot); }
  setSetting(db, 'defaultBot', { botId: 'bot' });
  db.close();
}

const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? 'en_US.UTF-8', TMPDIR: process.env.TMPDIR ?? '/tmp', OPENAG_DATA: dir, OPENAG_PORT: String(port), OPENAG_TOKEN: token, OPENAG_EMBED: 'off', OPENAG_TZ: 'UTC' };
const daemon = spawn(process.execPath, [root + 'apps/daemon/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
daemon.stdout.on('data', b => { log += b; }); daemon.stderr.on('data', b => { log += b; });
const base = `http://127.0.0.1:${port}`;
const api = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(what, fn, ms = 300000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error(`Timed out waiting for ${what}`); await sleep(1500); }
}

async function turn(room, bot, text) {
  const before = (await api(`/rooms/${room}/events`)).events.length;
  await api(`/rooms/${room}/messages`, 'POST', { text });
  const finished = await until(`${bot} turn in ${room}`, async () => (await api(`/rooms/${room}/events`)).events.slice(before).find(e => e.type === 'turn_finished' && e.actor === bot));
  const events = (await api(`/rooms/${room}/events`)).events.slice(before);
  const reply = events.filter(e => e.type === 'bot_output').map(e => e.payload.text).join('\n').slice(0, 600);
  const calls = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result').map(e => `${e.type}:${e.payload.tool ?? e.payload.toolName ?? ''}`);
  return { status: finished.payload.status, reason: finished.payload.reason ?? null, reply, calls };
}
const proposals = async room => (await api('/approvals?status=pending')).approvals.filter(a => a.roomId === room && a.toolName === 'management_automation');

const results = [];
try {
  await until('daemon', async () => { try { return (await fetch(base + '/health')).ok; } catch { return false; } }, 60000);
  for (const adapter of adapters) {
    const [bot, room] = adapter === 'claude' ? ['bot', 'chat-claude'] : ['cdx', 'chat-codex'];
    await api('/settings/defaultBot', 'PUT', { botId: bot });
    const name = `Inbox check (${adapter})`;
    const first = await turn(room, bot, `Please set up an automation called "${name}" that runs every weekday at 08:00 UTC in this conversation (roomId "${room}") with the prompt "Check my inbox and tell me if anything is urgent". Propose it for my approval.`);
    const [created] = await proposals(room);
    assert.ok(created, `${adapter}: expected a pending proposal. Turn: ${JSON.stringify(first)}`);
    assert.equal(created.botId, 'daemon'); assert.equal(created.turnId, null); assert.equal(created.source, 'management-proposal'); assert.equal(created.payload.action, 'create');
    assert.equal((await api('/automations')).automations.filter(a => a.name === name).length, 0, 'nothing is created before acceptance');
    await api(`/approvals/${created.id}`, 'POST', { kind: 'accept', reviewVersion: created.reviewVersion });
    const automation = await until('automation created', async () => (await api('/automations')).automations.find(a => a.name === name), 30000);
    assert.equal(automation.scheduleCron.replace(/\s+/g, ' ').trim().split(' ').length, 5); assert.equal(automation.enabled, true); assert.equal(automation.roomId, room);

    const second = await turn(room, bot, `Thanks, I accepted it. Now please propose pausing the "${name}" automation (id ${automation.id}).`);
    const [paused] = await proposals(room);
    assert.ok(paused, `${adapter}: expected a second pending proposal. Turn: ${JSON.stringify(second)}`);
    assert.ok(['disable', 'update'].includes(paused.payload.action), `unexpected action ${paused.payload.action}`);
    await api(`/approvals/${paused.id}`, 'POST', { kind: 'accept', reviewVersion: paused.reviewVersion });
    await until('automation paused', async () => (await api('/automations')).automations.find(a => a.id === automation.id)?.enabled === false, 30000);
    await api(`/automations/${automation.id}`, 'DELETE');
    results.push({ adapter, firstTurn: first, createdProposal: { id: created.id, display: created.payload.display }, automation: { id: automation.id, scheduleCron: automation.scheduleCron }, secondTurn: second, pauseProposal: { id: paused.id, action: paused.payload.action } });
    console.log(`PASS ${adapter}: proposed, accepted, then a second proposal in the same conversation paused it`);
  }
} catch (err) {
  console.error('FAIL', err instanceof Error ? err.message : err);
  console.error('daemon log tail:\n' + log.split('\n').slice(-40).join('\n'));
  process.exitCode = 1;
} finally {
  daemon.kill('SIGTERM'); await Promise.race([once(daemon, 'exit'), sleep(15000)]);
  // The ACP session ids prove whether the second call ran in the same adapter session.
  try {
    const { openDb } = await load('db/index'); const db = openDb(dir);
    for (const r of results) {
      const room = r.adapter === 'claude' ? 'chat-claude' : 'chat-codex';
      r.acpSessions = [...new Set(db.prepare("SELECT state_json FROM turns WHERE room_id=? ORDER BY created_at").all(room).map(t => JSON.parse(t.state_json).acpSessionId).filter(Boolean))].length;
    }
    db.close();
  } catch { /* evidence only */ }
  console.log(JSON.stringify({ dataDir: dir, results }, null, 2));
}

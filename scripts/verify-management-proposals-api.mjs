// Explicit manual gate (OA-347): the real built daemon on a temporary data dir and port, with an API default bot on a real
// hosted model. In ONE conversation the bot is asked for each proposal kind in turn (proactive setting, delivery room,
// room create, member removal, direct chat, automation), the owner token accepts each card, and the applied change is checked through the
// API. Last, a standing responsibility is asked for: with no mail source it must be refused, leaving nothing pending.
// Spends real model calls on the provider key in the environment (OPENAI_API_KEY for openai/ models). The live service and
// its data are never touched.
//
//   OPENAI_API_KEY=... node scripts/verify-management-proposals-api.mjs --authorized-api [--model openai/gpt-6-luna]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

if (!process.argv.includes('--authorized-api')) throw Error('This manual gate spends real hosted model calls: pass --authorized-api.');
const at = process.argv.indexOf('--model'), model = at >= 0 ? process.argv[at + 1] : 'openai/gpt-6-luna';
const root = fileURLToPath(new URL('../', import.meta.url)), load = p => import(root + 'apps/daemon/dist/' + p + '.js');
const dir = mkdtempSync(join(tmpdir(), 'openag-proposals-api-')), token = randomBytes(32).toString('hex'), port = 47000 + Math.floor(Math.random() * 900);
const room = 'chat';

{
  const { openDb } = await load('db/index'), { createBot, createRoom, addMember } = await load('rooms'), { setSetting } = await load('settings');
  const db = openDb(dir);
  createBot(db, { id: 'bot', name: 'Bot', runtime: 'api', model, config: {} });
  for (const [id, name] of [['coder', 'Coder'], ['writer', 'Writer']]) createBot(db, { id, name, runtime: 'api', model, config: {} });
  createRoom(db, { id: room, name: 'Chat', leadBotId: 'bot' }); addMember(db, room, 'bot');
  setSetting(db, 'defaultBot', { botId: 'bot' });
  db.close();
}

const keys = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(OPENAI|ANTHROPIC|OPENROUTER|GOOGLE_GENERATIVE_AI)_API_KEY$/.test(k)));
const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? 'en_US.UTF-8', TMPDIR: process.env.TMPDIR ?? '/tmp', OPENAG_DATA: dir, OPENAG_PORT: String(port), OPENAG_TOKEN: token, OPENAG_EMBED: 'off', OPENAG_TZ: 'UTC', ...keys };
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
async function until(what, fn, ms = 180000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error(`Timed out waiting for ${what}`); await sleep(1000); }
}
async function turn(text) {
  const before = (await api(`/rooms/${room}/events`)).events.length;
  await api(`/rooms/${room}/messages`, 'POST', { text });
  const finished = await until('bot turn', async () => (await api(`/rooms/${room}/events`)).events.slice(before).find(e => e.type === 'turn_finished' && e.actor === 'bot'));
  const events = (await api(`/rooms/${room}/events`)).events.slice(before);
  const reply = events.filter(e => e.type === 'bot_output').map(e => e.payload.text).join('\n').slice(0, 500);
  const calls = events.filter(e => e.type === 'tool_call').map(e => e.payload.tool ?? e.payload.toolName ?? '');
  return { status: finished.payload.status, reply, calls };
}
const pending = async () => (await api('/approvals?status=pending')).approvals.filter(a => a.roomId === room && a.source === 'management-proposal');
const settings = async () => (await api('/settings')).settings;
const rooms = async () => (await api('/rooms')).rooms;

/** Ask, expect exactly one new card of `tool`, accept it, then wait for `applied` to hold. */
async function journey(label, text, tool, applied) {
  const t = await turn(text);
  const cards = await pending();
  assert.equal(cards.length, 1, `${label}: expected one pending card. Turn: ${JSON.stringify(t)}`);
  const [card] = cards;
  assert.equal(card.toolName, tool, `${label}: wrong kind. Turn: ${JSON.stringify(t)}`);
  assert.equal(card.botId, 'daemon'); assert.equal(card.turnId, null);
  await api(`/approvals/${card.id}`, 'POST', { kind: 'accept', reviewVersion: card.reviewVersion });
  await until(`${label} applied`, applied, 30000);
  const receipt = (await api(`/approvals/${card.id}`).catch(() => null))?.approval?.receipt ?? null;
  console.log(`PASS ${label}: ${tool} proposed, accepted, applied`);
  return { label, turn: t, card: { id: card.id, sentence: card.payload.sentence, display: card.payload.display }, receipt };
}

const results = [];
try {
  await until('daemon', async () => { try { return (await fetch(base + '/health')).ok; } catch { return false; } }, 60000);

  results.push(await journey('brief', 'Please propose turning on the morning brief at 07:15 on weekdays (Monday to Friday).', 'management_proactive',
    async () => { const b = (await settings()).brief; return b.enabled === true && b.time === '07:15' && JSON.stringify(b.days) === '[1,2,3,4,5]'; }));
  results.push(await journey('create room', 'Thanks, accepted. Now propose creating a room called "Launch plan" with the agents coder and writer, with writer as the lead.', 'management_room',
    async () => (await rooms()).find(r => r.name === 'Launch plan' && r.leadBotId === 'writer' && r.members.slice().sort().join() === 'coder,writer')));
  const launch = (await rooms()).find(r => r.name === 'Launch plan');
  results.push(await journey('delivery room', `Accepted. Next, propose sending proactive messages to that room (roomId "${launch.id}").`, 'management_delivery_room',
    async () => (await settings()).deliveryRoom.roomId === launch.id));
  results.push(await journey('remove member', `Accepted. Now propose removing coder from the "Launch plan" room (roomId "${launch.id}").`, 'management_room',
    async () => (await rooms()).find(r => r.id === launch.id)?.members.join() === 'writer'));
  results.push(await journey('direct chat', 'Accepted. Finally, propose opening a direct chat with coder.', 'management_direct_chat',
    async () => (await rooms()).find(r => r.kind === 'direct' && r.members.join() === 'coder')));

  results.push(await journey('automation', `Accepted. Also propose an automation called "Inbox check" that runs every weekday at 08:00 UTC in this conversation (roomId "${room}") with the prompt "Check my inbox and tell me if anything is urgent".`, 'management_automation',
    async () => (await api('/automations')).automations.find(a => a.name === 'Inbox check' && a.roomId === room && a.enabled)));

  const refused = await turn('One more: propose a standing responsibility called "Invoices" in this conversation for email from billing@example.com with "invoice due" in the subject, asking what is owed and by when.');
  assert.equal((await pending()).length, 0, `responsibility: expected no card without a mail source. Turn: ${JSON.stringify(refused)}`);
  console.log('PASS responsibility: refused without a mail source, nothing pending');
  results.push({ label: 'responsibility refused', turn: refused });
} catch (err) {
  console.error('FAIL', err instanceof Error ? err.message : err);
  console.error('daemon log tail:\n' + log.split('\n').slice(-30).join('\n'));
  process.exitCode = 1;
} finally {
  daemon.kill('SIGTERM'); await Promise.race([once(daemon, 'exit'), sleep(15000)]);
  console.log(JSON.stringify({ model, dataDir: dir, results }, null, 2));
}

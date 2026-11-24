// Manual measurement: the real built daemon on a temporary data dir with one API bot on a real hosted model. Sends the
// same kind of tool-using message several times in one conversation and prints, per model call, the input tokens and
// how many of them the provider served from its prompt cache. Spends a few real model calls on the provider key in the
// environment. The live service and its data are never touched.
//
//   OPENAI_API_KEY=... node scripts/measure-prompt-cache.mjs --authorized-api [--model openai/gpt-6-luna] [--turns 3]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

if (!process.argv.includes('--authorized-api')) throw Error('This measurement spends real hosted model calls: pass --authorized-api.');
const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : fallback; };
const model = arg('--model', 'openai/gpt-6-luna'), turns = Number(arg('--turns', '3'));
const root = fileURLToPath(new URL('../', import.meta.url)), load = p => import(root + 'apps/daemon/dist/' + p + '.js');
const dir = mkdtempSync(join(tmpdir(), 'openag-cache-')), token = randomBytes(32).toString('hex'), port = 47000 + Math.floor(Math.random() * 900);
const { openDb } = await load('db/index'), { createBot, createRoom, addMember } = await load('rooms'), { setSetting } = await load('settings');
{
  const db = openDb(dir);
  createBot(db, { id: 'bot', name: 'Bot', runtime: 'api', model, config: {} });
  createRoom(db, { id: 'chat', name: 'Chat', leadBotId: 'bot' }); addMember(db, 'chat', 'bot');
  setSetting(db, 'defaultBot', { botId: 'bot' });
  db.close();
}
const keys = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(OPENAI|ANTHROPIC|OPENROUTER|GOOGLE_GENERATIVE_AI)_API_KEY$/.test(k)));
const daemon = spawn(process.execPath, [root + 'apps/daemon/dist/main.js'], { env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'en_US.UTF-8', TMPDIR: process.env.TMPDIR ?? '/tmp', OPENAG_DATA: dir, OPENAG_PORT: String(port), OPENAG_TOKEN: token, OPENAG_EMBED: 'off', OPENAG_TZ: 'UTC', ...keys }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; daemon.stdout.on('data', b => { log += b; }); daemon.stderr.on('data', b => { log += b; });
const base = `http://127.0.0.1:${port}`, sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!res.ok) throw Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};
const topics = ['overview', 'proactive', 'memory-skills', 'approvals', 'work'];
try {
  for (let ready = false, end = Date.now() + 60000; !ready; await sleep(500)) { try { ready = (await fetch(base + '/health')).ok; } catch { if (Date.now() > end) throw Error('daemon did not start'); } }
  for (let i = 0; i < turns; i++) {
    const before = (await api('/rooms/chat/events')).events.length;
    await api('/rooms/chat/messages', 'POST', { text: `Use openag_help to read the ${topics[i % topics.length]} topic, then reply in one short sentence naming it.` });
    for (const end = Date.now() + 180000; ; await sleep(1000)) {
      if ((await api('/rooms/chat/events')).events.slice(before).some(e => e.type === 'turn_finished')) break;
      if (Date.now() > end) throw Error('turn timed out');
    }
  }
} catch (err) {
  console.error('FAIL', err instanceof Error ? err.message : err, '\n' + log.split('\n').slice(-20).join('\n'));
  process.exitCode = 1;
} finally {
  daemon.kill('SIGTERM'); await Promise.race([once(daemon, 'exit'), sleep(15000)]);
}
const db = openDb(dir);
const calls = db.prepare(`SELECT json_extract(payload_json,'$.turnId') AS turn, json_extract(payload_json,'$.usage') AS usage FROM events
  WHERE room_id='chat' AND type='request_attempt' AND json_extract(payload_json,'$.status')='returned' ORDER BY id`).all()
  .map(r => ({ turn: r.turn, ...JSON.parse(r.usage ?? '{}') }));
db.close();
const turnIds = [...new Set(calls.map(c => c.turn))];
for (const c of calls) console.log(`turn ${turnIds.indexOf(c.turn) + 1}  input ${c.inputTokens ?? '?'}  cached ${c.cachedInputTokens ?? 0}  output ${c.outputTokens ?? '?'}`);
const input = calls.reduce((s, c) => s + (c.inputTokens ?? 0), 0), cached = calls.reduce((s, c) => s + (c.cachedInputTokens ?? 0), 0);
console.log(JSON.stringify({ model, dataDir: dir, calls: calls.length, input, cached, cachedShare: input ? +(cached / input).toFixed(3) : 0 }));

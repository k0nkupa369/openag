// Room delegation and consultation through editable handles. Real daemon modules from apps/daemon/dist (run the daemon build first).
// Temporary data dirs only; a fake runtime, no model, adapter or network. Standalone check, not a unit test runner.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const load = (p) => import(root + 'apps/daemon/dist/' + p + '.js');
const { openDb } = await load('db/index');
const { createLedger } = await load('ledger');
const { createApprovals } = await load('approvals');
const { createPermissions, permissionReference } = await load('permissions');
const { createBot, createRoom, addMember, getBot, getRoom } = await load('rooms');
const { createRunner } = await load('runtimes/runner');
const { defaultTools } = await load('runtimes/tools');
const { setBotHandle } = await load('handles');
const { parseDelegations, MAX_FANOUT, MAX_HOPS } = await load('delegation');
const { createAgentTools } = await load('tools/agents');
const { consultationInput } = await load('agent-requests');

const dirs = [];
const dbs = [];
const ok = (name) => console.log('ok  ' + name);
const body = (prompt) => prompt.replace(/^[\s\S]*?<\/openag_context>\s*/, '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > end) throw new Error('timed out waiting for ' + label);
    await sleep(20);
  }
}

// A small world: one room "main" with the given members. `w.reply(botId, body)` decides what each fake turn says.
function world(bots, members, lead = 'boss') {
  const dir = mkdtempSync(join(tmpdir(), 'openag-agent-delegation-'));
  dirs.push(dir);
  const db = openDb(dir);
  dbs.push(db);
  const ledger = createLedger(db);
  const approvals = createApprovals(db, ledger);
  const permissions = createPermissions(db, ledger, dir, approvals);
  for (const bot of bots) createBot(db, { id: bot.id, runtime: 'api', config: bot.config ?? {} });
  createRoom(db, { id: 'main', name: 'main', leadBotId: lead });
  for (const id of members) addMember(db, 'main', id);
  const w = { db, ledger, permissions, prompts: [], reply: () => 'ok' };
  const fake = {
    async runTurn(ctx) {
      w.prompts.push({ botId: ctx.bot.id, prompt: ctx.prompt });
      const text = w.reply(ctx.bot.id, body(ctx.prompt));
      ctx.ledger.append(ctx.room.id, ctx.bot.id, 'bot_output', { turnId: ctx.turnId, text });
    },
  };
  w.runner = createRunner({ db, ledger, approvals, permissions, dataDir: dir, runtimes: { api: fake, acp: fake }, tools: defaultTools });
  w.say = (botId, text) => {
    const message = ledger.append('main', 'user', 'message', { text });
    return w.runner.run(getRoom(db, 'main'), getBot(db, botId), message);
  };
  // Delegation routes are the ones carrying delegatedBy; the first target is the stable member id.
  w.routes = (by) => ledger.list('main').filter((e) => e.type === 'route' && e.payload.delegatedBy === by).map((e) => e.payload.targets[0]);
  w.errors = () => ledger.list('main').filter((e) => e.type === 'error').map((e) => e.payload.message);
  w.turnBots = () => db.prepare('SELECT bot_id FROM turns ORDER BY created_at, rowid').all().map((r) => r.bot_id);
  return w;
}

try {
  // 0. The pure parser resolves current and retired handles to stable ids and keeps the self, member, fanout and dedupe checks.
  {
    const members = ['boss', 'coder', 'researcher'];
    const index = new Map([
      ['boss', 'boss'], ['lead-ops', 'boss'], ['builder', 'coder'], ['coder', 'coder'],
      ['analyst', 'researcher'], ['researcher', 'researcher'], ['outsider', 'outsider'], ['stranger', 'outsider'],
    ]);
    const parse = (text) => parseDelegations(text, members, 'boss', index);
    assert.deepEqual(parse('@builder write hi'), [{ target: 'coder', task: 'write hi' }], 'current handle');
    assert.deepEqual(parse('@coder write hi'), [{ target: 'coder', task: 'write hi' }], 'retired handle');
    assert.deepEqual(parse('@ANALYST x'), [{ target: 'researcher', task: 'x' }], 'case-insensitive current handle');
    assert.deepEqual(parse('@lead-ops x\n@boss y'), [], 'self by current and retired handle');
    assert.deepEqual(parse('@stranger x\n@outsider y'), [], 'nonmember by current and retired handle');
    assert.deepEqual(parse('@everyone x\n@ghost y'), [], 'everyone and unknown names');
    assert.deepEqual(parse('@builder a\n@coder dup\n@analyst b'), [
      { target: 'coder', task: 'a' },
      { target: 'researcher', task: 'b' },
    ], 'a second alias of the same member is deduplicated');
    assert.equal(parseDelegations('@coder a\n@researcher b\n@x c\n@y d', ['coder', 'researcher', 'x', 'y'], 'boss').length, MAX_FANOUT, 'no index: ids address members');
    ok('0: parser resolves current and retired handles to ids; self, nonmember, unknown, dedupe and fanout hold');
  }

  // 1. Delegation after a rename, by the new handle, with the roster presenting handles.
  const w = world(
    [{ id: 'boss' }, { id: 'coder' }, { id: 'researcher' }, { id: 'extra' }, { id: 'outsider' }],
    ['boss', 'coder', 'researcher', 'extra'],
  );
  setBotHandle(w.db, w.ledger, 'coder', 'builder');
  setBotHandle(w.db, w.ledger, 'researcher', 'analyst');
  setBotHandle(w.db, w.ledger, 'outsider', 'stranger');
  assert.equal(getBot(w.db, 'coder').id, 'coder', 'the id is immutable across the rename');

  w.reply = (botId, req) => (botId === 'boss' && req === 'A' ? '@builder write hi' : botId === 'boss' ? 'ack' : 'done');
  await w.say('boss', 'A');
  assert.deepEqual(w.routes('boss'), ['coder'], 'the new handle delegates to the stable member id');
  assert.equal(w.ledger.list('main').find((e) => e.type === 'message' && e.payload.delegatedBy === 'boss').payload.text, 'write hi');
  assert.ok(w.turnBots().includes('coder'), 'the renamed member ran its delegated turn');
  assert.deepEqual(w.errors(), [], 'no delegation errors');
  const bossPrompt = w.prompts.find((p) => p.botId === 'boss').prompt;
  assert.ok(bossPrompt.includes('- @builder (coder)'), 'roster shows the current handle for coder');
  assert.ok(bossPrompt.includes('- @analyst (researcher)'), 'roster shows the current handle for researcher');
  assert.ok(!/^- @?coder\b/m.test(bossPrompt), 'the retired handle is not advertised as a roster entry');
  assert.ok(bossPrompt.includes("start a line with the member's @handle"), 'the delegation rule names handles');
  const coderPrompt = w.prompts.find((p) => p.botId === 'coder').prompt;
  assert.ok(coderPrompt.includes('- @builder (coder, you)'), 'a member sees itself marked "you" under its handle');
  ok('1: delegation by new handle reaches the stable id; roster and rule present handles');

  // 2. The retired handle still routes to the same member.
  w.reply = (botId, req) => (botId === 'boss' && req === 'B' ? '@coder second try' : botId === 'boss' ? 'ack' : 'done2');
  const beforeB = w.routes('boss').length;
  await w.say('boss', 'B');
  assert.deepEqual(w.routes('boss').slice(beforeB), ['coder'], 'an old handle routes to the same member');
  ok('2: retired handle routes to the same member id');

  // 3. Nonmembers are refused by current and retired handle; unknown names are ignored.
  const turnsBeforeC = w.turnBots().length;
  w.reply = (botId, req) => (botId === 'boss' && req === 'C' ? '@outsider do it\n@stranger too\n@ghost hi' : 'ack');
  await w.say('boss', 'C');
  assert.deepEqual(w.routes('boss').filter((t) => t === 'outsider'), [], 'a nonmember never receives a delegation');
  assert.equal(w.turnBots().slice(turnsBeforeC).includes('outsider'), false, 'the nonmember never runs');
  ok('3: nonmember reached by current or retired handle is refused; unknown names ignored');

  // 4. Self delegation by new or retired handle is refused after the lead itself is renamed.
  setBotHandle(w.db, w.ledger, 'boss', 'lead-ops');
  w.reply = (botId, req) => (botId === 'boss' && req === 'D' ? '@boss note to self\n@lead-ops again' : 'ack');
  const beforeD = w.routes('boss').length;
  await w.say('boss', 'D');
  assert.deepEqual(w.routes('boss').slice(beforeD), [], 'self by retired and current handle is not delegated');
  const leadPrompt = w.prompts.filter((p) => p.botId === 'boss').at(-1).prompt;
  assert.ok(leadPrompt.includes('- @lead-ops (boss, lead, you)'), 'the lead sees its own handle marked "you"');
  ok('4: self-delegation refused by current and retired handle; lead roster marks "you"');

  // 5. Fanout cap and dedupe across aliases, with the lead still delegating after renames.
  w.reply = (botId, req) => (botId === 'boss' && req === 'E' ? '@builder a\n@coder dup\n@analyst b\n@extra c\n@researcher z' : 'ack');
  const beforeE = w.routes('boss').length;
  await w.say('boss', 'E');
  assert.deepEqual(w.routes('boss').slice(beforeE), ['coder', 'researcher', 'extra'], 'fanout stops at the cap; aliases dedupe');
  assert.equal(w.routes('boss').slice(beforeE).length, MAX_FANOUT);
  ok('5: fanout capped at MAX_FANOUT; current and retired aliases of one member count once');

  // 6. Loop guard with handles: a delegate cannot hand work back to its own delegator, and hops stay bounded.
  const loop = world(
    [{ id: 'boss' }, { id: 'ping', config: { canDelegate: true } }, { id: 'pong', config: { canDelegate: true } }],
    ['boss', 'ping', 'pong'],
  );
  setBotHandle(loop.db, loop.ledger, 'ping', 'ping-ops');
  loop.reply = (botId, req) => {
    if (botId === 'boss') return req === 'F' ? '@ping-ops go' : 'ack';
    if (botId === 'ping') return req === 'go' ? '@pong do it' : '@pong again';
    if (botId === 'pong') return '@ping-ops back';
    return 'ok';
  };
  await loop.say('boss', 'F');
  assert.deepEqual(loop.routes('pong'), [], 'pong cannot delegate back to its delegator, even by the current handle');
  const maxHop = Math.max(0, ...loop.ledger.list('main').filter((e) => e.type === 'route').map((e) => e.payload.hop ?? 0));
  assert.ok(maxHop <= MAX_HOPS, 'hops never exceed MAX_HOPS');
  assert.ok(loop.errors().some((m) => m.startsWith('delegation limit reached')), 'the hop limit still refuses a loop');
  assert.ok(loop.turnBots().length <= 20, 'the turn count stays bounded');
  ok('6: loop guard, delegator exclusion and MAX_HOPS hold with handles');

  // 7. Agent-facing tool descriptions name handles.
  const consult = createAgentTools().find((t) => t.name === 'agent_consult');
  assert.ok(consult.description.includes('@handle from agent_list'), 'agent_consult describes the handle');
  assert.ok(consult.description.includes('retired handle still reaches it'), 'agent_consult describes retired handles');
  assert.ok(consultationInput.shape.agentId.description.includes('@handle'), 'agentId schema names the handle');
  ok('7: agent_consult description and agentId schema name handles');

  // 8. Consultation by a current handle and by a retired one reaches the stable recipient, then completes.
  // Consultations are dispatched when the initiating turn finishes (runner.finishTurn), so each admission is closed the same way.
  const c = world([{ id: 'boss' }, { id: 'researcher' }], ['boss', 'researcher']);
  setBotHandle(c.db, c.ledger, 'researcher', 'analyst');
  if (!c.permissions.active()) c.permissions.adopt('read-only', c.permissions.adoption().reviewVersion, 'owner');
  c.reply = (botId) => (botId === 'researcher' ? 'FINDING' : 'Consultation requested.');
  const own = c.permissions.ensure('boss', 'main');
  const admit = (key, agentId) => {
    const message = c.ledger.append('main', 'user', 'message', { text: 'consult ' + key });
    const turnId = 'turn-' + key;
    const origin = { room: getRoom(c.db, 'main'), message, botId: 'boss', turnId, key: 'consult:' + key, parents: [permissionReference(own)] };
    return c.runner.agentRequests.admit({ agentId, question: 'Summarise the note', context: '' }, origin, 'consultation');
  };
  const consultBy = async (key, agentId) => {
    const admitted = admit(key, agentId);
    c.runner.agentRequests.finishTurn('turn-' + key, true);
    await c.runner.idle();
    return { admitted, final: c.runner.agentRequests.list('main').find((x) => x.id === admitted.id) };
  };

  const byNew = await consultBy('new', 'analyst');
  assert.equal(byNew.admitted.recipientId, 'researcher', 'a current handle admits the stable recipient id');
  assert.equal(byNew.final.status, 'completed', 'consultation by current handle completes');
  assert.equal(byNew.final.delivery, 'delivered', 'its findings are delivered back');
  const byOld = await consultBy('old', 'researcher');
  assert.equal(byOld.admitted.recipientId, 'researcher', 'a retired handle admits the same recipient');
  assert.equal(byOld.final.status, 'completed', 'consultation by retired handle completes');
  assert.throws(() => admit('ghost', 'ghost'), /Agent not found/, 'an unknown handle is refused');
  // The @handle form, as the tool schema describes it, reaches the same recipient: current, retired, and unknown.
  const byAtNew = await consultBy('at-new', '@analyst');
  assert.equal(byAtNew.admitted.recipientId, 'researcher', '@current handle admits the stable recipient id');
  assert.equal(byAtNew.final.status, 'completed', 'consultation by @current handle completes');
  const byAtOld = await consultBy('at-old', '@researcher');
  assert.equal(byAtOld.admitted.recipientId, 'researcher', '@retired handle admits the same recipient');
  assert.equal(byAtOld.final.status, 'completed', 'consultation by @retired handle completes');
  assert.throws(() => admit('at-ghost', '@ghost'), /Agent not found/, 'an unknown @handle is refused');
  assert.throws(() => admit('at-empty', '@'), /Agent not found/, 'a bare @ is refused');
  assert.throws(() => admit('at-self', '@boss'), /targets yourself/, '@ does not bypass the self check');
  // Idempotency keys on the stable recipient, so the same invocation with and without @ is one request.
  const dupMessage = c.ledger.append('main', 'user', 'message', { text: 'consult dup' });
  const dupOrigin = { room: getRoom(c.db, 'main'), message: dupMessage, botId: 'boss', turnId: 'turn-dup', key: 'consult:dup', parents: [permissionReference(own)] };
  const first = c.runner.agentRequests.admit({ agentId: '@analyst', question: 'Summarise the note', context: '' }, dupOrigin, 'consultation');
  const again = c.runner.agentRequests.admit({ agentId: 'analyst', question: 'Summarise the note', context: '' }, dupOrigin, 'consultation');
  assert.equal(again.id, first.id, 'the same invocation with and without @ returns the same request');
  assert.throws(() => c.runner.agentRequests.admit({ agentId: 'researcher', question: 'changed', context: '' }, dupOrigin, 'consultation'), /different content/, 'a changed question under the same key is still refused');
  ok('8: consultation by new, retired, and @-prefixed handle reaches the same id; unknown and self refused; idempotent across @ forms');

  console.log('verify-agent-delegation: all checks passed');
} finally {
  for (const db of dbs) db.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
process.exit(0);

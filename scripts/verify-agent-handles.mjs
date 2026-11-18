// Agent handles: editable @handles over immutable ids. Real daemon modules from apps/daemon/dist (run `pnpm -r build` first).
// Temporary data dirs only; no model, adapter or network. Not a unit test runner.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const load = (p) => import(root + 'apps/daemon/dist/' + p + '.js');
const { openDb } = await load('db/index'), { createLedger } = await load('ledger'), { createAuth } = await load('auth');
const { createApprovals } = await load('approvals'), { createGateway } = await load('gateway');
const rooms = await load('rooms'), { ensureDefaultBot, getDefaultBotId } = await load('defaultbot');
const { createReadiness } = await load('readiness');
const { handleIndex, handleAvailable, setBotHandle, normalizeHandle, HandleError } = await load('handles');
const { resolveTargets, hasExplicitTarget, directTargets } = await load('addressing');
const { AgentRequestError } = await load('agent-requests');
const { createDeskBot } = await load('botcreation');

const dirs = [];
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), 'openag-agent-handles-')); dirs.push(dir); const db = openDb(dir); return { dir, db, ledger: createLedger(db) }; };
const claudeOnly = (pkg) => pkg.includes('claude');
const ok = (name) => console.log('ok  ' + name);
const TOKEN = '[REDACTED:secret]';

try {
  const require=createRequire(root+'apps/daemon/package.json'),{migrate}=await load('db/migrate'),{MIGRATIONS_DIR}=await load('db/index');
  const legacyDir=mkdtempSync(join(tmpdir(),'openag-agent-handles-upgrade-'));dirs.push(legacyDir);const migrations=join(legacyDir,'migrations');mkdirSync(migrations);
  for(const file of readdirSync(MIGRATIONS_DIR))if(parseInt(file,10)<=39)copyFileSync(join(MIGRATIONS_DIR,file),join(migrations,file));
  const legacy=new(require('better-sqlite3'))(':memory:');require('sqlite-vec').load(legacy);migrate(legacy,migrations);
  legacy.prepare("INSERT INTO bots(id,name,runtime,created_at) VALUES('legacy','Legacy agent','api',1)").run();
  rooms.createRoom(legacy,{id:'legacy-room',leadBotId:'legacy'});rooms.addMember(legacy,'legacy-room','legacy');
  const before=legacy.prepare('SELECT * FROM bots').get();migrate(legacy,MIGRATIONS_DIR);
  const after=legacy.prepare('SELECT * FROM bots').get();assert.equal(after.handle,'legacy');delete after.handle;assert.deepEqual(after,before);
  assert.deepEqual(rooms.getRoom(legacy,'legacy-room').members,['legacy']);assert.equal(legacy.prepare('SELECT name FROM schema_version WHERE version=39').get().name,'039_proactive.sql');assert.equal(legacy.pragma('foreign_key_check').length,0);legacy.close();
  ok('upgrade: main schema39 preserves bot fields/membership and applies separate handle/delivery migrations');
  // A. Ids are the first handles; no migration rewrote the existing ids.
  {
    const { db, ledger } = fresh();
    rooms.createBot(db, { id: 'boss', runtime: 'api', model: 'openai/gpt-5' });
    rooms.createBot(db, { id: 'coder', runtime: 'acp', model: 'claude-code' });
    assert.equal(rooms.getBot(db, 'coder').handle, 'coder', 'new bot handle defaults to id');
    assert.equal(handleIndex(db).get('coder'), 'coder');
    ok('A: handles default to ids and index both');

    // B. Rename: id stays, previous handle is reserved to the same bot and still addresses it.
    const room = { id: 'main', leadBotId: 'boss', members: ['boss', 'coder'] };
    rooms.createRoom(db, { id: 'main', name: 'main', leadBotId: 'boss' });
    rooms.addMember(db, 'main', 'boss'); rooms.addMember(db, 'main', 'coder');
    const membersBefore = JSON.stringify(rooms.getRoom(db, 'main').members);
    const { bot, changed } = setBotHandle(db, ledger, 'coder', 'Builder');
    assert.equal(changed, true);
    assert.equal(bot.id, 'coder'); assert.equal(bot.handle, 'builder');
    assert.equal(handleIndex(db).get('builder'), 'coder');
    assert.equal(handleIndex(db).get('coder'), 'coder', 'retired handle still resolves to the same agent');
    assert.equal(JSON.stringify(rooms.getRoom(db, 'main').members), membersBefore, 'membership by id is unchanged');
    assert.equal(getDefaultBotId(db), null);
    ok('B: rename keeps id, membership and retired alias');

    // C. Routing with the index: new handle, retired alias, unknown handle, lead fallback, explicit target.
    const idx = handleIndex(db);
    assert.deepEqual(resolveTargets('@builder ping', room, idx), ['coder']);
    assert.deepEqual(resolveTargets('@coder ping', room, idx), ['coder']);
    assert.deepEqual(resolveTargets('@ghost ping', room, idx), ['boss'], 'unknown handle falls back to the lead');
    assert.equal(hasExplicitTarget('@builder', room, idx), true);
    assert.equal(hasExplicitTarget('@ghost', room, idx), false);
    assert.deepEqual(directTargets('@builder and @boss', room, idx), ['coder', 'boss']);
    assert.throws(() => directTargets('@ghost', room, idx), (e) => e instanceof AgentRequestError && e.status === 400);
    // Without an index, names match ids (existing behaviour of callers that pass none).
    assert.deepEqual(resolveTargets('@coder ping', room), ['coder']);
    ok('C: mentions resolve handles, retired aliases and ids; unknown falls back or refuses');

    // D. Reservation: no other agent may take the retired handle or any reserved name.
    rooms.createBot(db, { id: 'reviewer', runtime: 'acp', model: 'codex' });
    assert.equal(handleAvailable(db, 'coder'), false, 'retired handle is not free');
    assert.equal(handleAvailable(db, 'builder'), false, 'current handle is not free');
    assert.throws(() => setBotHandle(db, ledger, 'reviewer', 'coder'), (e) => e instanceof HandleError && e.status === 409);
    assert.throws(() => setBotHandle(db, ledger, 'reviewer', 'builder'), (e) => e instanceof HandleError && e.status === 409);
    assert.throws(() => setBotHandle(db, ledger, 'reviewer', 'everyone'), (e) => e instanceof HandleError && e.status === 409);
    assert.throws(() => setBotHandle(db, ledger, 'reviewer', 'Bad Name!'), (e) => e instanceof HandleError && e.status === 400);
    assert.throws(() => setBotHandle(db, ledger, 'reviewer', ''), (e) => e instanceof HandleError);
    assert.throws(() => setBotHandle(db, ledger, 'reviewer', 42), (e) => e instanceof HandleError);
    assert.throws(() => setBotHandle(db, ledger, 'ghost', 'free-one'), (e) => e instanceof HandleError && e.status === 404);
    assert.equal(normalizeHandle('  Lead-2 '), 'lead-2', 'trim and lowercase');
    assert.equal(setBotHandle(db, ledger, 'reviewer', 'reviewer').changed, false, 'same handle is a no-op');
    ok('D: taken, retired and reserved handles are refused; invalid input is refused');

    // E. The owner can take back its own retired handle; the handle it leaves becomes reserved to it.
    assert.equal(setBotHandle(db, ledger, 'coder', 'coder').changed, true);
    assert.equal(handleAvailable(db, 'builder'), false, 'builder is now reserved to coder');
    assert.equal(handleIndex(db).get('builder'), 'coder');
    assert.equal(rooms.getBot(db, 'coder').handle, 'coder');
    ok('E: reclaiming a retired handle keeps the previous one reserved to the agent');

    // F. Audit: every change is recorded with the old and new handle.
    const audits = db.prepare("SELECT payload_json FROM events WHERE type = 'config'").all().map((r) => JSON.parse(r.payload_json)).filter((p) => p.action === 'bot_handle_changed');
    assert.equal(audits.length, 2, 'two real changes audited, no-ops not audited');
    assert.deepEqual(audits.map((a) => [a.from, a.to]), [['coder', 'builder'], ['builder', 'coder']]);
    ok('F: changes audited with from/to, no-ops silent');

    // G. Default bot and creation never take a retired handle.
    rooms.createBot(db, { id: 'bot', runtime: 'acp', model: 'claude-code' });
    setBotHandle(db, ledger, 'bot', 'ops');
    assert.equal(handleAvailable(db, 'bot'), false, 'retired default handle is reserved');
    const def = ensureDefaultBot(db, ledger, claudeOnly);
    assert.equal(def?.id, 'bot-2', 'default bot skips the reserved handle');
    assert.equal(getDefaultBotId(db), 'bot-2');
    const models = { creationConfig: () => ({ runtime: 'acp', model: 'claude-code', config: {} }) };
    const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const make = (n, name) => createDeskBot(db, ledger, models, { requestId: uuid(n), name, target: 'claude', model: 'claude-code', snapshotId: 'a'.repeat(64), reasoning: {} }, {}).bot;
    assert.equal(make(1, 'Builder').handle, 'builder-2', 'creation skips a reserved handle');
    assert.equal(make(2, 'Coder').handle, 'coder-2', 'creation skips a held handle');
    assert.equal(make(3, 'Boss').handle, 'boss-2');
    ok('G: default bot and new agents avoid held and reserved handles');

    // H. Stored references keep resolving by id after renames.
    assert.equal(rooms.getBot(db, 'coder').id, 'coder');
    assert.deepEqual(rooms.getRoom(db, 'main').members.sort(), ['boss', 'coder']);
    ok('H: ids, rooms and membership are untouched by handle changes');
  }

  // I. HTTP boundary (real gateway, in-process): owner, full and limited devices.
  {
    const { dir, db, ledger } = fresh();
    rooms.createBot(db, { id: 'boss', runtime: 'api', model: 'openai/gpt-5' });
    rooms.createBot(db, { id: 'coder', runtime: 'acp', model: 'claude-code' });
    const auth = createAuth({ db, ownerToken: TOKEN });
    const app = createGateway({
      db, ledger, approvals: createApprovals(db, ledger), auth, dispatch: () => undefined, deskDir: join(dir, 'no-desk'),
      readiness: createReadiness({ db, ledger, auth, env: {} }),
    });
    const call = (path, method = 'GET', body, token = TOKEN) => app.request(path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const device = async (access) => (await (await call('/devices', 'POST', { name: 'verify ' + access, access })).json()).token;
    const full = await device('full'), limited = await device('limited');
    const put = (id, body, token = TOKEN) => call(`/bots/${id}/handle`, 'PUT', body, token);

    assert.equal((await put('coder', { handle: 'builder' }, limited)).status, 403, 'limited device refused');
    assert.equal(rooms.getBot(db, 'coder').handle, 'coder', 'refused request changes nothing');
    assert.equal((await put('coder', { handle: 'builder', name: 'x' })).status, 400, 'extra fields refused');
    assert.equal((await put('coder', {})).status, 400, 'missing handle refused');
    assert.equal((await put('coder', { handle: 'Bad Name!' })).status, 400, 'invalid handle refused');
    assert.equal((await put('coder', { handle: 'everyone' })).status, 409, 'reserved handle refused');
    assert.equal((await put('ghost', { handle: 'free-one' })).status, 404, 'unknown agent refused');
    assert.equal((await put('boss', { handle: 'coder' })).status, 409, 'an id that is a live handle of another agent is refused');
    const first = await put('coder', { handle: 'Builder' });
    assert.equal(first.status, 200, 'owner renames');
    const body = await first.json();
    assert.equal(body.bot.id, 'coder'); assert.equal(body.bot.handle, 'builder'); assert.equal(body.changed, true);
    assert.equal((await put('boss', { handle: 'coder' })).status, 409, 'retired handle cannot be taken');
    const fullRes = await put('coder', { handle: 'coder-lead' }, full);
    assert.equal(fullRes.status, 200, 'full-access device allowed');
    const list = await (await call('/bots')).json();
    const coderInfo = list.bots.find((b) => b.id === 'coder');
    assert.equal(coderInfo.handle, 'coder-lead'); assert.equal(coderInfo.id, 'coder');
    assert.equal((await put('coder', { handle: 'builder' }, 'wrong')).status, 401, 'unknown token refused');
    ok('I: HTTP route is owner/full only, validates, reserves, and exposes handle in GET /bots');
  }
  assert.throws(()=>normalizeHandle('oag_'+'a'.repeat(43)),/secret/,'token-shaped handles are rejected');
  console.log('verify-agent-handles: all checks passed');
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

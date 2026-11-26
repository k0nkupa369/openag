// Real-adapter acceptance for history_search: temporary data, real Claude and Codex over ACP, two calls in one session.
// Spends about four small subscription turns. Run after `pnpm -r build`. Optional argument: the Codex model (default gpt-6.1-sol).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// USER stays because the CLIs read their login from the macOS Keychain.
for (const key of Object.keys(process.env)) if (!['PATH', 'HOME', 'LANG', 'TMPDIR', 'USER'].includes(key)) delete process.env[key];
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'apps/daemon/package.json');
const load = name => import(root + 'apps/daemon/dist/' + name + '.js');
const { serve } = require('@hono/node-server');
const { openDb } = await load('db/index'), { createLedger } = await load('ledger');
const { createApprovals } = await load('approvals'), { createRunner } = await load('runtimes/runner');
const { createAcpRuntime } = await load('runtimes/acp'), { createMcpAccess } = await load('mcpserver');
const { createBot, createRoom, addMember, getBot, getRoom } = await load('rooms');
const { enabledTools, toExecutors } = await load('tools/registry');
const { createHistorySearchTool } = await load('tools/history');

// A member conversation holds the answers; a conversation the bot is not in holds a decoy for the same words.
const turns = [
  { ask: 'Waiheke ferry', answer: 'HSFIX-AMBER-42', decoy: 'HSFIX-DECOY-99' },
  { ask: 'lighthouse tour', answer: 'HSFIX-TEAL-7' },
];
const dir = mkdtempSync(join(tmpdir(), 'openag-history-acp-'));
let passed = 0;
try {
  for (const adapter of ['claude', 'codex']) {
    const dataDir = join(dir, adapter);
    const db = openDb(dataDir), ledger = createLedger(db), approvals = createApprovals(db, ledger);
    let runner, acp, server;
    try {
      createBot(db, { id: 'bot', runtime: 'acp', config: { adapter, ...(adapter === 'codex' ? { modelConfig: { model: process.argv[2] ?? 'gpt-6.1-sol' } } : {}), instructions: 'This is a local acceptance check. Use only the history_search tool from the daemon-provided openag-* MCP server. No other tools, commands or file operations. Reply with the code you found, or say none was found.' } });
      createBot(db, { id: 'other', runtime: 'acp', config: { adapter } });
      createRoom(db, { id: 'main', leadBotId: 'bot' }); addMember(db, 'main', 'bot');
      createRoom(db, { id: 'travel', leadBotId: 'bot' }); addMember(db, 'travel', 'bot');
      createRoom(db, { id: 'private', leadBotId: 'other' }); addMember(db, 'private', 'other');
      ledger.append('travel', 'user', 'message', { text: 'The Waiheke ferry booking reference is HSFIX-AMBER-42.' });
      ledger.append('travel', 'user', 'message', { text: 'The lighthouse tour code is HSFIX-TEAL-7.' });
      ledger.append('private', 'user', 'message', { text: 'Waiheke ferry backup reference HSFIX-DECOY-99.' });

      const defs = [createHistorySearchTool(db)];
      const offered = () => enabledTools(defs);
      const access = createMcpAccess({ runner: { activeTurn: (...args) => runner.activeTurn(...args) }, dataDir, tools: offered });
      server = serve({ fetch: req => access.handle(req), hostname: '127.0.0.1', port: 0 });
      if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      acp = createAcpRuntime({ dataDir, mcp: { access, baseUrl: () => base, tools: { has: name => offered().some(d => d.name === name), values: () => offered().map(d => d.name) } } });
      runner = createRunner({ db, ledger, approvals, dataDir, runtimes: { acp }, tools: toExecutors(defs) });

      for (const [index, turn] of turns.entries()) {
        const label = `real ${adapter} call ${index + 1}: ${turn.ask}`;
        const before = ledger.list('main', { limit: 500 }).length;
        const message = ledger.append('main', 'user', 'message', { text: `Use history_search to find the ${turn.ask} code I mentioned in another conversation. Reply with the code only.` });
        console.log('starting ' + label);
        let timeout;
        try {
          await Promise.race([
            runner.run(getRoom(db, 'main'), getBot(db, 'bot'), message),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Turn deadline exceeded')), 180000); }),
          ]);
        } finally { clearTimeout(timeout); }
        const events = ledger.list('main', { limit: 500 }).slice(before);
        try {
          const results = events.filter(e => e.type === 'tool_result' && e.payload.tool === 'history_search');
          assert.ok(results.length >= 1, label + ': history_search ran through the gate');
          assert.ok(results.every(e => e.payload.status !== 'denied'), label + ': not refused');
          assert.equal(approvals.listPending().length, 0, label + ': auto-allowed, no approval');
          assert.equal(events.filter(e => e.type === 'turn_finished').at(-1)?.payload.status, 'finished', label + ': finished turn');
          const reply = events.filter(e => e.type === 'bot_output').map(e => e.payload.text ?? '').join('\n');
          assert.ok(reply.includes(turn.answer), label + ': reply cites the member-conversation result');
          if (turn.decoy) assert.ok(!reply.includes(turn.decoy), label + ': non-member conversation stayed hidden');
        } catch (error) {
          console.error(JSON.stringify(events.filter(e => ['bot_output', 'tool_call', 'tool_result', 'error', 'turn_finished'].includes(e.type)).map(e => ({ type: e.type, payload: e.payload }))).slice(0, 4000));
          throw error;
        }
        console.log('ok ' + label);
        passed++;
      }
    } finally {
      runner?.shutdown();
      await acp?.close();
      if (runner) await runner.idle();
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      db.close();
    }
  }
  console.log(`PASS ${passed} real-adapter history_search calls (two per adapter in one session); temporary data only.`);
} finally { rmSync(dir, { recursive: true, force: true }); }

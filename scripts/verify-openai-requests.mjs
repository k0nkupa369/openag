// Controlled check of what the installed OpenAI provider actually sends (OA-335 credit safety): store:false on every request,
// Flex only for background turns with one standard-tier retry when Flex is unavailable, and billing 429s that stop at once.
// Network is intercepted; no live provider, unit runner or service data.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const { createApiRuntime } = await import(root + 'apps/daemon/dist/runtimes/api.js');

const context = (state = {}) => ({ bot: { id: 'controlled', name: 'Controlled', runtime: 'api', model: 'openai/gpt-6-luna', config: {} }, room: { id: 'controlled', members: ['controlled'], leadBotId: 'controlled' }, message: { payload: { text: 'Controlled request' } }, turnId: 'controlled', prompt: 'Controlled request', hostedInput: { instructions: 'Controlled rules', current: 'Controlled request', history: [], data: [] }, state, saveState(p) { Object.assign(this.state, p); }, outputs: [], ledger: { append() {} }, callTool() { throw Error('Unexpected tool'); } });
const ok = () => Response.json({ id: 'resp_fixture', object: 'response', created_at: 1, status: 'completed', model: 'gpt-6-luna', output: [{ id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Done', annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
const tooMany = (code, message) => Response.json({ error: { message, type: code ? 'insufficient_quota' : 'rate_limit_error', ...(code ? { code } : {}) } }, { status: 429 });
// No real waiting: the retry window and backoff run on a fake clock.
const clock = () => { let wall = Date.UTC(2026, 10, 11), mono = 0; return { now: () => wall, elapsed: () => mono, wait: async ms => { wall += ms; mono += ms; } }; };

const originalFetch = globalThis.fetch, originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'controlled-fixture-key';
let bodies = [], reply = () => ok();
globalThis.fetch = async (url, init) => { assert.ok(String(url).startsWith('https://api.openai.com/v1/responses'), 'only the controlled Responses route'); bodies.push(JSON.parse(init.body)); return reply(bodies.length); };
const turn = async state => { bodies = []; const ctx = context(state); const outcome = await createApiRuntime({ tools: [], retry: clock() }).runTurn(ctx).catch(error => ({ thrown: String(error?.message ?? error) })); return { outcome, ctx }; };
try {
  reply = () => ok();
  let { outcome } = await turn();
  assert.equal(outcome.outcome, 'completed');
  assert.equal(bodies.length, 1); assert.equal(bodies[0].store, false); assert.equal(bodies[0].service_tier, undefined);
  console.log('ok interactive turn: store=false, default service tier');

  reply = () => ok();
  ({ outcome } = await turn({ unattended: true }));
  assert.equal(outcome.outcome, 'completed'); assert.equal(bodies.length, 1); assert.equal(bodies[0].service_tier, 'flex'); assert.equal(bodies[0].store, false);
  console.log('ok background turn: service_tier=flex, store=false');

  reply = n => (n === 1 ? tooMany(undefined, 'Resource Unavailable') : ok());
  ({ outcome } = await turn({ unattended: true }));
  assert.equal(outcome.outcome, 'completed'); assert.deepEqual(bodies.map(b => b.service_tier), ['flex', 'auto']);
  console.log('ok Flex unavailable: one immediate retry at service_tier=auto, then completed');

  for (const code of ['credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']) {
    for (const state of [{}, { unattended: true }]) {
      reply = () => tooMany(code, 'Controlled billing stop');
      const result = await turn(state);
      assert.equal(bodies.length, 1, `${code} must not retry or fall back (${state.unattended ? 'background' : 'interactive'})`);
      assert.equal(result.ctx.state.modelRequestOutcome?.reason, 'provider_error', `${code} is terminal`);
    }
  }
  console.log('ok billing 429s (credit, org/project spend, org usage): one request, terminal provider_error, no Flex fallback');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
}
console.log('PASS OpenAI request options and billing stops; intercepted network only.');

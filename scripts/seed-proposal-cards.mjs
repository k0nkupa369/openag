// Seeds a throwaway OpenAg data dir for the rendered proposal-card check: one direct chat with the default bot,
// two existing automations, and three pending management proposals (create, update with changes, delete).
// Synthetic data only. Run from the repo root after `pnpm -r build`: node scripts/seed-proposal-cards.mjs <dataDir>
const dir = process.argv[2];
if (!dir) throw Error('data dir required');
const load = p => import(process.cwd() + '/apps/daemon/dist/' + p + '.js');
const { openDb } = await load('db/index'), { createLedger } = await load('ledger'), { createApprovals } = await load('approvals');
const { createBot, createRoom, addMember } = await load('rooms'), { setSetting } = await load('settings');
const { createAutomation } = await load('automations'), { createManagementProposals } = await load('management-proposals'), { PROPOSAL_KINDS } = await load('tools/management');
const db = openDb(dir), ledger = createLedger(db), approvals = createApprovals(db, ledger);
createBot(db, { id: 'bot', name: 'Bot', runtime: 'api', model: 'openai/gpt-6-luna', config: {} });
createRoom(db, { id: 'chat', name: 'Bot', leadBotId: 'bot', kind: 'direct' }); addMember(db, 'chat', 'bot');
setSetting(db, 'defaultBot', { botId: 'bot' });
ledger.append('chat', 'user', 'message', { text: 'Check my inbox every weekday at 8am and tell me if anything is urgent. Also make the weekly report run on Fridays, and remove the old reminder.' });
ledger.append('chat', 'bot', 'bot_output', { text: 'I have proposed three changes. Nothing changes until you accept each card below; they expire in 24 hours.' });
const weekly = createAutomation(db, 'UTC', { name: 'Weekly report', scheduleCron: '0 9 * * 1', botId: 'bot', roomId: 'chat', prompt: 'Summarise this week' }).automation;
const reminder = createAutomation(db, 'UTC', { name: 'Old reminder', scheduleCron: '0 18 * * *', botId: 'bot', roomId: 'chat', prompt: 'Remind me to stretch' }).automation;
const p = createManagementProposals({ db, ledger, approvals, tz: 'UTC', automations: () => undefined, kinds: PROPOSAL_KINDS });
p.propose('propose_automation', { botId: 'bot', roomId: 'chat' }, { action: 'create', name: 'Inbox check', scheduleCron: '0 8 * * 1-5', roomId: 'chat', prompt: 'Check my inbox and tell me if anything is urgent' });
p.propose('propose_automation', { botId: 'bot', roomId: 'chat' }, { action: 'update', automationId: weekly.id, scheduleCron: '0 16 * * 5', prompt: 'Summarise this week and list open items' });
p.propose('propose_automation', { botId: 'bot', roomId: 'chat' }, { action: 'delete', automationId: reminder.id });
p.dispose();
console.log(JSON.stringify({ pending: approvals.listPending().map(a => ({ id: a.id, action: a.payload.action })) }));
db.close();

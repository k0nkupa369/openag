import { resolveReviewed } from "./approvals.testkit.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createApprovals, type Approvals } from "./approvals.js";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { createManagementProposals, type ManagementProposals } from "./management-proposals.js";
import { MANAGEMENT_RESPONSIBILITY_TOOL } from "./management-responsibilities.js";
import { createResponsibilities, type InvestigationSource, type Responsibilities } from "./responsibilities.js";
import { addMember, createBot, createRoom } from "./rooms.js";
import { PROPOSAL_KINDS } from "./tools/management.js";
import { createWakeFilter } from "./wake.js";

const ctx = { botId: "bot", roomId: "main" };
const proposal = { name: "Invoices", roomId: "main", sender: "Billing@Example.com", topic: "invoice due", question: "What is owed and by when?" };
let dir: string, db: Db, ledger: Ledger, approvals: Approvals, proposals: ManagementProposals, responsibilities: Responsibilities | undefined;

const source = (bindingId = "mail-1"): InvestigationSource => ({ bindingId, resourceIds: ["inbox", "archive"], ready: () => true, async read() { throw Error("not used"); } });
function build(withSource: InvestigationSource | undefined) {
  responsibilities = createResponsibilities({ db, ledger, runner: {} as never, wake: createWakeFilter({ db, ledger, tz: "UTC" }), ...(withSource ? { source: withSource } : {}) });
  proposals?.dispose();
  proposals = createManagementProposals({ db, ledger, approvals, tz: "UTC", automations: () => undefined, responsibilities: () => responsibilities, kinds: PROPOSAL_KINDS });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-responsibility-proposals-"));
  db = openDb(dir);
  createBot(db, { id: "bot", name: "Bot", runtime: "api" });
  createBot(db, { id: "coder", name: "Coder", runtime: "acp" });
  createRoom(db, { id: "main", name: "Main", leadBotId: "bot" }); addMember(db, "main", "bot"); addMember(db, "main", "coder");
  createRoom(db, { id: "side", name: "Side", leadBotId: "coder" }); addMember(db, "side", "coder");
  ledger = createLedger(db);
  approvals = createApprovals(db, ledger);
  build(source());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { proposals.dispose(); vi.restoreAllMocks(); db.close(); rmSync(dir, { recursive: true, force: true }); });

const accept = async (id: string) => { resolveReviewed(approvals, id, { kind: "accept" }); await proposals.idle(); };

test("proposing writes nothing; accept creates the responsibility paused, bound to the daemon's source", async () => {
  const { proposalId, summary } = proposals.propose("propose_responsibility", ctx, proposal);
  expect(summary).toBe('Proposal to add standing responsibility "Invoices".');
  expect(approvals.get(proposalId)?.toolName).toBe(MANAGEMENT_RESPONSIBILITY_TOOL);
  expect(responsibilities!.list()).toHaveLength(0);
  await accept(proposalId);
  expect(responsibilities!.list()).toEqual([expect.objectContaining({ name: "Invoices", enabled: false, botId: "bot", roomId: "main", bindingId: "mail-1", resourceIds: ["inbox"], sender: "billing@example.com" })]);
  expect(ledger.list("_system").map(e => e.payload)).toContainEqual(expect.objectContaining({ action: "responsibility_created", by: `proposal:${proposalId}` }));
});

test("refused with no connected source, an unpermitted resource, an ACP bot or a conversation without the bot", () => {
  expect(() => proposals.propose("propose_responsibility", ctx, { ...proposal, resourceId: "secret-folder" })).toThrow(/not permitted/);
  expect(() => proposals.propose("propose_responsibility", ctx, { ...proposal, botId: "coder" })).toThrow(/API or Ollama/);
  expect(() => proposals.propose("propose_responsibility", ctx, { ...proposal, roomId: "side" })).toThrow(/contains the bot/);
  expect(() => proposals.propose("propose_responsibility", ctx, { ...proposal, sender: "not-an-email" })).toThrow(/sender/);
  build(undefined);
  expect(() => proposals.propose("propose_responsibility", ctx, proposal)).toThrow(/need a connected mail source/);
  expect(approvals.listPending()).toHaveLength(0);
});

test("refused when the connected source changed before accept", async () => {
  const { proposalId } = proposals.propose("propose_responsibility", ctx, proposal);
  build(source("mail-2"));
  await accept(proposalId);
  expect(responsibilities!.list()).toHaveLength(0);
  expect(approvals.receipts.get(proposalId)?.outcome).toBe("not-run");
});

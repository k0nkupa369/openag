import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApprovals } from "../approvals.js";
import { listAutomations } from "../automations.js";
import { createManagementProposals } from "../management-proposals.js";
import { createPermissions, type PermissionPreset } from "../permissions.js";
import { createFirstPartyTools } from "../tools/firstparty.js";
import { PROPOSAL_KINDS } from "../tools/management.js";
import { PROPOSAL_TOOLS } from "../policy.js";
import { type Db, openDb } from "../db/index.js";
import { createLedger } from "../ledger.js";
import { addMember, createBot, createRoom, getBot, getRoom } from "../rooms.js";
import { setSetting } from "../settings.js";
import { createRunner } from "./runner.js";
import { defaultTools } from "./tools.js";
import type { AuthorizeResult, BotRuntime, ToolOutcome } from "./types.js";

// The runner offers propose_automation only to the default bot in an interactive, visible conversation (OA-347).
let dir: string, db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-proposal-gate-"));
  db = openDb(dir);
  createBot(db, { id: "bot", runtime: "api" });
  createBot(db, { id: "coder", runtime: "api" });
  for (const room of ["main", "_heartbeat"]) { createRoom(db, { id: room, leadBotId: "bot" }); addMember(db, room, "bot"); addMember(db, room, "coder"); }
  setSetting(db, "defaultBot", { botId: "bot" });
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

async function attempt(botId: string, roomId: string, meta?: { unattended?: boolean }, tool = "propose_automation"): Promise<AuthorizeResult> {
  let result: AuthorizeResult | undefined;
  const runtime: BotRuntime = { async runTurn(ctx) { result = await ctx.authorize(tool, {}); } };
  const ledger = createLedger(db);
  const runner = createRunner({ db, ledger, approvals: createApprovals(db, ledger), dataDir: dir, runtimes: { api: runtime, acp: runtime }, tools: defaultTools });
  await runner.run(getRoom(db, roomId)!, getBot(db, botId)!, ledger.append(roomId, "user", "message", { text: "propose" }), undefined, meta);
  return result!;
}

test.each([...PROPOSAL_TOOLS])("other bots, background turns and hidden rooms cannot call %s", async (tool) => {
  expect(await attempt("coder", "main", undefined, tool)).toMatchObject({ allowed: false, message: expect.stringMatching(/default bot/) });
  expect(await attempt("bot", "main", { unattended: true }, tool)).toMatchObject({ allowed: false, message: expect.stringMatching(/default bot/) });
  expect(await attempt("bot", "_heartbeat", undefined, tool)).toMatchObject({ allowed: false, message: expect.stringMatching(/default bot/) });
});

test.each(["read-only", "full-access"] as PermissionPreset[])("the default bot proposes without its own review in %s; nothing is written", async (preset) => {
  const ledger = createLedger(db), approvals = createApprovals(db, ledger), permissions = createPermissions(db, ledger, dir, approvals);
  const session = permissions.ensure("bot", "main");
  if (session.preset !== preset) permissions.select("bot", "main", preset, "fixture-owner", session.revision);
  const proposals = createManagementProposals({ db, ledger, approvals, tz: "UTC", automations: () => undefined, kinds: PROPOSAL_KINDS });
  const first = createFirstPartyTools({ db, computer: { capabilities: () => ({ shell: false, view: "none", hosted: false }) } as never, pusher: { status: () => ({ configured: false, enabled: false }) } as never, proposals: () => proposals });
  let outcome: ToolOutcome | undefined;
  const runtime: BotRuntime = { async runTurn(ctx) { outcome = await ctx.callTool("propose_automation", { action: "create", name: "Inbox check", scheduleCron: "0 8 * * 1-5", roomId: "main", prompt: "Check my inbox" }); } };
  const runner = createRunner({ db, ledger, approvals, permissions, dataDir: dir, runtimes: { api: runtime, acp: runtime }, tools: defaultTools, dynamicTools: () => first.executors });
  await runner.run(getRoom(db, "main")!, getBot(db, "bot")!, ledger.append("main", "user", "message", { text: "check my inbox every weekday at 8" }));
  proposals.dispose();
  expect(outcome).toMatchObject({ ok: true, result: { status: "proposed" } });
  const pending = approvals.listPending();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ toolName: "management_automation", source: "management-proposal", roomId: "main", botId: "daemon" });
  expect(listAutomations(db)).toHaveLength(0);
});

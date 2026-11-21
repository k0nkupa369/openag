import { resolveReviewed } from "./approvals.testkit.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApprovals, type Approvals } from "./approvals.js";
import { createAutomationManager, getAutomation, listAutomations, type AutomationManager } from "./automations.js";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { createManagementProposals, MANAGEMENT_PROPOSAL_SOURCE, PROPOSAL_EXPIRY_MS, type ManagementProposals } from "./management-proposals.js";
import { MANAGEMENT_AUTOMATION_TOOL } from "./management-automation.js";
import { PROPOSAL_KINDS } from "./tools/management.js";
import { classify, PROPOSAL_TOOLS } from "./policy.js";
import { MCP_TOOL_NAMES } from "./mcpserver.js";
import { addMember, createBot, createRoom } from "./rooms.js";
import { createScheduler } from "./scheduler.js";
import { createRunner } from "./runtimes/runner.js";
import { defaultTools } from "./runtimes/tools.js";
import { createWakeFilter } from "./wake.js";

const T0 = new Date("2026-10-27T09:00:00Z").getTime();
const create = { action: "create" as const, name: "Inbox check", scheduleCron: "0 8 * * 1-5", roomId: "main", prompt: "Check my inbox" };
const ctx = { botId: "bot", roomId: "main" };

let dir: string, db: Db, ledger: Ledger, approvals: Approvals, manager: AutomationManager, proposals: ManagementProposals, now: number;

function build(expiryMs?: number) {
  return createManagementProposals({ db, ledger, approvals, tz: "UTC", automations: () => manager, kinds: PROPOSAL_KINDS, ...(expiryMs ? { expiryMs } : {}) });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-proposals-"));
  db = openDb(dir);
  createBot(db, { id: "bot", runtime: "api" });
  createRoom(db, { id: "main", leadBotId: "bot" });
  addMember(db, "main", "bot");
  createRoom(db, { id: "side", leadBotId: "bot" });
  addMember(db, "side", "bot");
  now = T0;
  ledger = createLedger(db);
  approvals = createApprovals(db, ledger);
  const runner = createRunner({ db, ledger, approvals, dataDir: dir, runtimes: { api: { async runTurn() {} }, acp: { async runTurn() {} } }, tools: defaultTools });
  manager = createAutomationManager({ db, ledger, runner, scheduler: createScheduler({ now: () => new Date(now) }), wake: createWakeFilter({ db, ledger, tz: "UTC", now: () => new Date(now) }), tz: "UTC", now: () => now });
  proposals = build();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  proposals.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const accept = async (id: string) => { resolveReviewed(approvals, id, { kind: "accept" }); await proposals.idle(); };
const configEvents = () => ledger.list("_system").filter(e => e.type === "config").map(e => e.payload as { action: string; reason?: string });

describe("proposing", () => {
  test("stores a turnless daemon approval in the conversation and changes nothing", () => {
    const result = proposals.propose("propose_automation", ctx, create);
    expect(result.status).toBe("proposed");
    expect(listAutomations(db)).toHaveLength(0);
    const approval = approvals.get(result.proposalId)!;
    expect(approval).toMatchObject({ roomId: "main", botId: "daemon", turnId: null, toolName: MANAGEMENT_AUTOMATION_TOOL, source: MANAGEMENT_PROPOSAL_SOURCE, status: "pending" });
    expect((approval.payload as { display: unknown }).display).toMatchObject({ action: "create", name: "Inbox check", schedule: "0 8 * * 1-5", room: "main", allowApprovals: false });
  });

  test("a direct chat is described as the bot's direct chat, not by its name", () => {
    createRoom(db, { id: "dm", name: "Bot", leadBotId: "bot", kind: "direct" }); addMember(db, "dm", "bot");
    const { proposalId } = proposals.propose("propose_automation", { botId: "bot", roomId: "dm" }, { ...create, roomId: "dm" });
    expect((approvals.get(proposalId)!.payload as { display: { room: string } }).display.room).toBe("its direct chat");
  });

  test("validates like the Automations page", () => {
    expect(() => proposals.propose("propose_automation", ctx, { ...create, scheduleCron: "* * * * *" })).toThrow(/interval|minutes/i);
    expect(() => proposals.propose("propose_automation", ctx, { ...create, roomId: "nowhere" })).toThrow(/room not found/);
    expect(() => proposals.propose("propose_automation", { botId: "bot", roomId: "_heartbeat" }, create)).toThrow(/conversation/);
    expect(listAutomations(db)).toHaveLength(0);
  });

  test("refuses values that redaction would change", () => {
    expect(() => proposals.propose("propose_automation", ctx, { ...create, prompt: "use key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789" })).toThrow(/secret/);
  });

  test("only scheduled conversation automations can be changed", () => {
    const hook = manager.create({ name: "Hook", triggerKind: "webhook", botId: "bot", prompt: "x" }, "owner").automation;
    expect(() => proposals.propose("propose_automation", ctx, { action: "disable", automationId: hook.id })).toThrow(/only scheduled/);
  });

  test("caps pending proposals per conversation", () => {
    for (let i = 0; i < 10; i++) proposals.propose("propose_automation", ctx, { ...create, name: `n${i}` });
    expect(() => proposals.propose("propose_automation", ctx, create)).toThrow(/too many/);
    expect(proposals.propose("propose_automation", { botId: "bot", roomId: "side" }, { ...create, roomId: "side" }).status).toBe("proposed");
  });
});

describe("deciding", () => {
  test("accept applies the stored proposal and finishes the receipt", async () => {
    const { proposalId } = proposals.propose("propose_automation", ctx, create);
    await accept(proposalId);
    const [created] = listAutomations(db);
    expect(created).toMatchObject({ name: "Inbox check", scheduleCron: "0 8 * * 1-5", roomId: "main", botId: "bot", triggerKind: "cron", allowApprovals: false, allowTools: false });
    expect(approvals.receipts.get(proposalId)?.outcome).toBe("completed");
    expect(configEvents().map(e => e.action)).toContain("management_applied");
  });

  test("ignore and expiry change nothing", async () => {
    const ignored = proposals.propose("propose_automation", ctx, create).proposalId;
    resolveReviewed(approvals, ignored, { kind: "ignore" });
    vi.useFakeTimers();
    const short = build(1000);
    const expiring = short.propose("propose_automation", ctx, create).proposalId;
    vi.advanceTimersByTime(1001);
    await proposals.idle(); await short.idle(); short.dispose();
    expect(approvals.get(expiring)?.status).toBe("ignored");
    expect(listAutomations(db)).toHaveLength(0);
  });

  test("update, disable and delete apply to the current automation", async () => {
    const a = manager.create({ ...create, botId: "bot" }, "owner").automation;
    const update = proposals.propose("propose_automation", ctx, { action: "update", automationId: a.id, prompt: "Check my inbox and calendar" });
    const display = (approvals.get(update.proposalId)!.payload as { display: { changes: { field: string }[] } }).display;
    expect(display.changes.map(c => c.field)).toEqual(["prompt"]);
    now += 1000; await accept(update.proposalId);
    expect(getAutomation(db, a.id)?.prompt).toBe("Check my inbox and calendar");
    const disable = proposals.propose("propose_automation", ctx, { action: "disable", automationId: a.id });
    now += 1000; await accept(disable.proposalId);
    expect(getAutomation(db, a.id)?.enabled).toBe(false);
    const remove = proposals.propose("propose_automation", ctx, { action: "delete", automationId: a.id });
    await accept(remove.proposalId);
    expect(getAutomation(db, a.id)).toBeUndefined();
  });

  test("a proposal is refused when its target changed after it was made", async () => {
    const a = manager.create({ ...create, botId: "bot" }, "owner").automation;
    const { proposalId } = proposals.propose("propose_automation", ctx, { action: "update", automationId: a.id, prompt: "new" });
    now += 1000; manager.update(a.id, { name: "Renamed" }, "owner");
    await accept(proposalId);
    expect(getAutomation(db, a.id)).toMatchObject({ name: "Renamed", prompt: "Check my inbox" });
    expect(approvals.receipts.get(proposalId)?.outcome).toBe("not-run");
    expect(configEvents().find(e => e.action === "management_failed")?.reason).toMatch(/changed after/);
  });

  test("a lookalike approval from elsewhere is never applied", async () => {
    const payload = approvals.get(proposals.propose("propose_automation", ctx, create).proposalId)!.payload;
    const forged = approvals.request({ roomId: "main", botId: "bot", turnId: "turn-1", toolName: MANAGEMENT_AUTOMATION_TOOL, toolClass: "act-local", source: MANAGEMENT_PROPOSAL_SOURCE, payload }).approvalId;
    const unsourced = approvals.request({ roomId: "main", botId: "bot", toolName: MANAGEMENT_AUTOMATION_TOOL, toolClass: "act-local", payload }).approvalId;
    await accept(forged); await accept(unsourced);
    expect(listAutomations(db)).toHaveLength(0);
  });

  test("after a restart pending proposals are re-armed or expired", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const fresh = proposals.propose("propose_automation", ctx, create).proposalId;
    vi.setSystemTime(T0 + PROPOSAL_EXPIRY_MS / 2);
    const later = proposals.propose("propose_automation", ctx, { ...create, name: "later" }).proposalId;
    proposals.dispose();
    vi.setSystemTime(T0 + PROPOSAL_EXPIRY_MS + 1);
    proposals = build();
    expect(approvals.get(fresh)?.status).toBe("ignored");
    expect(approvals.get(later)?.status).toBe("pending");
  });
});

describe("kinds", () => {
  test("every kind is a read-class proposal tool the MCP endpoint offers, with its own management_ approval", () => {
    expect(PROPOSAL_KINDS.map(k => k.tool)).toEqual([...PROPOSAL_TOOLS]);
    for (const kind of PROPOSAL_KINDS) {
      expect(classify(kind.tool)).toBe("read");
      expect(MCP_TOOL_NAMES).toContain(kind.tool);
      expect(kind.approvalTool).toMatch(/^management_/);
    }
    expect(new Set(PROPOSAL_KINDS.map(k => k.approvalTool)).size).toBe(PROPOSAL_KINDS.length);
  });

  test("an unknown proposal tool is refused", () => {
    expect(() => proposals.propose("propose_devices", ctx, {})).toThrow(/unknown proposal/);
  });
});

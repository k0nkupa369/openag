import { resolveReviewed } from "./approvals.testkit.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApprovals, type Approvals } from "./approvals.js";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { createManagementProposals, type ManagementProposals } from "./management-proposals.js";
import { MANAGEMENT_DELIVERY_TOOL, MANAGEMENT_PROACTIVE_TOOL } from "./management-settings.js";
import { addMember, createBot, createRoom } from "./rooms.js";
import { getSetting, setSetting } from "./settings.js";
import { PROPOSAL_KINDS } from "./tools/management.js";

const ctx = { botId: "bot", roomId: "main" };
let dir: string, db: Db, ledger: Ledger, approvals: Approvals, proposals: ManagementProposals;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-setting-proposals-"));
  db = openDb(dir);
  createBot(db, { id: "bot", name: "Bot", runtime: "api" });
  createBot(db, { id: "watcher", name: "Watcher", runtime: "api" });
  createRoom(db, { id: "main", name: "Main", leadBotId: "bot" }); addMember(db, "main", "bot");
  createRoom(db, { id: "ops", name: "Ops", leadBotId: "bot" }); addMember(db, "ops", "bot");
  ledger = createLedger(db);
  approvals = createApprovals(db, ledger);
  proposals = createManagementProposals({ db, ledger, approvals, tz: "UTC", automations: () => undefined, kinds: PROPOSAL_KINDS });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { proposals.dispose(); vi.restoreAllMocks(); db.close(); rmSync(dir, { recursive: true, force: true }); });

const accept = async (id: string) => { resolveReviewed(approvals, id, { kind: "accept" }); await proposals.idle(); };
const config = () => ledger.list("_system").filter(e => e.type === "config").map(e => e.payload as Record<string, unknown>);
const display = (id: string) => (approvals.get(id)!.payload as { display: { changes: { field: string; from: string; to: string }[] } }).display;

describe("proactive", () => {
  test("proposing stores a card with before and after, and changes nothing", () => {
    setSetting(db, "heartbeat", { enabled: true, everyMinutes: 180, botId: "watcher", prompt: null });
    const result = proposals.propose("propose_proactive", ctx, { feature: "heartbeat", everyMinutes: 60 });
    expect(result.summary).toBe("Proposal to change the scheduled checks.");
    expect(approvals.get(result.proposalId)).toMatchObject({ toolName: MANAGEMENT_PROACTIVE_TOOL, botId: "daemon", turnId: null, roomId: "main" });
    expect(display(result.proposalId).changes).toEqual([{ field: "Interval", from: "Every 180 minutes", to: "Every 60 minutes" }]);
    expect(getSetting(db, "heartbeat").everyMinutes).toBe(180);
  });

  test("accept writes the setting with the usual audit event; the heartbeat prompt is kept", async () => {
    setSetting(db, "heartbeat", { enabled: false, everyMinutes: 180, botId: "watcher", prompt: "Check my mail" });
    const { proposalId, summary } = proposals.propose("propose_proactive", ctx, { feature: "heartbeat", enabled: true });
    expect(summary).toBe("Proposal to turn on the scheduled checks.");
    await accept(proposalId);
    expect(getSetting(db, "heartbeat")).toEqual({ enabled: true, everyMinutes: 180, botId: "watcher", prompt: "Check my mail" });
    expect(config()).toContainEqual(expect.objectContaining({ action: "setting_changed", key: "heartbeat", by: `proposal:${proposalId}` }));
    expect(approvals.receipts.get(proposalId)?.outcome).toBe("completed");
  });

  test("brief time and days, and reflection bot", async () => {
    const brief = proposals.propose("propose_proactive", ctx, { feature: "brief", time: "08:15", days: [1, 2, 3, 4, 5] }).proposalId;
    expect(display(brief).changes.map(c => c.field)).toEqual(["Time", "Days"]);
    const reflection = proposals.propose("propose_proactive", ctx, { feature: "reflection", enabled: true, botId: "watcher" }).proposalId;
    expect(display(reflection).changes).toContainEqual({ field: "Bot", from: "Default bot", to: "Watcher" });
    await accept(brief); await accept(reflection);
    expect(getSetting(db, "brief")).toMatchObject({ time: "08:15", days: [1, 2, 3, 4, 5] });
    expect(getSetting(db, "reflection")).toMatchObject({ enabled: true, botId: "watcher" });
  });

  test("refuses fields a feature does not take, unknown bots, invalid values and no-op changes", () => {
    expect(() => proposals.propose("propose_proactive", ctx, { feature: "brief", botId: "watcher" })).toThrow(/does not take botId/);
    expect(() => proposals.propose("propose_proactive", ctx, { feature: "heartbeat", prompt: "x" })).toThrow();
    expect(() => proposals.propose("propose_proactive", ctx, { feature: "reflection", botId: "ghost" })).toThrow(/bot not found/);
    expect(() => proposals.propose("propose_proactive", ctx, { feature: "heartbeat", everyMinutes: 1 })).toThrow();
    expect(() => proposals.propose("propose_proactive", ctx, { feature: "brief", enabled: true })).toThrow(/nothing would change/);
    expect(approvals.listPending()).toHaveLength(0);
  });

  test("a proposal is refused when the setting changed after it was made", async () => {
    const { proposalId } = proposals.propose("propose_proactive", ctx, { feature: "brief", time: "09:00" });
    setSetting(db, "brief", { ...getSetting(db, "brief"), enabled: false });
    await accept(proposalId);
    expect(getSetting(db, "brief")).toMatchObject({ enabled: false, time: "07:30" });
    expect(approvals.receipts.get(proposalId)?.outcome).toBe("not-run");
    expect(config().find(e => e.action === "management_failed")?.reason).toMatch(/changed after/);
  });

  test("ignore changes nothing", async () => {
    const { proposalId } = proposals.propose("propose_proactive", ctx, { feature: "reflection", enabled: true });
    resolveReviewed(approvals, proposalId, { kind: "ignore" }); await proposals.idle();
    expect(getSetting(db, "reflection").enabled).toBe(false);
  });
});

describe("delivery room", () => {
  test("propose and accept moves proactive messages to another conversation", async () => {
    const { proposalId, summary } = proposals.propose("propose_delivery_room", ctx, { roomId: "ops" });
    expect(summary).toBe('Proposal to send proactive messages to "Ops".');
    expect(approvals.get(proposalId)?.toolName).toBe(MANAGEMENT_DELIVERY_TOOL);
    expect(display(proposalId).changes).toEqual([{ field: "Delivery", from: "The default bot's direct chat", to: "Ops" }]);
    expect(getSetting(db, "deliveryRoom").roomId).toBeNull();
    await accept(proposalId);
    expect(getSetting(db, "deliveryRoom").roomId).toBe("ops");
    expect(config()).toContainEqual(expect.objectContaining({ action: "setting_changed", key: "deliveryRoom", by: `proposal:${proposalId}` }));
  });

  test("hidden, missing and unchanged destinations are refused", () => {
    createRoom(db, { id: "_heartbeat", leadBotId: "bot" });
    expect(() => proposals.propose("propose_delivery_room", ctx, { roomId: "_heartbeat" })).toThrow(/room not found/);
    expect(() => proposals.propose("propose_delivery_room", ctx, { roomId: "nowhere" })).toThrow(/room not found/);
    expect(() => proposals.propose("propose_delivery_room", ctx, { roomId: null })).toThrow(/already go there/);
  });

  test("refused when the setting changed or the room is gone", async () => {
    const stale = proposals.propose("propose_delivery_room", ctx, { roomId: "ops" }).proposalId;
    setSetting(db, "deliveryRoom", { roomId: "main" });
    await accept(stale);
    expect(getSetting(db, "deliveryRoom").roomId).toBe("main");
    const gone = proposals.propose("propose_delivery_room", ctx, { roomId: "ops" }).proposalId;
    db.prepare("DELETE FROM room_members WHERE room_id = 'ops'").run(); db.prepare("DELETE FROM rooms WHERE id = 'ops'").run();
    await accept(gone);
    expect(getSetting(db, "deliveryRoom").roomId).toBe("main");
    expect(config().filter(e => e.action === "management_failed").map(e => e.reason)).toEqual([expect.stringMatching(/changed after/), expect.stringMatching(/no longer exists/)]);
  });
});

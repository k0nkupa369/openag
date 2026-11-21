import { resolveReviewed } from "./approvals.testkit.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApprovals, type Approvals } from "./approvals.js";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { createManagementProposals, type ManagementProposals } from "./management-proposals.js";
import { MANAGEMENT_DIRECT_CHAT_TOOL, MANAGEMENT_ROOM_TOOL } from "./management-rooms.js";
import { findDirectChat, updateDeskRoom } from "./roomcreation.js";
import { addMember, createBot, createRoom, getRoom, listRooms } from "./rooms.js";
import { PROPOSAL_KINDS } from "./tools/management.js";

const ctx = { botId: "bot", roomId: "main" };
let dir: string, db: Db, ledger: Ledger, approvals: Approvals, proposals: ManagementProposals;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-room-proposals-"));
  db = openDb(dir);
  for (const [id, name] of [["bot", "Bot"], ["coder", "Coder"], ["writer", "Writer"]]) createBot(db, { id: id!, name, runtime: "api" });
  createRoom(db, { id: "main", name: "Main", leadBotId: "bot" }); addMember(db, "main", "bot");
  createRoom(db, { id: "team", name: "Team", leadBotId: "coder" }); for (const id of ["coder", "writer"]) addMember(db, "team", id);
  ledger = createLedger(db);
  approvals = createApprovals(db, ledger);
  proposals = createManagementProposals({ db, ledger, approvals, tz: "UTC", automations: () => undefined, kinds: PROPOSAL_KINDS });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { proposals.dispose(); vi.restoreAllMocks(); db.close(); rmSync(dir, { recursive: true, force: true }); });

const accept = async (id: string) => { resolveReviewed(approvals, id, { kind: "accept" }); await proposals.idle(); };
const config = () => ledger.list("_system").filter(e => e.type === "config").map(e => e.payload as Record<string, unknown>);
const shown = (id: string) => (approvals.get(id)!.payload as { display: { changes: { field: string; from: string; to: string }[]; notes: string[] } }).display;
const failures = () => config().filter(e => e.action === "management_failed").map(e => e.reason);

describe("create", () => {
  test("proposing writes nothing; accept creates the room with its agents and lead", async () => {
    const { proposalId, summary } = proposals.propose("propose_room", ctx, { action: "create", name: "Launch plan", members: ["coder", "writer"], leadBotId: "writer" });
    expect(summary).toBe('Proposal to create room "Launch plan".');
    expect(approvals.get(proposalId)?.toolName).toBe(MANAGEMENT_ROOM_TOOL);
    expect(shown(proposalId).changes).toEqual([{ field: "Name", from: "", to: "Launch plan" }, { field: "Agents", from: "", to: "Coder, Writer" }, { field: "Lead", from: "", to: "Writer" }]);
    expect(getRoom(db, "launch-plan")).toBeUndefined();
    await accept(proposalId);
    expect(getRoom(db, "launch-plan")).toMatchObject({ name: "Launch plan", kind: "room", leadBotId: "writer", members: ["coder", "writer"] });
    expect(config()).toContainEqual(expect.objectContaining({ kind: "room_created", roomId: "launch-plan", by: `proposal:${proposalId}` }));
  });

  test("validates like the new room sheet", () => {
    expect(() => proposals.propose("propose_room", ctx, { action: "create", name: "X", members: ["ghost"] })).toThrow(/known bot ids/);
    expect(() => proposals.propose("propose_room", ctx, { action: "create", name: "X", members: ["coder"], leadBotId: "writer" })).toThrow(/lead must be a member/);
    expect(() => proposals.propose("propose_room", ctx, { action: "create", name: "X" })).toThrow(/needs name and members/);
  });

  test("a taken slug gets a suffix, and an id taken before accept fails without writing", async () => {
    const { proposalId } = proposals.propose("propose_room", ctx, { action: "create", name: "Team", members: ["coder"] });
    const id = (approvals.get(proposalId)!.payload as { room: { id: string } }).room.id;
    expect(id).toMatch(/^team-[0-9a-f]{6}$/);
    createRoom(db, { id, name: "Sneaky", leadBotId: "bot" });
    await accept(proposalId);
    expect(getRoom(db, id)?.name).toBe("Sneaky");
    expect(approvals.receipts.get(proposalId)?.outcome).toBe("failed");
  });
});

describe("update", () => {
  test("add and remove agents and change the lead in one card", async () => {
    const { proposalId } = proposals.propose("propose_room", ctx, { action: "update", roomId: "team", addMembers: ["bot"], removeMembers: ["coder"], leadBotId: "writer" });
    expect(shown(proposalId).changes).toEqual([{ field: "Agents", from: "Coder, Writer", to: "Writer, Bot" }, { field: "Lead", from: "Coder", to: "Writer" }]);
    expect(getRoom(db, "team")?.members).toEqual(["coder", "writer"]);
    await accept(proposalId);
    expect(getRoom(db, "team")).toMatchObject({ leadBotId: "writer", members: ["bot", "writer"] });
    expect(config()).toContainEqual(expect.objectContaining({ action: "room_updated", roomId: "team", removedMembers: ["coder"], addedMembers: ["bot"], by: `proposal:${proposalId}` }));
    expect(ledger.list("team").some(e => e.type === "config" && (e.payload as { action: string }).action === "room_lead_changed")).toBe(true);
  });

  test("removing the lead needs a new lead; the last agent and direct chats cannot be removed", () => {
    expect(() => proposals.propose("propose_room", ctx, { action: "update", roomId: "team", removeMembers: ["coder"] })).toThrow(/choose a new lead/);
    expect(() => proposals.propose("propose_room", ctx, { action: "update", roomId: "main", removeMembers: ["bot"] })).toThrow(/at least one agent/);
    expect(() => proposals.propose("propose_room", ctx, { action: "update", roomId: "team", removeMembers: ["bot"] })).toThrow(/only current members/);
    createRoom(db, { id: "dm", name: "Bot", leadBotId: "bot", kind: "direct" }); addMember(db, "dm", "bot");
    expect(() => proposals.propose("propose_room", ctx, { action: "update", roomId: "dm", addMembers: ["coder"] })).toThrow(/named rooms/);
    expect(() => proposals.propose("propose_room", ctx, { action: "update", roomId: "_heartbeat", name: "x" })).toThrow(/room not found/);
    expect(() => proposals.propose("propose_room", ctx, { action: "update", roomId: "team", name: "Team" })).toThrow(/nothing would change/);
  });

  test("the card warns when removed agents have automations in the room", () => {
    db.prepare("INSERT INTO automations (id, name, schedule_cron, bot_id, room_id, prompt, enabled, created_at, updated_at, trigger_kind, output_mode) VALUES ('a1', 'Daily', '0 8 * * *', 'writer', 'team', 'x', 1, 0, 0, 'cron', 'room')").run();
    const { proposalId } = proposals.propose("propose_room", ctx, { action: "update", roomId: "team", removeMembers: ["writer"] });
    expect(shown(proposalId).notes).toEqual(["1 automation in this room runs as this agent and will stop running."]);
  });

  test("refused when the room changed after the proposal, or is gone", async () => {
    const stale = proposals.propose("propose_room", ctx, { action: "update", roomId: "team", name: "Renamed" }).proposalId;
    updateDeskRoom(db, ledger, "team", { addMembers: ["bot"] });
    await accept(stale);
    expect(getRoom(db, "team")?.name).toBe("Team");
    expect(approvals.receipts.get(stale)?.outcome).toBe("not-run");
    expect(failures()).toEqual([expect.stringMatching(/changed after/)]);
  });
});

describe("direct chat", () => {
  test("accept opens the bot's direct chat; one that exists cannot be proposed", async () => {
    const { proposalId, summary } = proposals.propose("propose_direct_chat", ctx, { botId: "coder" });
    expect(summary).toBe('Proposal to open a direct chat with "Coder".');
    expect(approvals.get(proposalId)?.toolName).toBe(MANAGEMENT_DIRECT_CHAT_TOOL);
    expect(findDirectChat(db, "coder")).toBeUndefined();
    await accept(proposalId);
    expect(findDirectChat(db, "coder")).toMatchObject({ kind: "direct", members: ["coder"] });
    expect(() => proposals.propose("propose_direct_chat", ctx, { botId: "coder" })).toThrow(/already has a direct chat/);
    expect(() => proposals.propose("propose_direct_chat", ctx, { botId: "ghost" })).toThrow(/bot not found/);
  });

  test("accepting twice still leaves one direct chat", async () => {
    const first = proposals.propose("propose_direct_chat", ctx, { botId: "writer" }).proposalId;
    const second = proposals.propose("propose_direct_chat", ctx, { botId: "writer" }).proposalId;
    await accept(first); await accept(second);
    expect(listRooms(db).filter(r => r.kind === "direct" && r.members[0] === "writer")).toHaveLength(1);
  });
});

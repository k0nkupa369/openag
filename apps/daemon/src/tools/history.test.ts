import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApprovals } from "../approvals.js";
import type { Computer } from "../computer.js";
import { type Db, openDb } from "../db/index.js";
import { createLedger, type Ledger } from "../ledger.js";
import { MCP_TOOL_NAMES } from "../mcpserver.js";
import { createPermissions, type PermissionPreset } from "../permissions.js";
import type { Pusher } from "../push.js";
import { addMember, createBot, createRoom, getBot, getRoom } from "../rooms.js";
import { createRunner, type TurnMeta } from "../runtimes/runner.js";
import type { BotRuntime, ToolOutcome } from "../runtimes/types.js";
import { createFirstPartyTools } from "./firstparty.js";
import { defaultTools } from "./index.js";

let dir: string;
let db: Db;
let ledger: Ledger;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-history-tool-"));
  db = openDb(dir);
  ledger = createLedger(db);
  for (const id of ["boss", "other"]) createBot(db, { id, runtime: "api" });
  createRoom(db, { id: "main", name: "Main", leadBotId: "boss" });
  addMember(db, "main", "boss");
  createRoom(db, { id: "dm-other", name: "Other", leadBotId: "other", kind: "direct" });
  addMember(db, "dm-other", "other");
  createRoom(db, { id: "_heartbeat", leadBotId: "boss" });
  addMember(db, "_heartbeat", "boss");
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

interface SearchResult { untrusted: boolean; notice: string; results: { eventId: number; conversation: { id: string; title: string }; speaker: string; time: string; snippet: string }[] }

/** Runs one boss turn in `main` that calls history_search with `args`, through the real runner and gate. */
async function searchAsBoss(args: unknown, meta?: TurnMeta, preset: PermissionPreset = "workspace-write"): Promise<{ outcome: ToolOutcome; pending: number }> {
  let outcome: ToolOutcome | undefined;
  const runtime: BotRuntime = { async runTurn(ctx) { outcome = await ctx.callTool("history_search", args); } };
  const approvals = createApprovals(db, ledger);
  const permissions = createPermissions(db, ledger, dir, approvals);
  const current = permissions.ensure("boss", "main");
  if (current.preset !== preset) permissions.select("boss", "main", preset, "fixture-owner", current.revision);
  const firstParty = createFirstPartyTools({ db, computer: {} as Computer, pusher: { status: () => ({ configured: false, enabled: false }) } as unknown as Pusher });
  const runner = createRunner({ db, ledger, approvals, permissions, dataDir: dir, runtimes: { api: runtime, acp: runtime }, tools: defaultTools, dynamicTools: () => firstParty.executors });
  const message = ledger.append("main", "user", "message", { text: "go" });
  await runner.run(getRoom(db, "main")!, getBot(db, "boss")!, message, undefined, meta);
  return { outcome: outcome!, pending: approvals.listPending().length };
}

describe("history_search tool", () => {
  test("finds messages in the agent's own conversations, cited by conversation, speaker and time, as untrusted data", async () => {
    const said = ledger.append("main", "user", "message", { text: "We picked the walnut finish." });
    const { outcome, pending } = await searchAsBoss({ query: "walnut" });
    expect(pending).toBe(0);
    expect(outcome.ok).toBe(true);
    const result = (outcome as { result: SearchResult }).result;
    expect(result.untrusted).toBe(true);
    expect(result.results).toEqual([{ eventId: said.id, conversation: { id: "main", title: "Main" }, speaker: "user", time: new Date(said.ts).toISOString(), snippet: "We picked the walnut finish." }]);
  });

  test("never returns another agent's direct chat or hidden conversations", async () => {
    ledger.append("dm-other", "user", "message", { text: "private walnut note" });
    ledger.append("_heartbeat", "boss", "bot_output", { turnId: "t", text: "walnut from heartbeat" });
    const { outcome } = await searchAsBoss({ query: "walnut" });
    expect((outcome as { result: SearchResult }).result.results).toEqual([]);
    const narrowed = await searchAsBoss({ query: "walnut", conversation: "dm-other" });
    expect((narrowed.outcome as { result: SearchResult }).result.results).toEqual([]);
  });

  test("membership is read at call time", async () => {
    ledger.append("dm-other", "user", "message", { text: "shared walnut plan" });
    addMember(db, "dm-other", "boss");
    const { outcome } = await searchAsBoss({ query: "walnut" });
    expect((outcome as { result: SearchResult }).result.results.map((r) => r.conversation.id)).toEqual(["dm-other"]);
  });

  test.each<[string, TurnMeta | undefined, PermissionPreset]>([
    ["an unattended turn", { unattended: true }, "workspace-write"],
    ["an offline unattended turn", { unattended: true, noNetwork: true }, "workspace-write"],
    ["a Read Only session", undefined, "read-only"],
  ])("is an auto-allowed read in %s", async (_label, meta, preset) => {
    ledger.append("main", "user", "message", { text: "walnut again" });
    const { outcome, pending } = await searchAsBoss({ query: "walnut" }, meta, preset);
    expect(pending).toBe(0);
    expect(outcome).toMatchObject({ ok: true });
  });

  test("is offered to ACP bots over the bot-facing MCP list", () => {
    expect((MCP_TOOL_NAMES as readonly string[]).includes("history_search")).toBe(true);
  });
});

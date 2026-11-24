import { resolveReviewed } from "../approvals.testkit.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApprovals } from "../approvals.js";
import { type Db, openDb } from "../db/index.js";
import { createLedger } from "../ledger.js";
import { createPermissions } from "../permissions.js";
import { addMember, createBot, createRoom, getBot, getRoom } from "../rooms.js";
import { buildMastraTools, createApiRuntime } from "./api.js";
import { createBraveTool } from "../tools/brave.js";
import { writeFileTool } from "../tools/files.js";
import type { ToolDef } from "../tools/registry.js";
import { z } from "zod";
import { createRunner } from "./runner.js";
import { botWorkDir, defaultTools, writeWorkFile } from "./tools.js";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

// ai's MockLanguageModelV3 is a valid LanguageModelV3 at runtime (Mastra resolves it), but its doGenerate typing does not
// line up with Mastra's MastraLanguageModelV3 structural type, so it is cast once here.
const asRuntimeModel = (m: MockLanguageModelV3) => m as unknown as NonNullable<Parameters<typeof createApiRuntime>[0]>["model"];

/** First model call requests write_file(args); the second answers with `finalText`. */
function scriptedModel(args: unknown, finalText = "done") {
  let calls = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      calls++;
      if (calls === 1) {
        return {
          content: [{ type: "tool-call" as const, toolCallId: "c1", toolName: "write_file", input: JSON.stringify(args) }],
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage,
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: finalText }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage,
        warnings: [],
      };
    },
  });
  return { model, calls: () => calls };
}

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-api-"));
  db = openDb(dir);
  createBot(db, { id: "boss", runtime: "api" });
  createRoom(db, { id: "main", leadBotId: "boss" });
  addMember(db, "main", "boss");
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function harness(model: MockLanguageModelV3) {
  const ledger = createLedger(db);
  const approvals = createApprovals(db, ledger);
  // Fresh installs default to Workspace Write; these tests exercise the review path, so use Read Only.
  const permissions = createPermissions(db, ledger, dir, approvals);
  const current = permissions.ensure("boss", "main");
  if (current.preset !== "read-only") permissions.select("boss", "main", "read-only", "fixture-owner", current.revision);
  const runner = createRunner({
    db,
    ledger,
    approvals,
    permissions,
    dataDir: dir,
    runtimes: { api: createApiRuntime({ model: asRuntimeModel(model) }) },
    tools: defaultTools,
  });
  const message = ledger.append("main", "user", "message", { text: "make hello.txt" });
  const turn = runner.run(getRoom(db, "main")!, getBot(db, "boss")!, message);
  return { ledger, approvals, turn };
}

async function pendingApproval(approvals: ReturnType<typeof createApprovals>) {
  for (let i = 0; i < 200; i++) {
    const [first] = approvals.listPending();
    if (first) return first;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("no approval appeared");
}

test("tool call -> approval pending -> accept -> file written -> turn_finished", async () => {
  const { model, calls } = scriptedModel({ path: "hello.txt", content: "hi" });
  const { ledger, approvals, turn } = harness(model);
  const pending = await pendingApproval(approvals);
  expect(pending).toMatchObject({ toolName: "write_file", toolClass: "act-local", botId: "boss" });
  // Not written while pending.
  expect(existsSync(join(botWorkDir(dir, "boss"), "hello.txt"))).toBe(false);

  resolveReviewed(approvals, pending.id, { kind: "accept" });
  await turn;

  expect(readFileSync(join(botWorkDir(dir, "boss"), "hello.txt"), "utf8")).toBe("hi");
  expect(calls()).toBe(2);
  const types = ledger.list("main").filter((e) => e.type !== "work_updated" && !e.type.startsWith("request_")).map((e) => e.type);
  expect(types).toEqual([
    "message",
    "turn_started",
    "tool_call",
    "approval_requested",
    "receipt_updated",
    "approval_decided",
    "receipt_updated",
    "receipt_updated",
    "tool_result",
    "model_report",
    "model_report",
    "bot_output",
    "turn_finished",
  ]);
  expect(db.prepare("SELECT status FROM turns").get()).toEqual({ status: "finished" });
});

test("edit changes content at the reviewed target and refuses target changes", async () => {
  const { model } = scriptedModel({ path: "a.txt", content: "x" });
  const { approvals, turn } = harness(model);
  const pending = await pendingApproval(approvals);
  expect(() => resolveReviewed(approvals, pending.id, { kind: "edit", payload: { path: "b.txt", content: "edited" } })).toThrow(/edited target changed/);
  resolveReviewed(approvals, pending.id, { kind: "edit", payload: { path: "a.txt", content: "edited" } });
  await turn;
  expect(readFileSync(join(botWorkDir(dir, "boss"), "a.txt"), "utf8")).toBe("edited");
  expect(existsSync(join(botWorkDir(dir, "boss"), "b.txt"))).toBe(false);
});

test("ignore and respond do not run the tool, and the turn still finishes", async () => {
  for (const decision of [{ kind: "ignore" as const }, { kind: "respond" as const, text: "no thanks" }]) {
    const { model } = scriptedModel({ path: "nope.txt", content: "x" });
    const { ledger, approvals, turn } = harness(model);
    resolveReviewed(approvals, (await pendingApproval(approvals)).id, decision);
    await turn;
    expect(existsSync(join(botWorkDir(dir, "boss"), "nope.txt"))).toBe(false);
    expect(ledger.list("main").filter(e => e.type !== "work_updated").at(-1)?.type).toBe("turn_finished");
  }
});

test("path escape (../x) is rejected before requesting approval", async () => {
  const { model } = scriptedModel({ path: "../x", content: "evil" });
  const { ledger, approvals, turn } = harness(model);
  await turn;
  expect(approvals.listPending()).toEqual([]);
  expect(existsSync(join(dir, "bots", "boss", "x"))).toBe(false);
  const result = ledger.list("main").find((e) => e.type === "tool_result")!.payload as { ok: boolean; message: string };
  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/escapes/);
});

test("writeWorkFile rejects escapes, absolute paths and empty paths", () => {
  expect(() => writeWorkFile(dir, "boss", "../x", "c")).toThrow(/escapes/);
  expect(() => writeWorkFile(dir, "boss", "a/../../x", "c")).toThrow(/escapes/);
  expect(() => writeWorkFile(dir, "boss", "/etc/passwd", "c")).toThrow(/escapes/);
  expect(() => writeWorkFile(dir, "boss", "", "c")).toThrow();
  expect(() => writeWorkFile(dir, "boss", ".", "c")).toThrow(/escapes/);
  writeWorkFile(dir, "boss", "sub/ok.txt", "fine");
  expect(readFileSync(join(botWorkDir(dir, "boss"), "sub/ok.txt"), "utf8")).toBe("fine");
});

test("a missing model fails the turn with an error event, not a crash", async () => {
  const ledger = createLedger(db);
  const approvals = createApprovals(db, ledger);
  const prev = process.env.OPENAG_BOSS_MODEL;
  delete process.env.OPENAG_BOSS_MODEL;
  try {
    const runner = createRunner({ db, ledger, approvals, dataDir: dir, runtimes: { api: createApiRuntime() }, tools: defaultTools });
    const message = ledger.append("main", "user", "message", { text: "hi" });
    await runner.run(getRoom(db, "main")!, getBot(db, "boss")!, message);
  } finally {
    if (prev !== undefined) process.env.OPENAG_BOSS_MODEL = prev;
  }
  const types = ledger.list("main").filter((e) => e.type !== "work_updated" && !e.type.startsWith("request_")).map((e) => e.type);
  expect(types).toContain("error");
  expect(types.at(-1)).toBe("turn_finished");
  expect(db.prepare("SELECT status FROM turns").get()).toEqual({ status: "failed" });
});

test("writes through a symlink that points outside the work dir are rejected", () => {
  const outside = mkdtempSync(join(tmpdir(), "openag-outside-"));
  try {
    mkdirSync(botWorkDir(dir, "boss"), { recursive: true });
    symlinkSync(outside, join(botWorkDir(dir, "boss"), "link"));
    expect(() => writeWorkFile(dir, "boss", "link/pwned.txt", "x")).toThrow(/symlink/);
    expect(existsSync(join(outside, "pwned.txt"))).toBe(false);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("brave_search is only exposed to the agent when enabled", () => {
  const ctx = { state: {}, saveState(patch: Record<string,unknown>){Object.assign(this.state,patch);}, callTool: async () => ({ ok: true as const, result: null }) };
  const off = buildMastraTools(ctx, [writeFileTool, createBraveTool({ apiKey: () => undefined })]);
  expect(Object.keys(off)).toEqual(["write_file"]);
  const on = buildMastraTools(ctx, [writeFileTool, createBraveTool({ apiKey: () => "k" })]);
  expect(Object.keys(on).sort()).toEqual(["brave_search", "write_file"]);
});

test("an isolated turn offers the model no tools, so large tool schemas cannot refuse it", async () => {
  const seen: unknown[] = [];
  const model = new MockLanguageModelV3({
    doGenerate: async (params) => {
      seen.push(params.tools ?? []);
      return { content: [{ type: "text" as const, text: "{\"verdict\":\"silent\"}" }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] };
    },
  });
  const huge: ToolDef = { name: "huge", class: "read", description: "x".repeat(70_000), input: z.object({}), async execute() { return {}; } };
  const ledger = createLedger(db);
  const approvals = createApprovals(db, ledger);
  const permissions = createPermissions(db, ledger, dir, approvals);
  const runner = createRunner({ db, ledger, approvals, permissions, dataDir: dir, runtimes: { api: createApiRuntime({ model: asRuntimeModel(model), tools: [huge] }) }, tools: defaultTools });
  const message = ledger.append("main", "user", "message", { text: "assess these excerpts" });
  await runner.run(getRoom(db, "main")!, getBot(db, "boss")!, message, undefined, { unattended: true, isolated: true, noIndex: true });

  expect(seen).toEqual([[]]);
  expect(ledger.list("main").find((e) => e.type === "turn_finished")?.payload).toMatchObject({ status: "finished" });
});

test("a withheld tool is found through search, then called through the gate in the same turn", async () => {
  const seen: string[][] = [];
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (params) => {
      seen.push((params.tools ?? []).map((t) => t.name).sort());
      step++;
      const content = step === 1 ? [{ type: "tool-call" as const, toolCallId: "s1", toolName: "tool_search", input: JSON.stringify({ query: "list files" }) }]
        : step === 2 ? [{ type: "tool-call" as const, toolCallId: "c1", toolName: "list_files", input: JSON.stringify({ path: "." }) }]
        : [{ type: "text" as const, text: "done" }];
      return { content, finishReason: step < 3 ? { unified: "tool-calls" as const, raw: "tool_calls" } : { unified: "stop" as const, raw: "stop" }, usage, warnings: [] };
    },
  });
  const ledger = createLedger(db);
  const approvals = createApprovals(db, ledger);
  const runner = createRunner({ db, ledger, approvals, dataDir: dir, tools: defaultTools,
    runtimes: { api: createApiRuntime({ model: asRuntimeModel(model), directTools: new Set(["read_file"]) }) } });
  await runner.run(getRoom(db, "main")!, getBot(db, "boss")!, ledger.append("main", "user", "message", { text: "what files are there?" }));
  expect(seen[0]).toContain("read_file");
  expect(seen[0]).toContain("tool_search");
  expect(seen[0]).not.toContain("list_files");
  expect(seen[1]).toContain("list_files");
  const calls = ledger.list("main").filter((e) => e.type === "tool_call").map((e) => (e.payload as { tool?: string }).tool);
  expect(calls).toEqual(["list_files"]);
  expect(ledger.list("main").some((e) => e.type === "tool_result")).toBe(true);
});

test("an MCP tool found through search is offered on the next step", async () => {
  const seen: string[][] = [];
  let step = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (params) => {
      seen.push((params.tools ?? []).map((t) => t.name).sort());
      step++;
      const content = step === 1 ? [{ type: "tool-call" as const, toolCallId: "s1", toolName: "tool_search", input: JSON.stringify({ query: "notion memory search" }) }]
        : [{ type: "text" as const, text: "done" }];
      return { content, finishReason: step < 2 ? { unified: "tool-calls" as const, raw: "tool_calls" } : { unified: "stop" as const, raw: "stop" }, usage, warnings: [] };
    },
  });
  // MCP tools are named mcp.<server>.<tool>; the request carries them with dots replaced, as providers require.
  const notion: ToolDef = { name: "mcp.notion.notion-memory-search", class: "read", description: "Search the user's Notion Memory.", input: z.object({ query: z.string() }), async execute() { return {}; } };
  const ledger = createLedger(db);
  const approvals = createApprovals(db, ledger);
  const runner = createRunner({ db, ledger, approvals, dataDir: dir, tools: defaultTools,
    runtimes: { api: createApiRuntime({ model: asRuntimeModel(model), directTools: new Set(["read_file"]), toolDefs: () => [notion] }) } });
  await runner.run(getRoom(db, "main")!, getBot(db, "boss")!, ledger.append("main", "user", "message", { text: "what does my notion memory say?" }));
  expect(seen[0]).not.toContain("mcp_notion_notion-memory-search");
  expect(seen[1]).toContain("mcp_notion_notion-memory-search");
});

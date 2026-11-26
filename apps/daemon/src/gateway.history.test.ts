import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApprovals } from "./approvals.js";
import { createAuth } from "./auth.js";
import { type Db, openDb } from "./db/index.js";
import { createGateway } from "./gateway.js";
import { createLedger, type Ledger } from "./ledger.js";
import { addMember, createBot, createRoom } from "./rooms.js";

const OWNER = "owner-test-token";
const h = (t: string) => ({ authorization: `Bearer ${t}` });
let dir: string;
let db: Db;
let ledger: Ledger;
let app: ReturnType<typeof createGateway>;
let auth: ReturnType<typeof createAuth>;

interface Hit { eventId: number; roomId: string; roomTitle: string; actor: string; ts: number; snippet: string; highlights: [number, number][] }
const search = async (query: string, token = OWNER) => {
  const res = await app.request(`/history/search?${query}`, { headers: h(token) });
  return { status: res.status, body: (await res.json()) as { results: Hit[] } };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-gw-history-"));
  db = openDb(dir);
  createBot(db, { id: "coder", runtime: "api" });
  createRoom(db, { id: "ops", name: "Operations", leadBotId: "coder" });
  addMember(db, "ops", "coder");
  ledger = createLedger(db);
  auth = createAuth({ db, ownerToken: OWNER });
  app = createGateway({ db, ledger, approvals: createApprovals(db, ledger), auth, dispatch: () => undefined, deskDir: join(dir, "x"), dataDir: dir });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /history/search", () => {
  test("finds a message by a word it contains, with its conversation, speaker and a highlighted snippet", async () => {
    ledger.append("ops", "user", "message", { text: "We decided the backup mirror goes to the NAS." });
    const reply = ledger.append("ops", "coder", "bot_output", { turnId: "t1", text: "Noted: mirror to the NAS weekly." });
    ledger.append("ops", "user", "message", { text: "Unrelated chatter about lunch." });

    const { status, body } = await search("q=mirror");
    expect(status).toBe(200);
    expect(body.results).toHaveLength(2);
    const agent = body.results.find((r) => r.eventId === reply.id)!;
    expect(agent).toMatchObject({ roomId: "ops", roomTitle: "Operations", actor: "coder", ts: reply.ts });
    expect(agent.snippet).toContain("mirror to the NAS");
    const [start, end] = agent.highlights[0]!;
    expect(agent.snippet.slice(start, end)).toBe("mirror");
  });

  test("hidden `_` rooms never match; a room filter narrows; a Limited device sees the same conversations as GET /rooms", async () => {
    createRoom(db, { id: "home", name: "Home" });
    ledger.append("ops", "user", "message", { text: "kiwi in ops" });
    ledger.append("home", "user", "message", { text: "kiwi at home" });
    ledger.append("_heartbeat", "coder", "bot_output", { turnId: "t", text: "kiwi from heartbeat" });
    ledger.append("_reflection", "coder", "message", { text: "kiwi from reflection" });
    const phone = auth.createDevice("phone");
    const all = await search("q=kiwi", phone.token);
    expect(all.status).toBe(200);
    expect(all.body.results.map((r) => r.roomId).sort()).toEqual(["home", "ops"]);
    expect((await search("q=kiwi&room=home")).body.results.map((r) => r.roomId)).toEqual(["home"]);
    expect((await search("q=kiwi&room=_heartbeat")).status).toBe(404);
    expect((await search("q=kiwi&room=nope")).status).toBe(404);
  });

  test("only messages and replies are searchable, not tool results, approvals or runtime diagnostics", async () => {
    ledger.append("ops", "coder", "tool_result", { tool: "read_file", text: "papaya in a file" });
    ledger.append("ops", "coder", "approval_requested", { text: "papaya approval" });
    ledger.append("ops", "coder", "bot_output", { turnId: "t1", runtimeDiagnostic: true, text: "Incomplete: papaya stopped." });
    expect((await search("q=papaya")).body.results).toEqual([]);
  });

  test("FTS5 syntax in the input is literal text: it cannot fail the search or widen it", async () => {
    ledger.append("ops", "user", "message", { text: "mango smoothie" });
    ledger.append("ops", "user", "message", { text: "lunch break" });
    for (const q of ['"', "NEAR(mango", "mango OR lunch", "text:mango", "*", "(", "mango -lunch", "^mango", "{text}: x", "AND", "'"]) {
      const res = await search(`q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.results.some((r) => r.snippet.includes("lunch")), q).toBe(false);
    }
    expect((await search("q=man*")).body.results.map((r) => r.snippet)).toEqual(["mango smoothie"]);
    expect((await search("q=man")).body.results).toEqual([]);
  });

  test("an empty or unmatched query returns no results; invalid parameters are refused", async () => {
    ledger.append("ops", "user", "message", { text: "something" });
    expect(await search("q=")).toEqual({ status: 200, body: { results: [] } });
    expect(await search("q=nothinglikethis")).toEqual({ status: 200, body: { results: [] } });
    expect((await search("q=x&before=-1")).status).toBe(400);
    expect((await search("q=x&limit=500")).status).toBe(400);
    expect((await search("q=x&extra=1")).status).toBe(400);
    expect((await app.request("/history/search?q=x")).status).toBe(401);
  });

  test("before pages to older events and limit bounds the count", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => ledger.append("ops", "user", "message", { text: `grape number ${i}` }).id);
    expect((await search("q=grape&limit=2")).body.results).toHaveLength(2);
    const older = (await search(`q=grape&before=${ids[2]}`)).body.results.map((r) => r.eventId).sort();
    expect(older).toEqual([ids[0], ids[1]]);
  });

  test("a redacted secret cannot be found by its raw value", async () => {
    const secret = "sk-" + "b".repeat(30);
    ledger.append("ops", "user", "message", { text: `the key is ${secret}` });
    expect((await search(`q=${secret}`)).body.results).toEqual([]);
    expect((await search("q=key")).body.results[0]!.snippet).not.toContain(secret);
  });

  test("deleted history stops matching", async () => {
    const e = ledger.append("ops", "user", "message", { text: "plum pudding" });
    expect((await search("q=plum")).body.results).toHaveLength(1);
    db.prepare("DELETE FROM events WHERE id = ?").run(e.id);
    expect((await search("q=plum")).body.results).toEqual([]);
  });

  test("messages written before the upgrade are searchable without a manual reindex", async () => {
    db.exec("DROP TRIGGER history_fts_insert; DROP TRIGGER history_fts_delete; DROP TABLE history_fts; DELETE FROM schema_version WHERE version = 45;");
    ledger.append("ops", "user", "message", { text: "legacy quince decision" });
    ledger.append("_heartbeat", "coder", "bot_output", { turnId: "t", text: "legacy quince heartbeat" });
    ledger.append("ops", "coder", "bot_output", { turnId: "t", runtimeDiagnostic: true, text: "Incomplete: quince stopped." });
    db.close();
    db = openDb(dir);
    ledger = createLedger(db);
    app = createGateway({ db, ledger, approvals: createApprovals(db, ledger), auth: createAuth({ db, ownerToken: OWNER }), dispatch: () => undefined, deskDir: join(dir, "x"), dataDir: dir });
    expect((await search("q=quince")).body.results.map((r) => r.snippet)).toEqual(["legacy quince decision"]);
  });
});

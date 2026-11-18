import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { addMember, createBot, createRoom } from "./rooms.js";
import { setSetting } from "./settings.js";
import { guestWork, guestWorkCandidate } from "./guest-work.js";

let dir: string;
let db: Db;
let ledger: Ledger;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-guest-work-"));
  db = openDb(dir);
  ledger = createLedger(db);
  createBot(db, { id: "lead", runtime: "api" });
  createBot(db, { id: "spec", runtime: "api" });
  setSetting(db, "defaultBot", { botId: "lead" });
  createRoom(db, { id: "dm", leadBotId: "lead", kind: "direct" });
  addMember(db, "dm", "lead");
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("guestWorkCandidate", () => {
  test("the default bot may hand work to another existing bot from its own direct chat", () => {
    expect(guestWorkCandidate(db, "dm", "lead", "spec")).toBe(true);
  });

  test("only the default bot qualifies as caller, and it cannot assign to itself", () => {
    expect(guestWorkCandidate(db, "dm", "spec", "lead")).toBe(false);
    expect(guestWorkCandidate(db, "dm", "lead", "lead")).toBe(false);
  });

  test("the room must be a direct chat led by the caller, with the caller as member", () => {
    createRoom(db, { id: "team", leadBotId: "lead", kind: "room" });
    addMember(db, "team", "lead");
    expect(guestWorkCandidate(db, "team", "lead", "spec")).toBe(false);
    createRoom(db, { id: "dm-other", leadBotId: "spec", kind: "direct" });
    addMember(db, "dm-other", "lead");
    expect(guestWorkCandidate(db, "dm-other", "lead", "spec")).toBe(false);
    createRoom(db, { id: "dm-nomember", leadBotId: "lead", kind: "direct" });
    expect(guestWorkCandidate(db, "dm-nomember", "lead", "spec")).toBe(false);
    expect(guestWorkCandidate(db, "missing", "lead", "spec")).toBe(false);
  });

  test("the assignee must be an existing bot", () => {
    expect(guestWorkCandidate(db, "dm", "lead", "ghost")).toBe(false);
  });

  test("without a default bot nobody qualifies", () => {
    setSetting(db, "defaultBot", { botId: null });
    expect(guestWorkCandidate(db, "dm", "lead", "spec")).toBe(false);
  });
});

describe("guestWork", () => {
  const parents = [{ botId: "lead", roomId: "dm" }];
  function addWork(id: string, opts: { roomId?: string; botId?: string; creationKey?: string | null; assignment?: unknown } = {}) {
    const roomId = opts.roomId ?? "dm";
    const request = ledger.append(roomId, "user", "message", { text: "do it" });
    const now = Date.now();
    db.prepare(
      "INSERT INTO work (id, room_id, bot_id, request_id, title, request, status, next_step, created_at, updated_at, creation_key) VALUES (?, ?, ?, ?, 't', 'r', 'working', 'n', ?, ?, ?)",
    ).run(id, roomId, opts.botId ?? "spec", request.id, now, now, opts.creationKey === undefined ? `key-${id}` : opts.creationKey);
    if (opts.assignment !== null) {
      db.prepare("INSERT INTO guest_work_assignments (work_id, permission_parents_json) VALUES (?, ?)").run(id, JSON.stringify(opts.assignment ?? parents));
    }
  }

  test("returns the stored permission parents for a matching guest assignment", () => {
    addWork("w1");
    expect(guestWork(db, "w1", "dm", "spec")).toEqual({ permissionParents: parents });
  });

  test("a mismatched work id, room or bot is not a guest assignment", () => {
    addWork("w1");
    createRoom(db, { id: "dm2", leadBotId: "lead", kind: "direct" });
    expect(guestWork(db, "nope", "dm", "spec")).toBeUndefined();
    expect(guestWork(db, "w1", "dm2", "spec")).toBeUndefined();
    expect(guestWork(db, "w1", "dm", "lead")).toBeUndefined();
  });

  test("work without an assignment row, without a creation key, or outside a direct chat is refused", () => {
    addWork("plain", { assignment: null });
    expect(guestWork(db, "plain", "dm", "spec")).toBeUndefined();
    addWork("legacy", { creationKey: null });
    expect(guestWork(db, "legacy", "dm", "spec")).toBeUndefined();
    createRoom(db, { id: "team", leadBotId: "lead", kind: "room" });
    addWork("inroom", { roomId: "team" });
    expect(guestWork(db, "inroom", "team", "spec")).toBeUndefined();
  });
});

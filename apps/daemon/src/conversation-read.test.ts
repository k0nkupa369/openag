import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { conversationUnread, markConversationRead } from "./conversation-read.js";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { createRoom } from "./rooms.js";

let dir: string;
let db: Db;
let ledger: Ledger;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-conv-read-"));
  db = openDb(dir);
  ledger = createLedger(db);
  createRoom(db, { id: "r1" });
  createRoom(db, { id: "r2" });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const readEvents = (roomId: string) => ledger.list(roomId).filter((e) => e.type === "conversation_read");

describe("conversationUnread", () => {
  test("an empty room has nothing unread", () => {
    expect(conversationUnread(db, "r1")).toEqual({ readThrough: 0, firstUnread: null, lastUnread: null });
  });

  test("only bot messages and bot output count; owner-side and system actors do not", () => {
    ledger.append("r1", "user", "message", { text: "hi" });
    ledger.append("r1", "owner", "message", { text: "hi" });
    ledger.append("r1", "daemon", "message", { text: "notice" });
    ledger.append("r1", "scheduler", "message", { text: "tick" });
    ledger.append("r1", "slack", "message", { text: "from slack" });
    ledger.append("r1", "automation:nightly", "message", { text: "auto" });
    ledger.append("r1", "boss", "tool_call", { name: "x" });
    expect(conversationUnread(db, "r1").firstUnread).toBeNull();

    const first = ledger.append("r1", "boss", "message", { text: "reply" });
    const last = ledger.append("r1", "boss", "bot_output", { text: "more" });
    expect(conversationUnread(db, "r1")).toEqual({ readThrough: 0, firstUnread: first.id, lastUnread: last.id });
  });

  test("internal consultations are not unread, and other rooms are isolated", () => {
    ledger.append("r1", "boss", "message", { text: "consulting", internalConsultation: true });
    const other = ledger.append("r2", "boss", "message", { text: "elsewhere" });
    expect(conversationUnread(db, "r1").lastUnread).toBeNull();
    expect(conversationUnread(db, "r2").lastUnread).toBe(other.id);
  });
});

describe("markConversationRead", () => {
  test("advances the boundary, appends one audit event and leaves later messages unread", () => {
    ledger.append("r1", "boss", "message", { text: "a" });
    const b = ledger.append("r1", "boss", "message", { text: "b" });
    const c = ledger.append("r1", "boss", "message", { text: "c" });
    expect(markConversationRead(db, ledger, "r1", b.id)).toBe(true);
    expect(conversationUnread(db, "r1")).toEqual({ readThrough: b.id, firstUnread: c.id, lastUnread: c.id });
    const events = readEvents("r1");
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toBe("daemon");
    expect(events[0]!.payload).toEqual({ through: b.id });
  });

  test("never moves backwards and a repeat does not append another event", () => {
    const a = ledger.append("r1", "boss", "message", { text: "a" });
    const b = ledger.append("r1", "boss", "message", { text: "b" });
    expect(markConversationRead(db, ledger, "r1", b.id)).toBe(true);
    expect(markConversationRead(db, ledger, "r1", a.id)).toBe(true); // valid target, ignored
    expect(markConversationRead(db, ledger, "r1", b.id)).toBe(true);
    expect(conversationUnread(db, "r1").readThrough).toBe(b.id);
    expect(readEvents("r1")).toHaveLength(1);
    expect(conversationUnread(db, "r1").firstUnread).toBeNull();
  });

  test("refuses non-integers, non-positive ids, other rooms' events and non-visible events", () => {
    const mine = ledger.append("r1", "boss", "message", { text: "a" });
    const theirs = ledger.append("r2", "boss", "message", { text: "b" });
    const own = ledger.append("r1", "user", "message", { text: "mine" });
    for (const bad of [0, -3, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2, 999_999]) {
      expect(markConversationRead(db, ledger, "r1", bad)).toBe(false);
    }
    expect(markConversationRead(db, ledger, "r1", theirs.id)).toBe(false);
    expect(markConversationRead(db, ledger, "r1", own.id)).toBe(false);
    expect(conversationUnread(db, "r1")).toEqual({ readThrough: 0, firstUnread: mine.id, lastUnread: mine.id });
    expect(readEvents("r1")).toHaveLength(0);
  });
});

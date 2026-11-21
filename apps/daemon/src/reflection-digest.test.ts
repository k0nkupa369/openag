import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { deliverBrief } from "./brief.js";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { buildDigest } from "./reflection.js";
import { addMember, createBot, createRoom } from "./rooms.js";
import { setSetting } from "./settings.js";
import { createWakeFilter } from "./wake.js";

let dir: string;
let db: Db;
let ledger: Ledger;
const now = new Date("2026-11-20T09:00:00Z");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-reflection-digest-"));
  db = openDb(dir);
  ledger = createLedger(db);
  createBot(db, { id: "boss", runtime: "api" });
  createRoom(db, { id: "main", leadBotId: "boss" });
  addMember(db, "main", "boss");
  setSetting(db, "deliveryRoom", { roomId: "main" });
  setSetting(db, "activeHours", { start: "00:00", end: "23:59", days: [0, 1, 2, 3, 4, 5, 6] });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("the digest leaves out daemon pings and the morning brief and keeps the conversation", async () => {
  ledger.append("main", "user", "message", { text: "please remember I prefer short replies" });
  ledger.append("main", "boss", "bot_output", { text: "noted, short replies from now on" });

  const wake = createWakeFilter({ db, ledger, tz: "UTC", now: () => now });
  await wake.process({
    source: "heartbeat",
    botId: "boss",
    turnId: "t1",
    text: JSON.stringify({ verdict: "ping", reason: "invoice overdue", urgency: "high", dedupe_key: "inv" }),
  });
  await wake.process({
    source: "heartbeat",
    botId: "boss",
    turnId: "t2",
    text: JSON.stringify({ verdict: "digest", reason: "newsletter arrived", urgency: "low", dedupe_key: "news" }),
  });
  expect(deliverBrief({ db, ledger, now, tz: "UTC", force: true })).toMatchObject({ sent: true });

  const posted = ledger.list("main").filter((e) => e.type === "message").map((e) => (e.payload as { text: string }).text);
  expect(posted.some((t) => t.startsWith("Heads-up from boss"))).toBe(true);
  expect(posted.some((t) => t.startsWith("Good morning"))).toBe(true);

  const digest = buildDigest(db, 0);
  expect(digest).toContain("please remember I prefer short replies");
  expect(digest).toContain("noted, short replies from now on");
  expect(digest).not.toContain("Heads-up from");
  expect(digest).not.toContain("Good morning");
});

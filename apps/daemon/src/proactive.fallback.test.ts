import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type Db, openDb } from "./db/index.js";
import { createLedger } from "./ledger.js";
import { createProactive } from "./proactive.js";
import { createBot } from "./rooms.js";
import type { Runner } from "./runtimes/runner.js";
import { createScheduler } from "./scheduler.js";
import { setSetting } from "./settings.js";
import type { WakeFilter } from "./wake.js";

const T0 = new Date("2026-11-17T09:00:00Z").getTime(), HOUR = 3_600_000;
let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-proactive-fallback-"));
  db = openDb(dir);
  createBot(db, { id: "boss", runtime: "api" });
  setSetting(db, "defaultBot", { botId: "boss" });
  setSetting(db, "heartbeat", { enabled: true, everyMinutes: 60, botId: null, prompt: null });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function setup() {
  let now = T0;
  const fallback = vi.fn(async () => undefined);
  const connected = vi.fn(() => false);
  const proactive = createProactive({ db, ledger: createLedger(db), runner: {} as Runner, wake: {} as WakeFilter, tz: "UTC", connected, now: () => now, fallback });
  const scheduler = createScheduler({ now: () => new Date(now) });
  proactive.register(scheduler);
  const tickAt = async (ms: number) => { now = T0 + ms; await scheduler.tick(new Date(now)); };
  return { proactive, fallback, connected, tickAt };
}

test("with no service selected, a due heartbeat runs the model heartbeat fallback", async () => {
  const { fallback, connected, tickAt, proactive } = setup();
  await tickAt(HOUR);
  expect(fallback).toHaveBeenCalledTimes(1);
  expect(connected).not.toHaveBeenCalled();
  expect(proactive.status().runs).toEqual([]);
  proactive.close();
});

test("with a service selected, the due heartbeat checks services instead", async () => {
  const { fallback, connected, tickAt, proactive } = setup();
  db.prepare("UPDATE proactive_config SET services_json=? WHERE id=1").run(JSON.stringify(["gmail"]));
  await tickAt(HOUR);
  expect(fallback).not.toHaveBeenCalled();
  expect(connected).toHaveBeenCalled();
  proactive.close();
});

test("a disabled heartbeat runs neither", async () => {
  setSetting(db, "heartbeat", { enabled: false, everyMinutes: 60, botId: null, prompt: null });
  const { fallback, connected, tickAt, proactive } = setup();
  await tickAt(HOUR);
  expect(fallback).not.toHaveBeenCalled();
  expect(connected).not.toHaveBeenCalled();
  proactive.close();
});

import Database from "better-sqlite3";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type Db, MIGRATIONS_DIR, openDb } from "./index.js";
import { migrate } from "./migrate.js";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-db-"));
  db = openDb(dir);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("journal_mode is wal", () => {
  expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
});

test("running migrations twice is a no-op", () => {
  const count = () => (db.prepare("SELECT COUNT(*) AS n FROM schema_version").get() as { n: number }).n;
  const before = count();
  expect(before).toBeGreaterThan(0);
  migrate(db, MIGRATIONS_DIR);
  expect(count()).toBe(before);
});

test("vec_version() returns a non-empty string", () => {
  const row = db.prepare("SELECT vec_version() AS v").get() as { v: string };
  expect(row.v).toBeTruthy();
});

test("migration 003 creates the devices and pairing_codes tables", () => {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
    (r) => r.name,
  );
  expect(tables).toEqual(expect.arrayContaining(["devices", "pairing_codes"]));
  const v = db.prepare("SELECT name FROM schema_version WHERE version = 3").get() as { name: string } | undefined;
  expect(v?.name).toBe("003_devices.sql");
});

describe("migration numbering", () => {
  const raw = (name: string) => {
    const d = new Database(join(dir, name));
    d.pragma("foreign_keys = ON");
    sqliteVec.load(d);
    return d;
  };
  // A migrations folder holding the shipped files up to `last`, plus optional extra files.
  const folder = (name: string, last: number, extra: Record<string, string> = {}) => {
    const target = join(dir, name);
    mkdirSync(target);
    for (const file of readdirSync(MIGRATIONS_DIR)) if (parseInt(file, 10) <= last) copyFileSync(join(MIGRATIONS_DIR, file), join(target, file));
    for (const [file, sql] of Object.entries(extra)) writeFileSync(join(target, file), sql);
    return target;
  };
  const webPushSql = () => readFileSync(join(MIGRATIONS_DIR, "044_web_push.sql"), "utf8");
  const versions = (d: Database.Database) => d.prepare("SELECT version, name FROM schema_version ORDER BY version").all() as { version: number; name: string }[];
  const hasTable = (d: Database.Database, name: string) => !!d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);

  test("duplicate migration numbers fail before anything is applied", () => {
    const d = raw("dup.db");
    const target = folder("dup", 1, { "001_other.sql": "CREATE TABLE should_not_exist (id INTEGER);" });
    expect(() => migrate(d, target)).toThrow(/Duplicate migration number 1/);
    expect(hasTable(d, "should_not_exist")).toBe(false);
    d.close();
  });

  test("a stored name that differs from the file fails", () => {
    const d = raw("renamed.db");
    migrate(d, folder("before", 1));
    const target = folder("after", 0, { "001_renamed.sql": "SELECT 1;" });
    expect(() => migrate(d, target)).toThrow(/applied as 001_core.sql/);
    d.close();
  });

  test("a 0.6.0 install (Web Push as 039) upgrades and keeps its subscriptions", () => {
    const d = raw("v060.db");
    migrate(d, folder("v060", 38, { "039_web_push.sql": webPushSql() }));
    d.prepare("INSERT INTO devices (id, name, token_hash, created_at) VALUES ('d1', 'phone', 'h', 1)").run();
    d.prepare("INSERT INTO web_push_subscriptions (id, device_id, endpoint, p256dh, auth, created_at) VALUES ('s1', 'd1', 'https://push.example/x', 'k', 'a', 1)").run();
    migrate(d, MIGRATIONS_DIR);
    const v = versions(d);
    expect(v.find((r) => r.version === 39)?.name).toBe("039_proactive.sql");
    expect(v.find((r) => r.version === 44)?.name).toBe("044_web_push.sql");
    expect(v.map((r) => r.version)).toEqual(readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).map((f) => parseInt(f, 10)));
    expect(hasTable(d, "proactive_config")).toBe(true);
    expect((d.prepare("SELECT count(*) n FROM web_push_subscriptions").get() as { n: number }).n).toBe(1);
    migrate(d, MIGRATIONS_DIR);
    expect(versions(d)).toEqual(v);
    d.close();
  });

  test("the proactive line (schema 43) gains the Web Push table", () => {
    const d = raw("live.db");
    migrate(d, folder("live", 43));
    expect(hasTable(d, "web_push_subscriptions")).toBe(false);
    migrate(d, MIGRATIONS_DIR);
    expect(hasTable(d, "web_push_subscriptions")).toBe(true);
    expect(versions(d).at(-1)).toEqual({ version: 44, name: "044_web_push.sql" });
    d.close();
  });

  test("a fresh install applies every migration once", () => {
    expect(hasTable(db, "web_push_subscriptions")).toBe(true);
    expect(hasTable(db, "proactive_config")).toBe(true);
    expect(versions(db).map((r) => r.name)).toEqual(readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort());
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type Db, openDb } from "./db/index.js";
import { createLedger, type Ledger } from "./ledger.js";
import { createBot, getBot } from "./rooms.js";
import { HandleError, handleAvailable, handleIndex, handleOwner, normalizeHandle, setBotHandle } from "./handles.js";

let dir: string;
let db: Db;
let ledger: Ledger;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-handles-"));
  db = openDb(dir);
  ledger = createLedger(db);
  createBot(db, { id: "alpha", runtime: "api" });
  createBot(db, { id: "beta", runtime: "api" });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const refusal = (fn: () => unknown): HandleError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(HandleError);
    return e as HandleError;
  }
  throw new Error("expected a HandleError");
};

describe("normalizeHandle", () => {
  test("trims and lowercases a valid handle", () => {
    expect(normalizeHandle("  Research_Bot-2 ")).toBe("research_bot-2");
  });

  test("rejects non-strings and characters outside the mention alphabet", () => {
    expect(refusal(() => normalizeHandle(42)).status).toBe(400);
    for (const bad of ["", "-lead", "has space", "dot.name", "émile", "a".repeat(49)]) {
      expect(refusal(() => normalizeHandle(bad)).status).toBe(400);
    }
    expect(normalizeHandle("a".repeat(48))).toHaveLength(48);
  });

  test("reserved names conflict (409), whatever the case", () => {
    const error = refusal(() => normalizeHandle("Everyone"));
    expect(error.status).toBe(409);
    expect(error.message).toBe("@everyone is reserved.");
    expect(refusal(() => normalizeHandle("constructor")).status).toBe(409);
  });

  test("a handle that looks like a secret is refused", () => {
    const error = refusal(() => normalizeHandle("sk-ant-abcdefghijklmnopqrstuvwxyz"));
    expect(error.message).toBe("Handle contains a secret");
  });
});

describe("handle lookup", () => {
  test("the index maps current and retired handles back to the owning bot id", () => {
    setBotHandle(db, ledger, "alpha", "scout");
    const index = handleIndex(db);
    expect(index.get("scout")).toBe("alpha");
    expect(index.get("alpha")).toBe("alpha"); // retired handle still addresses the same bot
    expect(index.get("beta")).toBe("beta");
  });

  test("handleOwner and handleAvailable account for retired handles and existing bot ids", () => {
    expect(handleOwner(db, "alpha")).toBe("alpha");
    expect(handleOwner(db, "nobody")).toBeUndefined();
    expect(handleAvailable(db, "nobody")).toBe(true);
    expect(handleAvailable(db, "beta")).toBe(false);
    setBotHandle(db, ledger, "alpha", "scout");
    expect(handleOwner(db, "alpha")).toBe("alpha");
    expect(handleAvailable(db, "scout")).toBe(false);
  });
});

describe("setBotHandle", () => {
  test("changes the handle, keeps the id, reserves the old handle and audits the change", () => {
    const result = setBotHandle(db, ledger, "alpha", "Scout", "owner");
    expect(result.changed).toBe(true);
    expect(result.bot.id).toBe("alpha");
    expect(result.bot.handle).toBe("scout");
    expect(getBot(db, "alpha")!.handle).toBe("scout");
    expect(db.prepare("SELECT bot_id FROM agent_handle_reservations WHERE handle = 'alpha'").get()).toEqual({ bot_id: "alpha" });
    const audit = ledger.list("_system").filter((e) => e.type === "config");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor).toBe("owner");
    expect(audit[0]!.payload).toMatchObject({ botId: "alpha", action: "bot_handle_changed", from: "alpha", to: "scout" });
  });

  test("setting the current handle again is a no-op with no event or reservation", () => {
    const result = setBotHandle(db, ledger, "alpha", " ALPHA ");
    expect(result.changed).toBe(false);
    expect(ledger.list("_system").filter((e) => e.type === "config")).toHaveLength(0);
    expect(db.prepare("SELECT count(*) AS n FROM agent_handle_reservations").get()).toEqual({ n: 0 });
  });

  test("another bot cannot take a live handle, an id, or a handle another bot retired", () => {
    expect(refusal(() => setBotHandle(db, ledger, "alpha", "beta")).status).toBe(409);
    setBotHandle(db, ledger, "beta", "helper");
    const retired = refusal(() => setBotHandle(db, ledger, "alpha", "beta")); // beta's retired handle
    expect(retired.status).toBe(409);
    expect(retired.message).toBe("@beta is already used or reserved.");
    expect(getBot(db, "alpha")!.handle).toBe("alpha");
  });

  test("unknown bot is 404 and invalid input is refused before any write", () => {
    expect(refusal(() => setBotHandle(db, ledger, "ghost", "fine")).status).toBe(404);
    expect(refusal(() => setBotHandle(db, ledger, "alpha", "system")).status).toBe(409);
    expect(getBot(db, "alpha")!.handle).toBe("alpha");
  });

  test("a bot can take back a handle it retired; the reservation moves to the handle it left", () => {
    setBotHandle(db, ledger, "alpha", "scout");
    const back = setBotHandle(db, ledger, "alpha", "alpha");
    expect(back.changed).toBe(true);
    expect(back.bot.handle).toBe("alpha");
    const reserved = (db.prepare("SELECT handle FROM agent_handle_reservations WHERE bot_id = 'alpha' ORDER BY handle").all() as { handle: string }[]).map((r) => r.handle);
    expect(reserved).toEqual(["scout"]);
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApprovals } from "./approvals.js";
import { createAuth } from "./auth.js";
import { type Db, openDb } from "./db/index.js";
import { createGateway } from "./gateway.js";
import { createLedger, type Ledger } from "./ledger.js";
import { ownerNotesPath } from "./memory.js";

const OWNER = "owner-test-token";
const h = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
let dir: string;
let db: Db;
let ledger: Ledger;
let app: ReturnType<typeof createGateway>;
let auth: ReturnType<typeof createAuth>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-gw-owner-notes-"));
  db = openDb(dir);
  ledger = createLedger(db);
  auth = createAuth({ db, ownerToken: OWNER });
  app = createGateway({ db, ledger, approvals: createApprovals(db, ledger), auth, dispatch: () => undefined, deskDir: join(dir, "x"), dataDir: dir });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const put = (t: string, body: unknown) => app.request("/owner-notes", { method: "PUT", headers: h(t), body: JSON.stringify(body) });
const get = async (t: string) => (await app.request("/owner-notes", { headers: h(t) })).json() as Promise<{ text: string; maxBytes: number; headCap: number }>;

describe("owner notes routes", () => {
  test("empty before anything is saved", async () => {
    expect(await get(OWNER)).toMatchObject({ text: "", maxBytes: 16 * 1024 });
  });

  test("owner and Full devices write notes; Limited devices can only read", async () => {
    const limited = auth.createDevice("phone");
    const full = auth.createDevice("laptop", undefined, "full");
    expect((await put(limited.token, { text: "- nope\n" })).status).toBe(403);
    expect((await put(OWNER, { text: "- Lives in Auckland\n" })).status).toBe(200);
    expect((await get(limited.token)).text).toBe("- Lives in Auckland\n");
    expect((await put(full.token, { text: "- Prefers short answers\n" })).status).toBe(200);
    expect((await get(limited.token)).text).toBe("- Prefers short answers\n");
  });

  test("refuses text containing a secret and keeps the saved notes", async () => {
    const phone = auth.createDevice("phone");
    await put(OWNER, { text: "- Lives in Auckland\n" });
    for (const text of [`- key ${phone.token}\n`, "- key [REDACTED:token]\n"]) {
      const res = await put(OWNER, { text });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Owner notes cannot contain a secret. Remove it and save again." });
    }
    expect(readFileSync(ownerNotesPath(dir), "utf8")).toBe("- Lives in Auckland\n");
  });

  test("audits the edit by length only", async () => {
    await put(OWNER, { text: "- Lives in Auckland\n" });
    const audit = ledger.list("_system").filter((e) => (e.payload as { action?: string }).action === "owner_notes_edited");
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("Auckland");
  });

  test("rejects oversize or non-string text", async () => {
    expect((await put(OWNER, { text: "a".repeat(16 * 1024 + 1) })).status).toBe(400);
    expect((await put(OWNER, { text: 5 })).status).toBe(400);
  });
});

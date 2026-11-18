import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApprovals } from "./approvals.js";
import { createAuth } from "./auth.js";
import { type Db, openDb } from "./db/index.js";
import { createGateway } from "./gateway.js";
import { createLedger } from "./ledger.js";
import type { Proactive } from "./proactive.js";

const TOKEN = "test-token";

let dir: string;
let db: Db;
let app: ReturnType<typeof createGateway>;
let auth: ReturnType<typeof createAuth>;
const status = vi.fn(() => ({ runs: [{ evidence: { sender: "a@example.com", subject: "Private", excerpt: "mailbox text" } }] }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-gw-proactive-"));
  db = openDb(dir);
  const ledger = createLedger(db);
  auth = createAuth({ db, ownerToken: TOKEN });
  status.mockClear();
  app = createGateway({
    db, ledger, approvals: createApprovals(db, ledger), auth, dispatch: () => undefined, deskDir: join(dir, "no-desk"),
    proactive: { status, search: vi.fn(), save: vi.fn() } as unknown as Proactive,
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (token?: string) => app.request("/proactive", token ? { headers: { authorization: `Bearer ${token}` } } : {});

describe("GET /proactive", () => {
  test("owner and Full devices read status with its mailbox evidence", async () => {
    expect((await get(TOKEN)).status).toBe(200);
    const full = auth.createDevice("desk", "owner", "full").token;
    const res = await get(full);
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain("mailbox text");
  });

  test("Limited devices and anonymous callers get no evidence", async () => {
    const limited = auth.createDevice("phone", "owner", "limited").token;
    const res = await get(limited);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("mailbox text");
    expect((await get()).status).toBe(401);
    expect(status).toHaveBeenCalledTimes(0);
  });
});

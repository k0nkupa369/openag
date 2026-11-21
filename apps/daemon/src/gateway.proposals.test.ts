import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApprovals, type Approvals } from "./approvals.js";
import { createAuth } from "./auth.js";
import { type Db, openDb } from "./db/index.js";
import { createGateway } from "./gateway.js";
import { createLedger } from "./ledger.js";
import { MANAGEMENT_AUTOMATION_TOOL } from "./management-automation.js";
import { MANAGEMENT_PROPOSAL_SOURCE } from "./management-proposals.js";
import { MANAGEMENT_DELIVERY_TOOL, MANAGEMENT_PROACTIVE_TOOL } from "./management-settings.js";
import { MANAGEMENT_DIRECT_CHAT_TOOL, MANAGEMENT_ROOM_TOOL } from "./management-rooms.js";
import { MANAGEMENT_RESPONSIBILITY_TOOL } from "./management-responsibilities.js";
import { createBot, createRoom } from "./rooms.js";

// A management proposal changes configuration (OA-347): only the owner or a full device may decide it.
const OWNER = "owner-test-token";
const bearer = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
let dir: string, db: Db, approvals: Approvals, app: ReturnType<typeof createGateway>, auth: ReturnType<typeof createAuth>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-gw-proposals-"));
  db = openDb(dir);
  createBot(db, { id: "bot", runtime: "api" });
  createRoom(db, { id: "main", leadBotId: "bot" });
  const ledger = createLedger(db);
  approvals = createApprovals(db, ledger);
  auth = createAuth({ db, ownerToken: OWNER });
  app = createGateway({ db, ledger, approvals, auth, dispatch: () => undefined, deskDir: join(dir, "x"), dataDir: dir });
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

const propose = (toolName = MANAGEMENT_AUTOMATION_TOOL) => approvals.request({ roomId: "main", botId: "daemon", toolName, toolClass: "act-local", source: MANAGEMENT_PROPOSAL_SOURCE, payload: {} }).approvalId;
const decide = (id: string, token: string) =>
  app.request(`/approvals/${id}`, { method: "POST", headers: bearer(token), body: JSON.stringify({ kind: "ignore", reviewVersion: approvals.get(id)!.reviewVersion }) });

test("a limited device cannot decide a proposal; the owner and a full device can", async () => {
  const limited = auth.createDevice("phone"), full = auth.createDevice("mac", "owner", "full");
  const first = propose(), second = propose();
  expect((await decide(first, limited.token)).status).toBe(403);
  expect(approvals.get(first)?.status).toBe("pending");
  expect((await decide(first, full.token)).status).toBe(200);
  expect((await decide(second, OWNER)).status).toBe(200);
  for (const tool of [MANAGEMENT_PROACTIVE_TOOL, MANAGEMENT_DELIVERY_TOOL, MANAGEMENT_ROOM_TOOL, MANAGEMENT_DIRECT_CHAT_TOOL, MANAGEMENT_RESPONSIBILITY_TOOL]) expect((await decide(propose(tool), limited.token)).status).toBe(403);
});

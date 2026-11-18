import { createDecipheriv, createECDH, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApprovals } from "./approvals.js";
import { createAuth } from "./auth.js";
import { type Db, openDb } from "./db/index.js";
import { createGateway } from "./gateway.js";
import { createLedger } from "./ledger.js";
import { createPusher } from "./push.js";
import { createRedactor } from "./redact.js";
import { createBot, createRoom } from "./rooms.js";
import { setSetting, getSetting } from "./settings.js";
import { createWebPush, MAX_SUBSCRIPTIONS_PER_DEVICE, pushServiceHost } from "./web-push-subscriptions.js";

const OWNER = "owner-test-token";
const KEY = "a".repeat(64);
const hmac = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();

/** A browser: its push subscription keys, and a decryptor for what the push service hands it. */
function browser() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.alloc(16, Math.floor(Math.random() * 255));
  return {
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    open(body: Buffer): unknown {
      const salt = body.subarray(0, 16), n = body[20]!, as = body.subarray(21, 21 + n), rec = body.subarray(21 + n);
      const ikm = hmac(hmac(auth, ecdh.computeSecret(as)), Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), as, Buffer.from([1])]));
      const prk = hmac(salt, ikm);
      const d = createDecipheriv("aes-128-gcm", hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16), hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12));
      d.setAuthTag(rec.subarray(-16));
      const plain = Buffer.concat([d.update(rec.subarray(0, -16)), d.final()]);
      return JSON.parse(plain.subarray(0, -1).toString());
    },
  };
}

let dir: string, db: Db, deliveries: Array<{ url: string; headers: Record<string, string>; body: Buffer }>, reply: (url: string) => number;
const fakeFetch = (async (url: string, init: RequestInit) => {
  deliveries.push({ url, headers: init.headers as Record<string, string>, body: Buffer.from(init.body as Uint8Array) });
  return new Response(null, { status: reply(url) });
}) as typeof fetch;
const make = () => createWebPush({ db, dataDir: dir, env: { OPENAG_CONNECTOR_KEY: KEY }, fetch: fakeFetch, redactor: createRedactor() });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-webpush-"));
  db = openDb(dir);
  deliveries = [];
  reply = () => 201;
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("subscriptions", () => {
  test("only browser push services over https are accepted", () => {
    expect(pushServiceHost("https://fcm.googleapis.com/fcm/send/x")).toBe("fcm.googleapis.com");
    expect(pushServiceHost("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe("updates.push.services.mozilla.com");
    expect(pushServiceHost("https://web.push.apple.com/Qx")).toBe("web.push.apple.com");
    for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://u:p@fcm.googleapis.com/x", "not a url"]) expect(pushServiceHost(bad)).toBeNull();
  });

  test("a device keeps at most three subscriptions, newest kept; listings never show the endpoint", () => {
    const auth = createAuth({ db, ownerToken: OWNER }), { device } = auth.createDevice("phone"), wp = make();
    for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_DEVICE + 2; i++) wp.subscribe(device.id, { endpoint: `https://fcm.googleapis.com/fcm/send/e${i}`, keys: browser().keys });
    const mine = wp.list(device.id);
    expect(mine).toHaveLength(MAX_SUBSCRIPTIONS_PER_DEVICE);
    expect(JSON.stringify(mine)).not.toContain("/fcm/send/");
    expect(mine[0]).toMatchObject({ host: "fcm.googleapis.com", deviceName: "phone" });
    expect(() => wp.subscribe(device.id, { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "short", auth: "x" } })).toThrow(/malformed/);
  });

  test("the VAPID key persists encrypted and survives a restart; rotating it drops subscriptions", () => {
    const auth = createAuth({ db, ownerToken: OWNER }), { device } = auth.createDevice("phone");
    const first = make(), key = first.publicKey();
    expect(make().publicKey()).toBe(key);
    first.subscribe(device.id, { endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: browser().keys });
    expect(first.rotateKeys()).toBe(1);
    expect(first.publicKey()).not.toBe(key);
    expect(first.count()).toBe(0);
  });
});

describe("delivery", () => {
  test("approvals reach every subscribed device encrypted, with VAPID, urgency and a link to the approval", async () => {
    const auth = createAuth({ db, ownerToken: OWNER }), phone = auth.createDevice("phone").device, laptop = auth.createDevice("laptop").device;
    const wp = make(), a = browser(), b = browser();
    wp.subscribe(phone.id, { endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: a.keys });
    wp.subscribe(laptop.id, { endpoint: "https://updates.push.services.mozilla.com/wpush/v2/b", keys: b.keys });
    setSetting(db, "push", { ...getSetting(db, "push"), webPush: { enabled: true, subject: "mailto:owner@example.com" } });
    const pusher = createPusher({ db, webPush: wp, fetch: (() => { throw new Error("ntfy must not be called"); }) as never });
    await pusher.notifyApproval({ actor: "bot", roomId: "main", payload: { toolName: "write_file", approvalId: "ap-1" } });
    expect(deliveries).toHaveLength(2);
    for (const [d, who] of [[deliveries[0]!, a], [deliveries[1]!, b]] as const) {
      expect(d.headers).toMatchObject({ "Content-Encoding": "aes128gcm", Urgency: "high" });
      expect(d.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
      expect(who.open(d.body)).toEqual({ title: "OpenAg", body: "Approval needed: bot wants write_file. Open their conversation in OpenAg.", url: "/#/approvals/ap-1" });
    }
    expect(pusher.status()).toMatchObject({ sentThisHour: 1, webPush: { enabled: true, ready: true, subscriptions: 2 } });
  });

  test("a gone subscription (410) is deleted; another error is recorded as a status only", async () => {
    const auth = createAuth({ db, ownerToken: OWNER }), { device } = auth.createDevice("phone"), wp = make();
    wp.subscribe(device.id, { endpoint: "https://fcm.googleapis.com/fcm/send/gone", keys: browser().keys });
    wp.subscribe(device.id, { endpoint: "https://fcm.googleapis.com/fcm/send/busy", keys: browser().keys });
    reply = (url) => (url.endsWith("gone") ? 410 : 503);
    expect(await wp.sendAll({ title: "t", body: "b", url: "/#/" }, { urgency: "normal" }, "mailto:o@example.com")).toEqual({ sent: 0, failed: 2 });
    const left = wp.list(device.id);
    expect(left).toHaveLength(1);
    expect(left[0]!.lastError).toBe("HTTP 503");
  });

  test("disabled Web Push sends nothing", async () => {
    const auth = createAuth({ db, ownerToken: OWNER }), { device } = auth.createDevice("phone"), wp = make();
    wp.subscribe(device.id, { endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: browser().keys });
    await createPusher({ db, webPush: wp }).notifyApproval({ actor: "bot", payload: { toolName: "x", approvalId: "ap-2" } });
    expect(deliveries).toHaveLength(0);
  });
});

describe("routes", () => {
  test("devices subscribe themselves; the owner token cannot; revoke removes the device's subscriptions", async () => {
    createBot(db, { id: "bot", runtime: "api" });
    createRoom(db, { id: "main", leadBotId: "bot" });
    const ledger = createLedger(db), auth = createAuth({ db, ownerToken: OWNER }), wp = make();
    auth.onRevoke((id) => wp.removeDevice(id));
    const pusher = createPusher({ db, webPush: wp });
    const app = createGateway({ db, ledger, approvals: createApprovals(db, ledger), auth, dispatch: () => undefined, deskDir: join(dir, "x"), dataDir: dir, push: pusher, webPush: wp });
    const req = (token: string, method: string, path: string, body?: unknown) => app.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const limited = auth.createDevice("phone");
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/route", keys: browser().keys };
    expect((await req(OWNER, "POST", "/push/web/subscriptions", sub)).status).toBe(409);
    expect((await req(limited.token, "POST", "/push/web/subscriptions", { ...sub, endpoint: "https://evil.example/x" })).status).toBe(400);
    expect((await req(limited.token, "POST", "/push/web/subscriptions", sub)).status).toBe(201);
    const view = (await (await req(limited.token, "GET", "/push/web")).json()) as { publicKey: string; mine: unknown[]; all?: unknown };
    expect(view.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(view.mine).toHaveLength(1);
    expect(view.all).toBeUndefined();
    // Enabling Web Push is the owner's call.
    expect((await req(limited.token, "PUT", "/settings/push", { ...getSetting(db, "push"), webPush: { enabled: true, subject: "mailto:o@example.com" } })).status).toBe(403);
    expect((await req(OWNER, "PUT", "/settings/push", { ...getSetting(db, "push"), webPush: { enabled: true, subject: "mailto:o@example.com" } })).status).toBe(200);
    expect((await (await req(limited.token, "POST", "/push/web/test")).json())).toEqual({ ok: true });
    // Saving the ntfy fields alone (no webPush in the body) keeps Web Push on.
    const { webPush: _kept, ...ntfyOnly } = getSetting(db, "push");
    expect((await req(limited.token, "PUT", "/settings/push", { ...ntfyOnly, includeDetail: true })).status).toBe(200);
    expect(getSetting(db, "push").webPush).toEqual({ enabled: true, subject: "mailto:o@example.com" });
    expect((await req(limited.token, "POST", "/push/web/rotate-key")).status).toBe(403);
    auth.revokeDeviceTree(limited.device.id, true);
    expect(wp.count()).toBe(0);
  });
});

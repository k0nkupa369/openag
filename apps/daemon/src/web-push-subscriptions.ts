import { randomUUID } from "node:crypto";
import { connectorCredentialStore } from "./connector-credentials.js";
import { resolveConnectorKey } from "./connector-key.js";
import type { Db } from "./db/index.js";
import { createGuardedFetch } from "./mcp/ssrf-fetch.js";
import { getDefaultRedactor, type Redactor } from "./redact.js";
import { buildPushRequest, generateVapidKeys, type PushKeys, type SendOptions, type VapidKeys, type WebPushMessage } from "./webpush.js";

/**
 * Web Push subscriptions, one per browser endpoint and owned by a paired device. The endpoint URL is a bearer
 * capability for that browser and the keys decrypt nothing for us, but both are kept out of logs and responses: a
 * listing shows the push service host only. Revoking a device deletes its rows (see main.ts).
 */

/** Push services the major browsers use. Anything else is refused, so a device cannot aim the daemon at other hosts. */
export const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"] as const;
export const MAX_SUBSCRIPTIONS_PER_DEVICE = 3;

export class WebPushError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 = 400) { super(message); }
}

export function pushServiceHost(endpoint: string, extraAllowed?: (host: string) => boolean): string | null {
  let url: URL;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || endpoint.length > 1024) return null;
  const host = url.hostname.toLowerCase();
  const allowed = PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || extraAllowed?.(host) === true;
  return allowed ? host : null;
}

export interface SubscriptionView { id: string; deviceId: string; deviceName: string | null; host: string; createdAt: number; lastOkAt: number | null; lastError: string | null }

interface Row { id: string; device_id: string; endpoint: string; p256dh: string; auth: string; created_at: number; last_ok_at: number | null; last_error: string | null; name?: string | null }

const KEY_RE = /^[A-Za-z0-9_-]{16,100}$/;

export function createWebPush(deps: {
  db: Db; dataDir: string; env?: NodeJS.ProcessEnv; redactor?: Redactor; now?: () => number;
  /** Tests only: send without the network guard, and accept a local fake push service. */
  fetch?: typeof fetch; allowHost?: (host: string) => boolean;
}) {
  const { db } = deps, now = deps.now ?? Date.now, redactor = deps.redactor ?? getDefaultRedactor();
  const doFetch = deps.fetch ?? createGuardedFetch();
  const store = () => connectorCredentialStore(deps.dataDir, resolveConnectorKey(deps.dataDir, "webpush", (deps.env ?? process.env).OPENAG_CONNECTOR_KEY), "webpush");
  let cached: VapidKeys | null = null;

  /** The VAPID key pair, created on first use. The private key never leaves the encrypted store and this process. */
  function keys(): VapidKeys {
    if (cached) return cached;
    const saved = store().read() as VapidKeys | null;
    const k = saved && typeof saved.publicKey === "string" && typeof saved.privateKey === "string" ? saved : generateVapidKeys();
    if (k !== saved) store().write(k);
    redactor.addSecret(k.privateKey);
    return (cached = k);
  }

  const rows = (where = "", ...args: unknown[]) =>
    db.prepare(`SELECT s.*, d.name FROM web_push_subscriptions s LEFT JOIN devices d ON d.id = s.device_id ${where} ORDER BY s.created_at`).all(...args) as Row[];
  const view = (r: Row): SubscriptionView => ({ id: r.id, deviceId: r.device_id, deviceName: r.name ?? null, host: new URL(r.endpoint).hostname, createdAt: r.created_at, lastOkAt: r.last_ok_at, lastError: r.last_error });
  for (const r of rows()) redactor.addSecret(r.endpoint);

  async function deliver(r: Row, message: WebPushMessage, opts: SendOptions, subject: string): Promise<boolean> {
    try {
      const { url, init } = buildPushRequest(r.endpoint, { p256dh: r.p256dh, auth: r.auth }, message, keys(), subject, opts, now());
      const res = await doFetch(url, init);
      if (res.ok) { db.prepare("UPDATE web_push_subscriptions SET last_ok_at = ?, last_error = NULL WHERE id = ?").run(now(), r.id); return true; }
      // 404/410: the browser dropped this subscription for good (RFC 8030 §7.3).
      if (res.status === 404 || res.status === 410) db.prepare("DELETE FROM web_push_subscriptions WHERE id = ?").run(r.id);
      else db.prepare("UPDATE web_push_subscriptions SET last_error = ? WHERE id = ?").run(`HTTP ${res.status}`, r.id);
      return false;
    } catch (err) {
      // Only the error name: a message can echo the endpoint URL.
      db.prepare("UPDATE web_push_subscriptions SET last_error = ? WHERE id = ?").run(err instanceof Error ? err.name : "Error", r.id);
      return false;
    }
  }
  const deliverAll = async (list: Row[], message: WebPushMessage, opts: SendOptions, subject: string) => {
    const results = await Promise.all(list.map((r) => deliver(r, message, opts, subject)));
    return { sent: results.filter(Boolean).length, failed: results.filter((ok) => !ok).length };
  };

  return {
    publicKey: () => keys().publicKey,
    /** A new key pair. Existing subscriptions were made for the old public key, so they are deleted. */
    rotateKeys(): number {
      const removed = db.prepare("DELETE FROM web_push_subscriptions").run().changes;
      const k = generateVapidKeys();
      store().write(k);
      redactor.addSecret(k.privateKey);
      cached = k;
      return removed;
    },
    subscribe(deviceId: string, input: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }): SubscriptionView {
      const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
      if (!pushServiceHost(endpoint, deps.allowHost)) throw new WebPushError("this push service is not supported");
      const k = input.keys ?? {};
      if (typeof k.p256dh !== "string" || !KEY_RE.test(k.p256dh) || typeof k.auth !== "string" || !KEY_RE.test(k.auth)) throw new WebPushError("subscription keys are missing or malformed");
      redactor.addSecret(endpoint);
      return db.transaction(() => {
        db.prepare("DELETE FROM web_push_subscriptions WHERE endpoint = ?").run(endpoint);
        const own = rows("WHERE s.device_id = ?", deviceId);
        for (const old of own.slice(0, Math.max(0, own.length - MAX_SUBSCRIPTIONS_PER_DEVICE + 1))) db.prepare("DELETE FROM web_push_subscriptions WHERE id = ?").run(old.id);
        const id = randomUUID();
        db.prepare("INSERT INTO web_push_subscriptions (id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, deviceId, endpoint, k.p256dh, k.auth, now());
        return view(rows("WHERE s.id = ?", id)[0]!);
      })();
    },
    unsubscribe(deviceId: string, endpoint: unknown): boolean {
      return typeof endpoint === "string" && db.prepare("DELETE FROM web_push_subscriptions WHERE device_id = ? AND endpoint = ?").run(deviceId, endpoint).changes > 0;
    },
    list: (deviceId: string | null) => (deviceId === null ? rows() : rows("WHERE s.device_id = ?", deviceId)).map(view),
    removeDevice: (deviceId: string) => db.prepare("DELETE FROM web_push_subscriptions WHERE device_id = ?").run(deviceId).changes,
    count: () => (db.prepare("SELECT COUNT(*) AS n FROM web_push_subscriptions").get() as { n: number }).n,
    sendAll: (message: WebPushMessage, opts: SendOptions, subject: string) => deliverAll(rows(), message, opts, subject),
    sendToDevice: (deviceId: string, message: WebPushMessage, opts: SendOptions, subject: string) => deliverAll(rows("WHERE s.device_id = ?", deviceId), message, opts, subject),
  };
}
export type WebPush = ReturnType<typeof createWebPush>;
export type { PushKeys };

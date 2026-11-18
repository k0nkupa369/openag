import { randomBytes } from "node:crypto";
import type { Db } from "./db/index.js";
import type { Ledger, LedgerEvent } from "./ledger.js";
import { getDefaultRedactor, type Redactor } from "./redact.js";
import { getSetting } from "./settings.js";
import type { WebPush } from "./web-push-subscriptions.js";

/**
 * Push notifications over two transports with one message: ntfy (a public relay; the secret topic is the only
 * credential) and Web Push to installed desks (end-to-end encrypted, one subscription per paired device). Messages
 * carry no payloads, paths or secrets, and the hourly cap counts a message once whichever transports carry it.
 */

const HOUR_MS = 3_600_000;
const TIMEOUT_MS = 5_000;
const DEDUPE_MAX = 500;
const TITLE = "OpenAg";
const TITLE_MAX = 60;
const MESSAGE_MAX = 200;
const REASON_MAX = 140;
const NAME_MAX = 80;
const NOT_CONFIGURED = "push is not enabled or has no topic";

export type PingUrgency = "low" | "normal" | "high";

export interface PushStatus {
  enabled: boolean;
  configured: boolean;
  sentThisHour: number;
  dropped: number;
  lastSentAt: number | null;
  lastError: string | null;
  /** Web Push to installed desks; `ready` = enabled, a contact set and at least one subscribed device. */
  webPush: { enabled: boolean; ready: boolean; subscriptions: number };
}

export interface PushResult {
  ok: boolean;
  reason?: string;
}

export interface Pusher {
  notifyApproval(e: { actor: string; roomId?: string; payload: { toolName?: unknown; approvalId?: unknown; source?: unknown } }): Promise<void>;
  notifyInteraction(e: { actor: string; roomId?: string; payload: { interactionId?: unknown; status?: unknown } }): Promise<void>;
  notifyConversation(e: LedgerEvent): Promise<void>;
  notifyPing(p: { botId: string; reason: string; urgency: PingUrgency }): Promise<void>;
  sendTest(): Promise<PushResult>;
  /** Web Push to one device's subscriptions only (its "Send test" button). Ignores ntfy. */
  sendWebTest(deviceId: string): Promise<PushResult>;
  /** A text the bot asked to send (notify_user tool). Same gates as the others: enabled, topic, rate cap, redaction. */
  notifyUser(text: string): Promise<PushResult>;
  status(): PushStatus;
}

export interface PusherDeps {
  db: Db;
  fetch?: typeof fetch;
  now?: () => number;
  redactor?: Redactor;
  webPush?: WebPush;
}

/** "openag-" + 16 random bytes as base64url (128 bits, 29 characters in total). */
export function newPushTopic(): string {
  return `openag-${randomBytes(16).toString("base64url")}`;
}

/** Non-empty string of at most NAME_MAX characters, otherwise a generic fallback. */
function nameOr(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return t !== "" && t.length <= NAME_MAX ? t : fallback;
}

export function createPusher(deps: PusherDeps): Pusher {
  const { db } = deps;
  const doFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? (() => Date.now());
  const redactor = deps.redactor ?? getDefaultRedactor();

  const sentAt: number[] = []; // sliding one-hour window of send attempts
  const seenNotifications = new Set<string>();
  const seenOrder: string[] = [];
  let dropped = 0;
  let lastSentAt: number | null = null;
  let lastError: string | null = null;

  const prune = (t: number) => {
    while (sentAt.length > 0 && sentAt[0]! <= t - HOUR_MS) sentAt.shift();
  };

  /** The stored settings; the topic is registered with the redactor on every read. */
  const current = () => {
    const s = getSetting(db, "push");
    if (s.topic) redactor.addSecret(s.topic);
    return s;
  };

  const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

  /** Applies the rate cap. A test notification is user initiated: it is dropped only past three times the cap. */
  const admit = (isTest: boolean, chat = false): boolean => {
    const t = now();
    prune(t);
    const max = current().maxPerHour;
    const limit = isTest ? max * 3 : chat ? max - Math.ceil(max / 4) : max;
    if (sentAt.length >= limit) {
      dropped++;
      return false;
    }
    sentAt.push(t);
    return true;
  };

  async function post(body: Record<string, unknown>, server: string): Promise<PushResult> {
    const url = `${server.replace(/\/+$/, "")}/`;
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        lastSentAt = now();
        lastError = null;
        return { ok: true };
      }
      lastError = `HTTP ${res.status}`;
      return { ok: false, reason: lastError };
    } catch (err) {
      // Only the error name: messages can echo the URL, and the URL is never safe to log.
      lastError = err instanceof Error ? err.name : "Error";
      return { ok: false, reason: lastError };
    }
  }

  /** Sends one message to every ready transport from a settings snapshot. `link` is a desk hash route. Never throws. */
  async function send(message: string, priority: number, s: ReturnType<typeof current>, link = "#/", dedupeKey?: string): Promise<PushResult> {
    const text = clip(redactor.redactString(message), MESSAGE_MAX);
    const results: PushResult[] = [];
    if (ntfyReady(s)) {
      const body: Record<string, unknown> = { topic: s.topic, title: TITLE, message: text, priority };
      if (s.publicUrl) body.click = s.publicUrl;
      results.push(await post(body, s.server));
    }
    if (webReady(s)) {
      const urgency = priority >= 5 ? "high" : priority === 4 ? "high" : priority <= 2 ? "low" : "normal";
      const r = await deps.webPush!.sendAll({ title: TITLE, body: text, url: `/${link}` }, { urgency, ...(dedupeKey ? { dedupeKey } : {}) }, s.webPush.subject!);
      if (r.sent > 0) { lastSentAt = now(); lastError = null; } else if (r.failed > 0) lastError = "Web Push delivery failed";
      results.push({ ok: r.sent > 0, ...(r.sent > 0 ? {} : { reason: "Web Push delivery failed" }) });
    }
    return results.find((r) => r.ok) ?? results[0] ?? { ok: false, reason: NOT_CONFIGURED };
  }
  const roomLink = (roomId: unknown) => (typeof roomId === "string" && roomId && !roomId.startsWith("_") ? `#/room/${encodeURIComponent(roomId)}` : "#/");

  const ntfyReady = (s: ReturnType<typeof current>) => s.enabled && s.topic !== null;
  const webReady = (s: ReturnType<typeof current>) => s.webPush.enabled && s.webPush.subject !== null && deps.webPush !== undefined && deps.webPush.count() > 0;
  const configured = (s: ReturnType<typeof current>) => ntfyReady(s) || webReady(s);

  return {
    async notifyConversation(e) {
      try {
        const s=current();
        if(!configured(s)||e.roomId.startsWith('_'))return;
        const payload=(e.payload??{}) as {turnId?:unknown;status?:unknown;reason?:unknown;questionId?:unknown;guestReply?:unknown};
        let id=e.id;
        let question=false;
        if(e.type==='turn_finished') {
          if(typeof payload.turnId!=='string'||payload.status!=='finished'||payload.reason==='awaiting_input')return;
          const turn=db.prepare('SELECT state_json FROM turns WHERE id=? AND room_id=? AND bot_id=?').get(payload.turnId,e.roomId,e.actor) as {state_json:string}|undefined;
          if(!turn)return;
          const state=JSON.parse(turn.state_json);
          if(state.unattended||state.isolated||(state.source&&state.source!=='slack'&&!state.source.startsWith('slack:'))||state.delegatedBy||state.agentRequestId)return;
          const last=db.prepare("SELECT max(id) id FROM events WHERE room_id=? AND actor=? AND type='bot_output' AND json_extract(payload_json,'$.turnId')=?").get(e.roomId,e.actor,payload.turnId) as {id:number|null};
          if(!last.id)return;
          id=last.id;
        } else if(e.type==='message' && typeof payload.questionId==='string') {
          question=true;
          if(!db.prepare("SELECT 1 FROM work_questions WHERE id=? AND room_id=? AND status='open'").get(payload.questionId,e.roomId))return;
        } else if(e.type!=='message'||payload.guestReply!==true)return;
        const read=(db.prepare('SELECT event_id FROM conversation_read WHERE room_id=?').get(e.roomId) as {event_id:number}|undefined)?.event_id??0;
        if(id<=read||!admit(false,true))return;
        const bot=db.prepare('SELECT name FROM bots WHERE id=?').get(e.actor) as {name:string}|undefined;
        const name=nameOr(bot?.name,nameOr(e.actor,'an agent'));
        await send(question?`Response needed from ${name}. Open OpenAg to answer.`:`New reply from ${name}. Open OpenAg to read it.`,3,s,roomLink(e.roomId),`conversation:${e.roomId}:${id}`);
      } catch { /* notifications never affect a conversation */ }
    },

    async notifyInteraction(e) {
      try {
        const s = current(), id = e.payload?.interactionId;
        if (!configured(s) || e.payload?.status !== "open" || typeof id !== "string" || !id) return;
        const key = `interaction:${id}`;
        if (seenNotifications.has(key)) return;
        seenNotifications.add(key);
        seenOrder.push(key);
        if (seenOrder.length > DEDUPE_MAX) seenNotifications.delete(seenOrder.shift()!);
        if (!admit(false)) return;
        await send(`Response needed: ${nameOr(e.actor, "an agent")}. Open OpenAg to answer a provider request.`, 4, s, roomLink(e.roomId), key);
      } catch {
        /* a failed push never reaches the ledger or the turn */
      }
    },

    async notifyApproval(e) {
      try {
        const s = current();
        if (!configured(s)) return;
        const payload = e.payload ?? {};
        const approvalId = typeof payload.approvalId === "string" ? payload.approvalId : null;
        if (approvalId !== null) {
          if (seenNotifications.has(approvalId)) return;
          seenNotifications.add(approvalId);
          seenOrder.push(approvalId);
          if (seenOrder.length > DEDUPE_MAX) seenNotifications.delete(seenOrder.shift()!);
        }
        if (!admit(false)) return;
        const bot = nameOr(e.actor, "an agent");
        const tool = nameOr(payload.toolName, "a tool");
        const via = typeof payload.source === "string" && payload.source.startsWith("slack") ? " (from Slack)" : "";
        await send(`Approval needed: ${bot} wants ${tool}${via}. Open their conversation in OpenAg.`, 4, s, approvalId !== null ? `#/approvals/${encodeURIComponent(approvalId)}` : roomLink(e.roomId), approvalId !== null ? `approval:${approvalId}` : undefined);
      } catch {
        /* a failed push never reaches the ledger or the turn */
      }
    },

    async notifyPing(p) {
      try {
        const s = current();
        if (!configured(s)) return;
        if (!admit(false)) return;
        const bot = nameOr(p.botId, "an agent");
        const priority = p.urgency === "high" ? 5 : p.urgency === "low" ? 3 : 4;
        const message = s.includeDetail
          ? `Heads-up from ${bot}: ${clip(redactor.redactString(String(p.reason ?? "")), REASON_MAX)}`
          : `Heads-up from ${bot}. Open OpenAg to read it.`;
        await send(message, priority, s);
      } catch {
        /* see notifyApproval */
      }
    },

    async sendTest() {
      try {
        const s = current();
        if (!configured(s)) return { ok: false, reason: NOT_CONFIGURED };
        if (!admit(true)) return { ok: false, reason: "rate limit reached" };
        return await send("Test notification from OpenAg", 3, s, "#/settings/proactive/notifications");
      } catch {
        return { ok: false, reason: "Error" };
      }
    },

    async sendWebTest(deviceId) {
      try {
        const s = current();
        if (!s.webPush.enabled || s.webPush.subject === null || !deps.webPush) return { ok: false, reason: "Web Push is not enabled" };
        if (!admit(true)) return { ok: false, reason: "rate limit reached" };
        const r = await deps.webPush.sendToDevice(deviceId, { title: TITLE, body: "Test notification from OpenAg", url: "/#/settings/proactive/notifications" }, { urgency: "normal" }, s.webPush.subject);
        return r.sent > 0 ? { ok: true } : { ok: false, reason: r.failed > 0 ? "Web Push delivery failed" : "this device has no subscription" };
      } catch {
        return { ok: false, reason: "Error" };
      }
    },

    async notifyUser(text) {
      try {
        const s = current();
        if (!configured(s)) return { ok: false, reason: NOT_CONFIGURED };
        if (!admit(false)) return { ok: false, reason: "rate limit reached" };
        return await send(text, 4, s);
      } catch {
        return { ok: false, reason: "Error" };
      }
    },

    status() {
      const s = current();
      prune(now());
      return {
        enabled: s.enabled,
        configured: s.topic !== null,
        sentThisHour: sentAt.length,
        dropped,
        lastSentAt,
        lastError,
        webPush: { enabled: s.webPush.enabled, ready: webReady(s), subscriptions: deps.webPush?.count() ?? 0 },
      };
    },
  };
}

/** Live events only: a restart never reopens a provider request or repeats its notification. */
export function registerPushNotifications(ledger: Ledger, pusher: Pusher) {
  const pending=new Map<string,ReturnType<typeof setTimeout>>();
  const off=ledger.subscribe("*", e => {
    if (e.type === "approval_requested" && !e.roomId.startsWith("_agent-request-"))
      void pusher.notifyApproval({ actor: e.actor, roomId: e.roomId, payload: (e.payload ?? {}) as { toolName?: unknown; approvalId?: unknown; source?: unknown } });
    if (e.type === "mcp_interaction_updated")
      void pusher.notifyInteraction({ actor: e.actor, roomId: e.roomId, payload: (e.payload ?? {}) as { interactionId?: unknown; status?: unknown } });
    const payload=(e.payload??{}) as {turnId?:unknown;status?:unknown;reason?:unknown;questionId?:unknown;guestReply?:unknown};
    const key=e.type==='turn_finished'&&payload.status==='finished'&&payload.reason!=='awaiting_input'&&typeof payload.turnId==='string'?`turn:${payload.turnId}`:
      e.type==='message'&&typeof payload.questionId==='string'?`question:${payload.questionId}`:
      e.type==='message'&&payload.guestReply===true?`guest:${e.id}`:null;
    if(key&&!pending.has(key)&&!e.roomId.startsWith('_')){
      const timer=setTimeout(()=>{pending.delete(key);void pusher.notifyConversation(e);},5000);
      timer.unref();pending.set(key,timer);
    }
  });
  return ()=>{off();for(const timer of pending.values())clearTimeout(timer);pending.clear();};
}

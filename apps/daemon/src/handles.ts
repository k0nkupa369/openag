import type { Db } from "./db/index.js";
import { getDefaultRedactor } from "./redact.js";
import type { Ledger } from "./ledger.js";
import { getBot, type Bot } from "./rooms.js";

// Mentions match `@[A-Za-z0-9][A-Za-z0-9_-]*`, so a handle must stay inside that alphabet to be addressable.
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
// Ledger actors share the handle namespace; collisions would misattribute bot messages.
export const RESERVED_HANDLES: ReadonlySet<string> = new Set(["everyone", "user", "slack", "owner", "primary", "daemon", "scheduler", "system", "poll", "constructor", "prototype"]);

export class HandleError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

/** Lowercase handle -> bot id, covering current handles and retired ones. Ids are never used as addresses directly. */
export type HandleIndex = ReadonlyMap<string, string>;

export function normalizeHandle(value: unknown): string {
  if (typeof value !== "string") throw new HandleError("handle must be a string");
  if (getDefaultRedactor().redactString(value) !== value) throw new HandleError("Handle contains a secret");
  const handle = value.trim().toLowerCase();
  if (getDefaultRedactor().redactString(handle) !== handle) throw new HandleError("Handle contains a secret");
  if (!HANDLE_PATTERN.test(handle)) throw new HandleError("Use 1–48 letters, numbers, hyphens or underscores, starting with a letter or number.");
  if (RESERVED_HANDLES.has(handle)) throw new HandleError(`@${handle} is reserved.`, 409);
  return handle;
}

export function handleIndex(db: Db): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of db.prepare("SELECT id, handle FROM bots").all() as { id: string; handle: string | null }[]) {
    index.set((row.handle ?? row.id).toLowerCase(), row.id);
  }
  for (const row of db.prepare("SELECT handle, bot_id FROM agent_handle_reservations").all() as { handle: string; bot_id: string }[]) {
    if (!index.has(row.handle)) index.set(row.handle, row.bot_id);
  }
  return index;
}

/** The bot holding a handle, current or retired. Undefined when the handle is free. */
export function handleOwner(db: Db, handle: string): string | undefined {
  const current = db.prepare("SELECT id FROM bots WHERE lower(handle) = ?").get(handle) as { id: string } | undefined;
  if (current) return current.id;
  const reserved = db.prepare("SELECT bot_id FROM agent_handle_reservations WHERE handle = ?").get(handle) as { bot_id: string } | undefined;
  return reserved?.bot_id;
}

/** A new bot id or handle is free when no bot holds it now or once did, and no bot has that id. */
export function handleAvailable(db: Db, handle: string): boolean {
  return handleOwner(db, handle) === undefined && getBot(db, handle) === undefined;
}

/**
 * Changes the handle of an existing bot. The bot id never changes. The previous handle is reserved to this bot, so no other
 * agent can take it and it keeps addressing this agent. Runs in one transaction with its audit event.
 */
export function setBotHandle(db: Db, ledger: Ledger, botId: string, value: unknown, actor:string="user"): { bot: Bot; changed: boolean } {
  const next = normalizeHandle(value);
  return ledger.atomic(() => {
    const bot = getBot(db, botId);
    if (!bot) throw new HandleError("bot not found", 404);
    const previous = bot.handle.toLowerCase();
    if (previous === next) return { bot, changed: false };
    const owner = handleOwner(db, next);
    if (owner !== undefined && owner !== botId) throw new HandleError(`@${next} is already used or reserved.`, 409);
    const otherBot = getBot(db, next);
    if (otherBot && otherBot.id !== botId) throw new HandleError(`@${next} is already used or reserved.`, 409);
    // Taking back a handle this agent retired releases its reservation; the old one becomes reserved in its place.
    db.prepare("DELETE FROM agent_handle_reservations WHERE handle = ? AND bot_id = ?").run(next, botId);
    db.prepare("INSERT OR IGNORE INTO agent_handle_reservations (handle, bot_id, reserved_at) VALUES (?, ?, ?)").run(previous, botId, Date.now());
    db.prepare("UPDATE bots SET handle = ? WHERE id = ?").run(next, botId);
    ledger.append("_system", actor, "config", { botId, action: "bot_handle_changed", from: previous, to: next });
    return { bot: getBot(db, botId)!, changed: true };
  });
}

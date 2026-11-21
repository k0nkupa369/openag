import { canonical } from "./action-receipts.js";
import { z } from "zod";
import type { Db } from "./db/index.js";
import { createHash, randomBytes } from "node:crypto";
import type { Ledger } from "./ledger.js";
import { addMember, createRoom, getBot, getRoom, listRooms, type Room, type RoomKind } from "./rooms.js";
import { getDefaultRedactor } from "./redact.js";

export class RoomCreationError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message); }
}

const requestIdSchema = z.string().uuid();

export function readRoomCreation(db: Db, requestId: string): Room | undefined {
  if (!requestIdSchema.safeParse(requestId).success) throw new RoomCreationError("Invalid creation request id");
  const receipt = db.prepare("SELECT room_id FROM room_creations WHERE request_id = ?").get(requestId) as { room_id: string } | undefined;
  return receipt ? getRoom(db, receipt.room_id) : undefined;
}

/** The existing direct chat with `botId`, by kind (never by member count). */
export function findDirectChat(db: Db, botId: string): Room | undefined {
  return listRooms(db).find((room) => room.kind === "direct" && room.members.length === 1 && room.members[0] === botId && room.leadBotId === botId);
}

/** The direct chat with a bot, created on first use. Safe to call repeatedly. */
export function ensureDirectChat(db: Db, ledger: Ledger, botId: string): Room | undefined {
  const bot = getBot(db, botId);
  if (!bot) return undefined;
  return db
    .transaction(() => {
      const existing = findDirectChat(db, botId);
      if (existing) return existing;
      const id = `chat-${randomBytes(16).toString("hex")}`;
      createRoom(db, { id, name: bot.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) || "Conversation", leadBotId: bot.id, kind: "direct" });
      addMember(db, id, bot.id);
      ledger.append("_system", "owner", "config", { kind: "room_created", roomId: id, members: [bot.id], roomKind: "direct" });
      return getRoom(db, id)!;
    })
    .immediate();
}

export interface DeskRoomInput { id: string; name: string; members: string[]; kind: RoomKind; lead: string; requestId?: string }

/** Validates a desk room creation body without writing. Throws RoomCreationError. */
export function validateDeskRoom(db: Db, body: unknown): DeskRoomInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RoomCreationError("body must be an object");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["id", "name", "members", "kind", "lead", "requestId"].includes(key))) throw new RoomCreationError("unknown room field");
  if (input.kind !== undefined && input.kind !== "room" && input.kind !== "direct") throw new RoomCreationError("kind must be room or direct");
  const kind: RoomKind = input.kind === "direct" ? "direct" : "room";
  if (typeof input.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(input.id)) throw new RoomCreationError("id must be a public room slug (1–64 lowercase letters, digits or hyphens)");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(input.name)) throw new RoomCreationError("name must contain 1–80 characters without control characters");
  const members = input.members === undefined ? [] : input.members;
  if (!Array.isArray(members) || members.length < 1 || members.length > 50 || members.some((id) => typeof id !== "string" || !getBot(db, id))) throw new RoomCreationError("members must contain 1–50 known bot ids");
  if (new Set(members).size !== members.length) throw new RoomCreationError("duplicate member");
  if (kind === "direct" && members.length !== 1) throw new RoomCreationError("a direct chat has exactly one bot");
  const lead = input.lead === undefined ? members[0] : input.lead;
  if (typeof lead !== "string" || !members.includes(lead)) throw new RoomCreationError("the lead must be a member of the room");
  if (input.requestId !== undefined && (!requestIdSchema.safeParse(input.requestId).success || kind !== "room")) throw new RoomCreationError("a creation request id must be a UUID for a named room");
  return { id: input.id, name: input.name.trim(), members: members as string[], kind, lead, ...(input.requestId === undefined ? {} : { requestId: input.requestId as string }) };
}

/**
 * Creation and direct-chat reuse are decided together by the daemon, including concurrent requests. `kind` is explicit:
 * a `direct` chat has exactly one member and reuses that bot's existing direct chat; a `room` is always created (a named
 * one-bot room is a room, never mistaken for a direct chat).
 */
export function createDeskRoom(db: Db, ledger: Ledger, body: unknown, audit: Record<string, unknown> = {}) {
  const { id, members, kind, lead, requestId, ...input } = validateDeskRoom(db, body);
  const hash = createHash("sha256").update(canonical({ id, name: input.name, members: [...members].sort(), kind, lead })).digest("hex");
  const name = getDefaultRedactor().redactString(input.name);
  return ledger.atomic(() => {
    if (requestId) {
      const receipt = db.prepare("SELECT room_id, payload_hash FROM room_creations WHERE request_id = ?").get(requestId) as { room_id: string; payload_hash: string } | undefined;
      if (receipt) {
        if (receipt.payload_hash !== hash) throw new RoomCreationError("This creation request already has different content. Check its room before starting another creation.", 409);
        return { room: getRoom(db, receipt.room_id)!, created: false };
      }
    }
    if (getRoom(db, id)) throw new RoomCreationError("room id already exists", 409);
    if (kind === "direct") {
      const existing = findDirectChat(db, members[0]!);
      if (existing) return { room: existing, created: false };
    }
    createRoom(db, { id, name, leadBotId: lead, kind });
    for (const bot of members) addMember(db, id, bot);
    if (requestId) db.prepare("INSERT INTO room_creations (request_id, room_id, payload_hash) VALUES (?, ?, ?)").run(requestId, id, hash);
    ledger.append("_system", "owner", "config", { kind: "room_created", roomId: id, members, lead, roomKind: kind, ...audit });
    return { room: getRoom(db, id)!, created: true };
  });
}

export const roomUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "no control characters").optional(),
  description: z.string().trim().max(500).refine(v => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v), "no control characters").optional(),
  leadBotId: z.string().min(1).max(64).optional(),
  addMembers: z.array(z.string().min(1).max(64)).min(1).max(50).refine(ids => new Set(ids).size === ids.length, "duplicate member").optional(),
  removeMembers: z.array(z.string().min(1).max(64)).min(1).max(50).refine(ids => new Set(ids).size === ids.length, "duplicate member").optional(),
}).strict();
export type RoomUpdate = z.infer<typeof roomUpdateSchema>;

export interface RoomUpdatePlan { room: Room; next: { name: string; description: string; leadBotId: string | null; members: string[] }; added: string[]; removed: string[] }

/**
 * Checks a room edit against the current room without writing. Direct chats keep exactly one agent; a named room keeps
 * at least one member and its lead must stay a member (remove the lead only together with choosing a new one).
 */
export function planRoomUpdate(db: Db, roomId: string, patch: RoomUpdate): RoomUpdatePlan {
  if (Object.keys(patch).length === 0) throw new RoomCreationError("name (1–80 chars), description (up to 500), leadBotId, addMembers or removeMembers required");
  const room = getRoom(db, roomId);
  if (!room || room.id.startsWith("_")) throw new RoomCreationError("room not found", 404);
  const { name, description, leadBotId, addMembers = [], removeMembers = [] } = patch;
  if ((addMembers.length || removeMembers.length) && room.kind === "direct") throw new RoomCreationError("agents can only be added to or removed from named rooms");
  if (addMembers.some(id => !getBot(db, id))) throw new RoomCreationError("members must be known agent ids");
  if (addMembers.some(id => removeMembers.includes(id))) throw new RoomCreationError("an agent cannot be added and removed together");
  if (removeMembers.some(id => !room.members.includes(id))) throw new RoomCreationError("only current members can be removed");
  const added = addMembers.filter(id => !room.members.includes(id));
  const members = [...room.members.filter(id => !removeMembers.includes(id)), ...added];
  if (members.length > 50) throw new RoomCreationError("a room can have at most 50 agents");
  if (members.length === 0) throw new RoomCreationError("a room must keep at least one agent");
  const lead = leadBotId ?? room.leadBotId;
  if (lead === null || !members.includes(lead)) throw new RoomCreationError(leadBotId === undefined && room.leadBotId !== null && removeMembers.includes(room.leadBotId) ? "choose a new lead before removing the current one" : "the lead must be a member of the room");
  const redact = getDefaultRedactor();
  return {
    room, added, removed: removeMembers,
    next: { name: name === undefined ? room.name : redact.redactString(name), description: description === undefined ? room.description ?? "" : redact.redactString(description), leadBotId: lead, members },
  };
}

/** Applies a room edit (owner route and accepted proposals). Throws RoomCreationError. */
export function updateDeskRoom(db: Db, ledger: Ledger, roomId: string, patch: RoomUpdate, audit: Record<string, unknown> = {}): Room {
  return ledger.atomic(() => {
    const { room, next, added, removed } = planRoomUpdate(db, roomId, patch);
    for (const id of added) addMember(db, room.id, id);
    for (const id of removed) db.prepare("DELETE FROM room_members WHERE room_id = ? AND bot_id = ?").run(room.id, id);
    db.prepare("UPDATE rooms SET name = ?, description = ?, lead_bot_id = ? WHERE id = ?").run(next.name, next.description, next.leadBotId, room.id);
    ledger.append("_system", "owner", "config", {
      action: "room_updated",
      roomId: room.id,
      changed: [...(next.name !== room.name ? ["name"] : []), ...(next.description !== (room.description ?? "") ? ["description"] : []), ...(next.leadBotId !== room.leadBotId ? ["lead"] : []), ...(added.length || removed.length ? ["members"] : [])],
      ...(added.length ? { addedMembers: added } : {}),
      ...(removed.length ? { removedMembers: removed } : {}),
      ...(next.leadBotId !== room.leadBotId ? { lead: { from: room.leadBotId, to: next.leadBotId } } : {}),
      ...audit,
    });
    // Visible in the room's own history so members can see who answers unmentioned messages now.
    if (next.leadBotId !== room.leadBotId) ledger.append(room.id, "owner", "config", { action: "room_lead_changed", from: room.leadBotId, to: next.leadBotId });
    return getRoom(db, room.id)!;
  });
}

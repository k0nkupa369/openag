import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ProposalError, type ManagementDeps, type ProposalKind } from "./management-proposals.js";
import { createDeskRoom, ensureDirectChat, findDirectChat, planRoomUpdate, RoomCreationError, updateDeskRoom, validateDeskRoom } from "./roomcreation.js";
import { getBot, getRoom } from "./rooms.js";

/**
 * Room proposals: create a named room, or change one (name, add or remove agents, lead); and open a direct chat with a
 * bot. Apply goes through the same room services as the desk (`createDeskRoom`, `updateDeskRoom`, `ensureDirectChat`).
 */

export const MANAGEMENT_ROOM_TOOL = "management_room";
export const MANAGEMENT_DIRECT_CHAT_TOOL = "management_direct_chat";

const ids = z.array(z.string().min(1).max(64)).min(1).max(50);
export const roomProposalSchema = z.object({
  action: z.enum(["create", "update"]),
  roomId: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(80).optional(),
  members: ids.optional(),
  addMembers: ids.optional(),
  removeMembers: ids.optional(),
  leadBotId: z.string().min(1).max(64).optional(),
}).strict();
export type RoomProposalInput = z.infer<typeof roomProposalSchema>;

const change = z.object({ field: z.string(), from: z.string(), to: z.string() }).strict();
const display = z.object({ changes: z.array(change), notes: z.array(z.string()) }).strict();
const base = z.object({ name: z.string(), leadBotId: z.string().nullable(), members: z.array(z.string()) }).strict();
const roomPayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), room: z.object({ id: z.string(), name: z.string(), members: z.array(z.string()), lead: z.string() }).strict(), display }).strict(),
  z.object({ action: z.literal("update"), roomId: z.string(), base, patch: z.record(z.string(), z.unknown()), display }).strict(),
]);

const botName = (deps: ManagementDeps, id: string | null) => (id === null ? "None" : getBot(deps.db, id)?.name ?? id);
const botNames = (deps: ManagementDeps, list: readonly string[]) => list.map(id => botName(deps, id)).join(", ");
const snapshot = (room: { name: string; leadBotId: string | null; members: string[] }) => ({ name: room.name, leadBotId: room.leadBotId, members: [...room.members].sort() });
const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "room";
const roomError = (err: unknown, outcome: "not-run" | "failed" = "not-run") => (err instanceof RoomCreationError ? new ProposalError(err.message, outcome) : err);

/** Enabled automations that run as one of `botIds` in this room; removing those agents stops them. */
function affectedAutomations(deps: ManagementDeps, roomId: string, botIds: readonly string[]): number {
  if (!botIds.length) return 0;
  const row = deps.db.prepare(`SELECT count(*) AS n FROM automations WHERE room_id = ? AND enabled = 1 AND bot_id IN (${botIds.map(() => "?").join(",")})`).get(roomId, ...botIds) as { n: number };
  return row.n;
}

export const roomProposal: ProposalKind<RoomProposalInput> = {
  tool: "propose_room",
  approvalTool: MANAGEMENT_ROOM_TOOL,
  input: roomProposalSchema,
  description: "Propose creating a named room (action create: name, members as bot ids, optional leadBotId) or changing one (action update: roomId plus any of name, addMembers, removeMembers, leadBotId). A room keeps at least one agent and its lead must stay a member; to remove the lead, also choose a new leadBotId. Direct chats cannot change members. Nothing changes until the owner or a full-access device accepts the card shown in this conversation; it expires after 24 hours. Never say the change is done.",
  prepare(deps, _ctx, input) {
    const { action, roomId, name, members, addMembers, removeMembers, leadBotId } = input;
    try {
      if (action === "create") {
        if (roomId || addMembers || removeMembers) throw new ProposalError("create takes name, members and optional leadBotId");
        if (!name || !members) throw new ProposalError("create needs name and members");
        let id = slug(name);
        if (getRoom(deps.db, id)) id = `${id.slice(0, 55)}-${randomBytes(3).toString("hex")}`;
        const room = validateDeskRoom(deps.db, { id, name, members, kind: "room", ...(leadBotId ? { lead: leadBotId } : {}) });
        return {
          payload: {
            action, room: { id: room.id, name: room.name, members: room.members, lead: room.lead },
            display: { changes: [{ field: "Name", from: "", to: room.name }, { field: "Agents", from: "", to: botNames(deps, room.members) }, { field: "Lead", from: "", to: botName(deps, room.lead) }], notes: [] },
          },
          verb: "create room", name: room.name,
        };
      }
      if (!roomId) throw new ProposalError("update needs roomId");
      if (members) throw new ProposalError("update takes addMembers or removeMembers, not members");
      const patch = Object.fromEntries(Object.entries({ name, addMembers, removeMembers, leadBotId }).filter(([, v]) => v !== undefined));
      const plan = planRoomUpdate(deps.db, roomId, patch);
      const before = snapshot(plan.room), after = snapshot(plan.next);
      const changes = [
        ...(before.name !== after.name ? [{ field: "Name", from: before.name, to: after.name }] : []),
        ...(before.members.join() !== after.members.join() ? [{ field: "Agents", from: botNames(deps, plan.room.members), to: botNames(deps, plan.next.members) }] : []),
        ...(before.leadBotId !== after.leadBotId ? [{ field: "Lead", from: botName(deps, before.leadBotId), to: botName(deps, after.leadBotId) }] : []),
      ];
      if (!changes.length) throw new ProposalError("nothing would change");
      const stopped = affectedAutomations(deps, roomId, plan.removed);
      const notes = stopped ? [`${stopped} automation${stopped === 1 ? "" : "s"} in this room run${stopped === 1 ? "s" : ""} as ${plan.removed.length === 1 ? "this agent" : "these agents"} and will stop running.`] : [];
      return { payload: { action, roomId, base: before, patch, display: { changes, notes } }, verb: "change room", name: plan.room.name };
    } catch (err) {
      throw roomError(err);
    }
  },
  apply(deps, stored, by) {
    const parsed = roomPayload.safeParse(stored);
    if (!parsed.success) throw new ProposalError("the stored proposal is invalid");
    const p = parsed.data;
    try {
      if (p.action === "create") {
        const { room } = createDeskRoom(deps.db, deps.ledger, { id: p.room.id, name: p.room.name, members: p.room.members, kind: "room", lead: p.room.lead }, { by });
        return { detail: `Room "${room.name}" created.`, audit: { target: "room", change: "create", id: room.id } };
      }
      const current = getRoom(deps.db, p.roomId);
      if (!current) throw new ProposalError("the room no longer exists");
      if (JSON.stringify(snapshot(current)) !== JSON.stringify(p.base)) throw new ProposalError("the room changed after this was proposed; ask for a new proposal");
      const room = updateDeskRoom(deps.db, deps.ledger, p.roomId, p.patch, { by });
      return { detail: `Room "${room.name}" updated.`, audit: { target: "room", change: "update", id: room.id } };
    } catch (err) {
      throw roomError(err, "failed");
    }
  },
};

export const directChatProposalSchema = z.object({ botId: z.string().min(1).max(64) }).strict();
export type DirectChatProposalInput = z.infer<typeof directChatProposalSchema>;
const directPayload = z.object({ botId: z.string(), display }).strict();

export const directChatProposal: ProposalKind<DirectChatProposalInput> = {
  tool: "propose_direct_chat",
  approvalTool: MANAGEMENT_DIRECT_CHAT_TOOL,
  input: directChatProposalSchema,
  description: "Propose opening a one-to-one direct chat with a bot (botId). Refused if that bot already has one. Nothing changes until the owner or a full-access device accepts the card shown in this conversation; it expires after 24 hours. Never say it is done.",
  prepare(deps, _ctx, input) {
    const bot = getBot(deps.db, input.botId);
    if (!bot) throw new ProposalError("bot not found");
    const existing = findDirectChat(deps.db, bot.id);
    if (existing) throw new ProposalError(`${bot.name} already has a direct chat (${existing.id})`);
    return { payload: { botId: bot.id, display: { changes: [{ field: "Direct chat", from: "", to: bot.name }], notes: [] } }, verb: "open a direct chat with", name: bot.name };
  },
  apply(deps, stored, by) {
    const parsed = directPayload.safeParse(stored);
    if (!parsed.success) throw new ProposalError("the stored proposal is invalid");
    const room = ensureDirectChat(deps.db, deps.ledger, parsed.data.botId);
    if (!room) throw new ProposalError("the bot no longer exists");
    deps.ledger.append("_system", "owner", "config", { action: "direct_chat_opened", roomId: room.id, botId: parsed.data.botId, by });
    return { detail: `Direct chat with ${botName(deps, parsed.data.botId)} is ready.`, audit: { target: "direct_chat", change: "open", id: room.id } };
  },
};

import { z } from "zod";
import { ProposalError, type ManagementDeps, type ProposalKind } from "./management-proposals.js";
import { getBot, getRoom } from "./rooms.js";
import { getSetting, KNOWN_SETTINGS, setSetting, SettingsError } from "./settings.js";

/**
 * Settings proposals: the proactive switches (heartbeat, morning brief, nightly reflection) and the delivery room.
 * The stale check compares the whole current value with the value when proposed, so any edit in between refuses the
 * proposal. Apply is the same validated write and `setting_changed` audit event as `PUT /settings/:key`; the schedulers
 * read these settings live, so nothing else needs to reload.
 */

export const MANAGEMENT_PROACTIVE_TOOL = "management_proactive";
export const MANAGEMENT_DELIVERY_TOOL = "management_delivery_room";

const FEATURES = { heartbeat: "scheduled checks", brief: "morning brief", reflection: "nightly reflection" } as const;
type Feature = keyof typeof FEATURES;
/** Which fields each feature takes. The heartbeat prompt and reflection limits stay on the settings pages. */
const FIELDS: Record<Feature, readonly string[]> = { heartbeat: ["enabled", "everyMinutes", "botId"], brief: ["enabled", "time", "days"], reflection: ["enabled", "time", "botId"] };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const changeSchema = z.object({ field: z.string(), from: z.string(), to: z.string() }).strict();
export type SettingChange = z.infer<typeof changeSchema>;
const displaySchema = z.object({ changes: z.array(changeSchema) }).strict();

export const proactiveProposalSchema = z.object({
  feature: z.enum(["heartbeat", "brief", "reflection"]),
  enabled: z.boolean().optional(),
  everyMinutes: z.number().int().min(5).max(1440).optional(),
  time: z.string().regex(TIME, "time must be HH:MM").optional(),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  /** null = the default bot. */
  botId: z.string().min(1).max(200).nullable().optional(),
}).strict();
export type ProactiveProposalInput = z.infer<typeof proactiveProposalSchema>;

const proactivePayload = z.object({
  feature: z.enum(["heartbeat", "brief", "reflection"]),
  base: z.record(z.string(), z.unknown()),
  value: z.record(z.string(), z.unknown()),
  display: displaySchema,
}).strict();

const botLabel = (deps: ManagementDeps, id: unknown) => (typeof id === "string" ? getBot(deps.db, id)?.name ?? id : "Default bot");
function shown(deps: ManagementDeps, field: string, value: unknown): string {
  if (field === "enabled") return value ? "On" : "Off";
  if (field === "everyMinutes") return `Every ${value} minutes`;
  if (field === "days") return Array.isArray(value) ? [...value].sort().map(d => DAY_NAMES[d as number]).join(", ") : String(value);
  if (field === "botId") return botLabel(deps, value);
  return String(value);
}
const LABELS: Record<string, string> = { enabled: "Status", everyMinutes: "Interval", time: "Time", days: "Days", botId: "Bot" };

/** Same write and audit event as PUT /settings/:key, attributed to the proposal. */
function writeSetting(deps: ManagementDeps, key: "heartbeat" | "brief" | "reflection" | "deliveryRoom", value: unknown, by: string): void {
  const from = getSetting(deps.db, key);
  let to: unknown;
  try { to = setSetting(deps.db, key, value); }
  catch (err) { if (err instanceof SettingsError) throw new ProposalError(err.message, "failed"); throw err; }
  deps.ledger.append("_system", "user", "config", { action: "setting_changed", key, from, to, by });
}

export const proactiveProposal: ProposalKind<ProactiveProposalInput> = {
  tool: "propose_proactive",
  approvalTool: MANAGEMENT_PROACTIVE_TOOL,
  input: proactiveProposalSchema,
  description: "Propose a change to scheduled checks (feature heartbeat: enabled, everyMinutes 5-1440, botId), the morning brief (feature brief: enabled, time HH:MM, days 0=Sunday) or nightly reflection (feature reflection: enabled, time HH:MM, botId). botId null means the default bot. Give only the fields to change. Nothing changes until the owner or a full-access device accepts the card shown in this conversation; it expires after 24 hours. Never say the change is done.",
  prepare(deps, _ctx, input) {
    const { feature, ...fields } = input;
    const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const extra = Object.keys(given).filter(key => !FIELDS[feature].includes(key));
    if (extra.length) throw new ProposalError(`${feature} does not take ${extra.join(", ")}`);
    if (typeof given.botId === "string" && !getBot(deps.db, given.botId)) throw new ProposalError("bot not found");
    const base = getSetting(deps.db, feature) as Record<string, unknown>;
    const parsed = KNOWN_SETTINGS[feature].safeParse({ ...base, ...given });
    if (!parsed.success) throw new ProposalError(parsed.error.issues.map(i => `${i.path.join(".") || feature}: ${i.message}`).join("; "));
    const value = parsed.data as Record<string, unknown>;
    const changes = FIELDS[feature].filter(key => JSON.stringify(base[key]) !== JSON.stringify(value[key]))
      .map(key => ({ field: LABELS[key]!, from: shown(deps, key, base[key]), to: shown(deps, key, value[key]) }));
    if (!changes.length) throw new ProposalError("nothing would change");
    const onlySwitch = changes.length === 1 && Object.keys(given).every(key => key === "enabled");
    const verb = onlySwitch ? `${value.enabled ? "turn on" : "turn off"} the ${FEATURES[feature]}` : `change the ${FEATURES[feature]}`;
    return { payload: { feature, base, value, display: { changes } }, verb, name: null };
  },
  apply(deps, stored, by) {
    const parsed = proactivePayload.safeParse(stored);
    if (!parsed.success) throw new ProposalError("the stored proposal is invalid");
    const p = parsed.data;
    if (JSON.stringify(getSetting(deps.db, p.feature)) !== JSON.stringify(p.base)) throw new ProposalError(`the ${FEATURES[p.feature]} settings changed after this was proposed; ask for a new proposal`);
    if (typeof p.value.botId === "string" && !getBot(deps.db, p.value.botId)) throw new ProposalError("the chosen bot no longer exists");
    writeSetting(deps, p.feature, p.value, by);
    return { detail: `The ${FEATURES[p.feature]} settings were updated.`, audit: { target: "setting", change: p.feature } };
  },
};

export const deliveryRoomProposalSchema = z.object({
  /** null = the default bot's direct chat. */
  roomId: z.string().min(1).max(200).nullable(),
}).strict();
export type DeliveryRoomProposalInput = z.infer<typeof deliveryRoomProposalSchema>;
const deliveryPayload = z.object({ base: z.string().nullable(), roomId: z.string().nullable(), display: displaySchema }).strict();

const DIRECT_DEFAULT = "The default bot's direct chat";
const roomLabel = (deps: ManagementDeps, id: string | null) => {
  if (id === null) return DIRECT_DEFAULT;
  const room = getRoom(deps.db, id);
  return room ? (room.kind === "direct" ? `${(room.leadBotId && getBot(deps.db, room.leadBotId)?.name) || room.name} (direct chat)` : room.name) : `${id} (missing)`;
};

export const deliveryRoomProposal: ProposalKind<DeliveryRoomProposalInput> = {
  tool: "propose_delivery_room",
  approvalTool: MANAGEMENT_DELIVERY_TOOL,
  input: deliveryRoomProposalSchema,
  description: "Propose where proactive messages (pings, the morning brief and reflection proposals) are posted: roomId of an existing conversation, or null for the default bot's direct chat. Nothing changes until the owner or a full-access device accepts the card shown in this conversation; it expires after 24 hours. Never say the change is done.",
  prepare(deps, _ctx, input) {
    if (input.roomId !== null && (input.roomId.startsWith("_") || !getRoom(deps.db, input.roomId))) throw new ProposalError("room not found");
    const base = getSetting(deps.db, "deliveryRoom").roomId;
    if (base === input.roomId) throw new ProposalError("proactive messages already go there");
    const to = roomLabel(deps, input.roomId);
    return {
      payload: { base, roomId: input.roomId, display: { changes: [{ field: "Delivery", from: roomLabel(deps, base), to }] } },
      verb: input.roomId === null ? "send proactive messages to the default bot's direct chat" : "send proactive messages to",
      name: input.roomId === null ? null : to,
    };
  },
  apply(deps, stored, by) {
    const parsed = deliveryPayload.safeParse(stored);
    if (!parsed.success) throw new ProposalError("the stored proposal is invalid");
    const p = parsed.data;
    if (getSetting(deps.db, "deliveryRoom").roomId !== p.base) throw new ProposalError("the delivery room changed after this was proposed; ask for a new proposal");
    if (p.roomId !== null && !getRoom(deps.db, p.roomId)) throw new ProposalError("the conversation no longer exists");
    writeSetting(deps, "deliveryRoom", { roomId: p.roomId }, by);
    return { detail: `Proactive messages now go to ${roomLabel(deps, p.roomId)}.`, audit: { target: "setting", change: "deliveryRoom" } };
  },
};

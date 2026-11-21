import { z } from "zod";
import { AutomationError, getAutomation, previewAutomationChange, type Automation } from "./automations.js";
import { ProposalError, type ManagementDeps, type ProposalKind } from "./management-proposals.js";
import { getBot, getRoom } from "./rooms.js";

/** Automation proposals: create, change, turn on, pause or delete a cron automation that posts to a conversation. */

export const MANAGEMENT_AUTOMATION_TOOL = "management_automation";
const VERBS = { create: "create", update: "change", enable: "turn on", disable: "pause", delete: "delete" } as const;

const field = { name: z.string().max(200).optional(), scheduleCron: z.string().max(200).optional(), tz: z.string().max(100).nullable().optional(),
  roomId: z.string().max(200).optional(), botId: z.string().max(200).optional(), prompt: z.string().max(8000).optional(), allowApprovals: z.boolean().optional() };
export const automationProposalSchema = z.object({
  action: z.enum(["create", "update", "enable", "disable", "delete"]),
  automationId: z.string().min(1).max(80).optional(),
  ...field,
}).strict();
export type AutomationProposalInput = z.infer<typeof automationProposalSchema>;
type Action = AutomationProposalInput["action"];

const displaySchema = z.object({
  action: z.enum(["create", "update", "enable", "disable", "delete"]), name: z.string(), schedule: z.string().nullable(), timezone: z.string(),
  nextRunAt: z.number().nullable(), room: z.string().nullable(), bot: z.string(), prompt: z.string(), allowApprovals: z.boolean(), enabled: z.boolean(),
  changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() }).strict()),
}).strict();
const payloadSchema = z.object({
  action: z.enum(["create", "update", "enable", "disable", "delete"]),
  automationId: z.string().nullable(),
  /** The target's `updatedAt` when proposed; any later edit makes the proposal stale. */
  base: z.number().nullable(),
  change: z.record(z.string(), z.unknown()).nullable(),
  display: displaySchema,
}).strict();
export type AutomationProposalDisplay = z.infer<typeof displaySchema>;

const SHOWN_FIELDS = ["name", "scheduleCron", "tz", "roomId", "botId", "prompt", "allowApprovals", "enabled"] as const;
const shown = (a: Automation, key: (typeof SHOWN_FIELDS)[number]) => String(a[key] ?? "daemon default");

function describe(deps: ManagementDeps, action: Action, before: Automation | undefined, after: Automation): AutomationProposalDisplay {
  const room = after.roomId ? getRoom(deps.db, after.roomId) : undefined;
  let nextRunAt: number | null = null;
  try { nextRunAt = after.scheduleCron && after.enabled ? deps.automations()?.previewSchedule({ scheduleCron: after.scheduleCron, tz: after.tz, outputMode: "room", enabled: true }).nextScheduledAt ?? null : null; }
  catch { nextRunAt = null; }
  const changes = before && action !== "delete" ? SHOWN_FIELDS.filter(key => shown(before, key) !== shown(after, key)).map(key => ({ field: key, from: shown(before, key), to: shown(after, key) })) : [];
  return {
    action, name: after.name, schedule: after.scheduleCron, timezone: after.tz ?? deps.tz, nextRunAt,
    // A direct chat is named after its bot, so "Bot in Bot" would read oddly.
    room: room ? (room.kind === "direct" ? "its direct chat" : room.name) : after.roomId, bot: getBot(deps.db, after.botId)?.name ?? after.botId, prompt: after.prompt,
    allowApprovals: after.allowApprovals, enabled: after.enabled, changes,
  };
}

export const automationProposal: ProposalKind<AutomationProposalInput> = {
  tool: "propose_automation",
  approvalTool: MANAGEMENT_AUTOMATION_TOOL,
  input: automationProposalSchema,
  description: "Propose a scheduled automation change for the owner to accept: create (name, scheduleCron as 5-field cron, roomId, prompt; optional tz, botId, allowApprovals), update (automationId plus the fields to change), enable, disable or delete (automationId only). Only cron automations that post to a conversation. Nothing changes until the owner or a full-access device accepts the card shown in this conversation; it expires after 24 hours. Never say the change is done. Webhook, GitHub, Slack and polling triggers, devices, permissions, connectors, MCP servers and secrets cannot be proposed.",
  prepare(deps, ctx, input) {
    const { action, automationId, ...fields } = input;
    const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    let current: Automation | undefined, change: Record<string, unknown> | null, after: Automation;
    try {
      if (action === "create") {
        if (automationId) throw new ProposalError("automationId is only for changing an existing automation");
        change = { ...given, botId: given.botId ?? ctx.botId, triggerKind: "cron", outputMode: "room", allowTools: false, allowApprovals: given.allowApprovals ?? false };
        after = previewAutomationChange(deps.db, deps.tz, { kind: "create", input: change });
      } else {
        if (!automationId) throw new ProposalError("automationId is required");
        current = getAutomation(deps.db, automationId);
        if (!current) throw new ProposalError("automation not found");
        if (current.triggerKind !== "cron" || current.outputMode !== "room") throw new ProposalError("only scheduled automations that post to a conversation can be changed this way; use the Automations page");
        if (action !== "update" && Object.keys(given).length > 0) throw new ProposalError(`${action} takes only automationId`);
        if (action === "update" && Object.keys(given).length === 0) throw new ProposalError("update needs at least one field to change");
        change = action === "update" ? given : action === "delete" ? null : { enabled: action === "enable" };
        after = action === "delete" ? current : previewAutomationChange(deps.db, deps.tz, { kind: "update", id: automationId, patch: change });
      }
    } catch (err) {
      if (err instanceof AutomationError) throw new ProposalError(err.message);
      throw err;
    }
    return {
      payload: { action, automationId: automationId ?? null, base: current?.updatedAt ?? null, change, display: describe(deps, action, current, after) },
      verb: `${VERBS[action]} automation`, name: after.name,
    };
  },
  apply(deps, stored, by) {
    const parsed = payloadSchema.safeParse(stored);
    if (!parsed.success) throw new ProposalError("the stored proposal is invalid");
    const manager = deps.automations();
    if (!manager) throw new ProposalError("automations are unavailable");
    const p = parsed.data;
    if (p.action !== "create") {
      const current = p.automationId ? getAutomation(deps.db, p.automationId) : undefined;
      if (!current) throw new ProposalError("the automation no longer exists");
      if (current.updatedAt !== p.base) throw new ProposalError("the automation changed after this was proposed; ask for a new proposal");
    }
    try {
      let id = p.automationId;
      if (p.action === "create") id = manager.create(p.change, by).automation.id;
      else if (p.action === "delete") { if (!manager.remove(p.automationId!, by)) throw new ProposalError("the automation no longer exists"); }
      else if (!manager.update(p.automationId!, p.change, by)) throw new ProposalError("the automation no longer exists");
      const done = p.action === "create" ? "created" : p.action === "delete" ? "deleted" : p.action === "update" ? "updated" : `${p.action}d`;
      return { detail: `Automation "${p.display.name}" ${done}.`, audit: { target: "automation", change: p.action, id } };
    } catch (err) {
      if (err instanceof AutomationError) throw new ProposalError(err.message, "failed");
      throw err;
    }
  },
};

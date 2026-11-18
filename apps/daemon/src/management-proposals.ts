import { z } from "zod";
import type { Approval, Approvals } from "./approvals.js";
import { AutomationError, getAutomation, previewAutomationChange, type Automation, type AutomationManager } from "./automations.js";
import type { Db } from "./db/index.js";
import type { Ledger, LedgerEvent } from "./ledger.js";
import { getDefaultRedactor } from "./redact.js";
import { getBot, getRoom } from "./rooms.js";

/**
 * Management proposals (OA-347, docs/notes/default-bot-management-design.md): the default bot proposes a configuration
 * change and only an owner or full-access device applies it. The tool call only stores a turnless approval in the
 * originating conversation; it never writes configuration and never waits. An accepted approval applies the STORED
 * payload through the same service the desk uses, after re-checking that the target has not changed since it was proposed.
 *
 * The approval belongs to the daemon, not the proposing bot, so a proposal waiting for a day never makes that bot busy.
 * Like command review it has no receipt `start`: the receipt is finished on every path so nothing is left pending.
 */

export const MANAGEMENT_AUTOMATION_TOOL = "management_automation";
/** Marks approvals this module created. Bots cannot set it, so a lookalike tool name from elsewhere is never applied. */
export const MANAGEMENT_PROPOSAL_SOURCE = "management-proposal";
/** How each action reads in a sentence ("proposes to pause …"); shared by the tool reply and the morning brief. */
export const PROPOSAL_ACTION_VERBS = { create: "create", update: "change", enable: "turn on", disable: "pause", delete: "delete" } as const;
export const PROPOSAL_EXPIRY_MS = 24 * 60 * 60_000;
const MAX_PENDING_PER_ROOM = 10;

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
  proposedBy: z.string(),
  display: displaySchema,
}).strict();
export type AutomationProposalDisplay = z.infer<typeof displaySchema>;

export interface ProposalResult { status: "proposed"; proposalId: string; expiresAt: number; summary: string; note: string }

export interface ManagementProposals {
  proposeAutomation(ctx: { botId: string; roomId?: string }, input: AutomationProposalInput): ProposalResult;
  dispose(): void;
  idle(): Promise<void>;
}

export class ProposalError extends Error {}

const SHOWN_FIELDS = ["name", "scheduleCron", "tz", "roomId", "botId", "prompt", "allowApprovals", "enabled"] as const;
const shown = (a: Automation, key: (typeof SHOWN_FIELDS)[number]) => String(a[key] ?? "daemon default");

export function createManagementProposals(deps: {
  db: Db; ledger: Ledger; approvals: Approvals; tz: string;
  automations: () => AutomationManager | undefined;
  expiryMs?: number;
}): ManagementProposals {
  const expiryMs = deps.expiryMs ?? PROPOSAL_EXPIRY_MS;
  const timers = new Set<NodeJS.Timeout>(), running = new Set<Promise<void>>();
  let disposed = false;
  const own = (approval: Approval | undefined): approval is Approval =>
    approval !== undefined && approval.toolName === MANAGEMENT_AUTOMATION_TOOL && approval.source === MANAGEMENT_PROPOSAL_SOURCE && approval.turnId === null;
  const audit = (action: string, fields: Record<string, unknown>) => deps.ledger.append("_system", "daemon", "config", { action, ...fields });

  function apply(approval: Approval): void {
    const finish = (outcome: "completed" | "failed" | "not-run", detail: string) => { try { deps.approvals.receipts.finish(approval.id, { outcome, detail }); } catch { /* the audit event still records it */ } };
    const refuse = (reason: string, outcome: "failed" | "not-run" = "not-run") => {
      finish(outcome, `Nothing was changed: ${reason}`);
      audit("management_failed", { approvalId: approval.id, reason });
    };
    const parsed = payloadSchema.safeParse(approval.payload);
    if (!parsed.success) return refuse("the stored proposal is invalid");
    // Redaction rewrites anything that looks like a secret, so a proposal that contains a marker is no longer what was proposed.
    if (JSON.stringify(approval.payload).includes("[REDACTED")) return refuse("the stored proposal was altered by redaction");
    const manager = deps.automations();
    if (!manager) return refuse("automations are unavailable");
    const p = parsed.data, by = `proposal:${approval.id}`;
    if (p.action !== "create") {
      const current = p.automationId ? getAutomation(deps.db, p.automationId) : undefined;
      if (!current) return refuse("the automation no longer exists");
      if (current.updatedAt !== p.base) return refuse("the automation changed after this was proposed; ask for a new proposal");
    }
    try {
      let id = p.automationId;
      if (p.action === "create") id = manager.create(p.change, by).automation.id;
      else if (p.action === "delete") { if (!manager.remove(p.automationId!, by)) return refuse("the automation no longer exists"); }
      else if (!manager.update(p.automationId!, p.change, by)) return refuse("the automation no longer exists");
      finish("completed", `Automation "${p.display.name}" ${p.action === "create" ? "created" : p.action === "delete" ? "deleted" : p.action === "update" ? "updated" : `${p.action}d`}.`);
      audit("management_applied", { approvalId: approval.id, target: "automation", change: p.action, id });
    } catch (err) {
      refuse(err instanceof AutomationError ? err.message : "the change could not be saved", "failed");
    }
  }

  const off = deps.ledger.subscribe("*", (event: LedgerEvent) => {
    if (event.type !== "approval_decided") return;
    const id = (event.payload as { approvalId?: unknown } | null)?.approvalId;
    if (typeof id !== "string") return;
    const approval = deps.approvals.get(id);
    // Only an explicit accept applies anything. Ignore, respond and expiry never do.
    if (!own(approval) || approval.status !== "accepted") return;
    const job = Promise.resolve().then(() => apply(approval)).catch(() => undefined);
    running.add(job); void job.then(() => running.delete(job));
  });

  const expire = (id: string) => deps.approvals.expire(id, "The proposal was not accepted within 24 hours. Ask the bot again if you still want it.");
  const arm = (id: string, ms: number) => {
    if (disposed) return;
    const timer = setTimeout(() => { timers.delete(timer); expire(id); }, ms);
    timer.unref(); timers.add(timer);
  };
  // A proposal made before a restart keeps its row but lost its timer: expire it or re-arm it, so none is stranded.
  for (const approval of deps.approvals.listPending()) {
    if (!own(approval)) continue;
    const left = approval.createdAt + expiryMs - Date.now();
    if (left <= 0) expire(approval.id); else arm(approval.id, left);
  }

  function describe(action: Action, before: Automation | undefined, after: Automation): AutomationProposalDisplay {
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

  return {
    proposeAutomation(ctx, input) {
      if (disposed) throw new ProposalError("the daemon is shutting down");
      if (!ctx.roomId || ctx.roomId.startsWith("_")) throw new ProposalError("proposals need a conversation");
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
      const payload = { action, automationId: automationId ?? null, base: current?.updatedAt ?? null, change, proposedBy: ctx.botId, display: describe(action, current, after) };
      // The approval stores a redacted copy. If redaction would change it, what is applied would differ from what was reviewed.
      if (JSON.stringify(getDefaultRedactor().redact(payload)) !== JSON.stringify(payload)) throw new ProposalError("a value looks like it contains a secret; automations must not carry secrets");
      const pending = deps.approvals.listPending().filter(a => own(a) && a.roomId === ctx.roomId).length;
      if (pending >= MAX_PENDING_PER_ROOM) throw new ProposalError("too many proposals are waiting in this conversation; the owner must decide or let them expire first");
      const { approvalId } = deps.approvals.request({
        roomId: ctx.roomId, botId: "daemon", toolName: MANAGEMENT_AUTOMATION_TOOL, toolClass: "act-local", source: MANAGEMENT_PROPOSAL_SOURCE, payload,
      });
      arm(approvalId, expiryMs);
      return {
        status: "proposed", proposalId: approvalId, expiresAt: Date.now() + expiryMs,
        summary: `Proposal to ${PROPOSAL_ACTION_VERBS[action]} automation "${after.name}".`,
        note: "Nothing has changed yet. The owner or a full-access device must accept the card in this conversation within 24 hours. Do not say the change is done.",
      };
    },
    async idle() { while (running.size) await Promise.all([...running]); },
    dispose() { disposed = true; off(); for (const timer of timers) clearTimeout(timer); timers.clear(); },
  };
}

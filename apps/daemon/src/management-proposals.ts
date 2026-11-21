import type { z } from "zod";
import type { Approval, Approvals } from "./approvals.js";
import type { AutomationManager } from "./automations.js";
import type { Db } from "./db/index.js";
import type { Ledger, LedgerEvent } from "./ledger.js";
import type { Responsibilities } from "./responsibilities.js";
import { getDefaultRedactor } from "./redact.js";

/**
 * Management proposals (OA-347, docs/notes/default-bot-management-design.md): the default bot proposes a configuration
 * change and only an owner or full-access device applies it. The tool call only stores a turnless approval in the
 * originating conversation; it never writes configuration and never waits. An accepted approval applies the STORED
 * payload through the same service the desk uses, after re-checking that the target has not changed since it was proposed.
 *
 * Each kind of change (`ProposalKind`) supplies its input schema, the stored payload with what the card shows, and the
 * apply step. Everything else is shared here: storing, the 24-hour expiry, the per-conversation cap, the redaction
 * refusal, receipts, audit events and the accept listener.
 *
 * The approval belongs to the daemon, not the proposing bot, so a proposal waiting for a day never makes that bot busy.
 * Like command review it has no receipt `start`: the receipt is finished on every path so nothing is left pending.
 */

/** Marks approvals this module created. Bots cannot set it, so a lookalike tool name from elsewhere is never applied. */
export const MANAGEMENT_PROPOSAL_SOURCE = "management-proposal";
export const PROPOSAL_EXPIRY_MS = 24 * 60 * 60_000;
const MAX_PENDING_PER_ROOM = 10;

/** What a kind needs from the daemon to check and apply a change. */
export interface ManagementDeps { db: Db; ledger: Ledger; tz: string; automations: () => AutomationManager | undefined; responsibilities?: () => Responsibilities | undefined }
export interface ProposalContext { botId: string; roomId: string }

/** A prepared proposal: the payload to store (including what the card shows) and how it reads in a sentence. */
export interface PreparedProposal {
  payload: Record<string, unknown>;
  /** "pause automation", "turn on the morning brief": completes "proposes to …". */
  verb: string;
  /** The target's name, shown quoted after the verb; null when the verb says it all. */
  name: string | null;
}

export interface ProposalKind<I = unknown> {
  /** The bot-facing tool, `propose_<kind>`. */
  tool: string;
  /** The approval's tool name, `management_<kind>`; existing stored approvals are matched on it, so it never changes. */
  approvalTool: string;
  description: string;
  input: z.ZodType<I>;
  /** Validates against current state and builds the payload. Throws ProposalError to refuse. Never writes. */
  prepare(deps: ManagementDeps, ctx: ProposalContext, input: I): PreparedProposal;
  /**
   * Applies a stored payload (everything but `proposedBy` and `sentence`), after its own stale check. Throws ProposalError
   * to refuse; any other error is a failed save. Returns the receipt detail and the audit fields.
   */
  apply(deps: ManagementDeps, payload: Record<string, unknown>, by: string): { detail: string; audit: Record<string, unknown> };
}

export interface ProposalResult { status: "proposed"; proposalId: string; expiresAt: number; summary: string; note: string }

export interface ManagementProposals {
  propose(tool: string, ctx: { botId: string; roomId?: string }, input: unknown): ProposalResult;
  dispose(): void;
  idle(): Promise<void>;
}

/** A refusal. `not-run` (the default) means nothing was attempted; `failed` means the save itself was refused. */
export class ProposalError extends Error {
  constructor(message: string, readonly outcome: "not-run" | "failed" = "not-run") { super(message); }
}

/** "bot proposes to pause automation `Inbox check`" for the morning brief, or null when the payload is not a proposal sentence. */
export function proposalBriefLine(payload: unknown, code: (text: string) => string): string | null {
  const p = payload as { proposedBy?: unknown; sentence?: { verb?: unknown; name?: unknown } } | null;
  const verb = p?.sentence?.verb, name = p?.sentence?.name;
  if (typeof p?.proposedBy !== "string" || typeof verb !== "string" || (name !== null && typeof name !== "string")) return null;
  return `${p.proposedBy} proposes to ${verb}${name === null ? "" : ` ${code(name)}`}`;
}

export function createManagementProposals(deps: ManagementDeps & { approvals: Approvals; kinds: readonly ProposalKind<any>[]; expiryMs?: number }): ManagementProposals {
  const expiryMs = deps.expiryMs ?? PROPOSAL_EXPIRY_MS;
  const byTool = new Map(deps.kinds.map(k => [k.tool, k]));
  const byApproval = new Map(deps.kinds.map(k => [k.approvalTool, k]));
  const timers = new Set<NodeJS.Timeout>(), running = new Set<Promise<void>>();
  let disposed = false;
  const kindOf = (approval: Approval | undefined) =>
    approval !== undefined && approval.source === MANAGEMENT_PROPOSAL_SOURCE && approval.turnId === null ? byApproval.get(approval.toolName) : undefined;
  const audit = (action: string, fields: Record<string, unknown>) => deps.ledger.append("_system", "daemon", "config", { action, ...fields });

  function apply(kind: ProposalKind<any>, approval: Approval): void {
    const finish = (outcome: "completed" | "failed" | "not-run", detail: string) => { try { deps.approvals.receipts.finish(approval.id, { outcome, detail }); } catch { /* the audit event still records it */ } };
    const refuse = (reason: string, outcome: "failed" | "not-run" = "not-run") => {
      finish(outcome, `Nothing was changed: ${reason}`);
      audit("management_failed", { approvalId: approval.id, reason });
    };
    // Redaction rewrites anything that looks like a secret, so a proposal that contains a marker is no longer what was proposed.
    if (JSON.stringify(approval.payload).includes("[REDACTED")) return refuse("the stored proposal was altered by redaction");
    if (typeof approval.payload !== "object" || approval.payload === null) return refuse("the stored proposal is invalid");
    const { proposedBy: _by, sentence: _sentence, ...payload } = approval.payload as Record<string, unknown>;
    try {
      const done = kind.apply(deps, payload, `proposal:${approval.id}`);
      finish("completed", done.detail);
      audit("management_applied", { approvalId: approval.id, ...done.audit });
    } catch (err) {
      if (err instanceof ProposalError) refuse(err.message, err.outcome);
      else refuse("the change could not be saved", "failed");
    }
  }

  const off = deps.ledger.subscribe("*", (event: LedgerEvent) => {
    if (event.type !== "approval_decided") return;
    const id = (event.payload as { approvalId?: unknown } | null)?.approvalId;
    if (typeof id !== "string") return;
    const approval = deps.approvals.get(id);
    const kind = kindOf(approval);
    // Only an explicit accept applies anything. Ignore, respond and expiry never do.
    if (!kind || approval!.status !== "accepted") return;
    const job = Promise.resolve().then(() => apply(kind, approval!)).catch(() => undefined);
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
    if (!kindOf(approval)) continue;
    const left = approval.createdAt + expiryMs - Date.now();
    if (left <= 0) expire(approval.id); else arm(approval.id, left);
  }

  return {
    propose(tool, ctx, input) {
      if (disposed) throw new ProposalError("the daemon is shutting down");
      const kind = byTool.get(tool);
      if (!kind) throw new ProposalError("unknown proposal");
      if (!ctx.roomId || ctx.roomId.startsWith("_")) throw new ProposalError("proposals need a conversation");
      const parsed = kind.input.safeParse(input);
      if (!parsed.success) throw new ProposalError(parsed.error.issues.map(i => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
      const prepared = kind.prepare(deps, { botId: ctx.botId, roomId: ctx.roomId }, parsed.data);
      const payload = { ...prepared.payload, proposedBy: ctx.botId, sentence: { verb: prepared.verb, name: prepared.name } };
      // The approval stores a redacted copy. If redaction would change it, what is applied would differ from what was reviewed.
      if (JSON.stringify(getDefaultRedactor().redact(payload)) !== JSON.stringify(payload)) throw new ProposalError("a value looks like it contains a secret; proposals must not carry secrets");
      const pending = deps.approvals.listPending().filter(a => kindOf(a) && a.roomId === ctx.roomId).length;
      if (pending >= MAX_PENDING_PER_ROOM) throw new ProposalError("too many proposals are waiting in this conversation; the owner must decide or let them expire first");
      const { approvalId } = deps.approvals.request({
        roomId: ctx.roomId, botId: "daemon", toolName: kind.approvalTool, toolClass: "act-local", source: MANAGEMENT_PROPOSAL_SOURCE, payload,
      });
      arm(approvalId, expiryMs);
      return {
        status: "proposed", proposalId: approvalId, expiresAt: Date.now() + expiryMs,
        summary: `Proposal to ${prepared.verb}${prepared.name === null ? "" : ` "${prepared.name}"`}.`,
        note: "Nothing has changed yet. The owner or a full-access device must accept the card in this conversation within 24 hours. Do not say the change is done.",
      };
    },
    async idle() { while (running.size) await Promise.all([...running]); },
    dispose() { disposed = true; off(); for (const timer of timers) clearTimeout(timer); timers.clear(); },
  };
}

import type { Approval, Approvals } from "./approvals.js";
import { commitMemory } from "./datagit.js";
import type { Ledger, LedgerEvent } from "./ledger.js";
import { appendMemoryNote } from "./memory.js";
import {
  MemoryPayloadSchema,
  REFLECTION_MEMORY_TOOL,
  REFLECTION_SKILL_TOOL,
  REFLECTION_SKILL_ARCHIVE_TOOL,
  REFLECTION_SKILL_REVISE_TOOL,
  SkillArchivePayloadSchema,
  SkillPayloadSchema,
  SkillRevisePayloadSchema,
  type SkillPayload,
} from "./reflection-schema.js";
import type { SkillCatalogue } from "./skills.js";

/**
 * Applies approved skill proposals and legacy memory approvals still pending from older releases.
 * New reflection memory notes are saved by reflection.ts, without creating approvals.
 */

export interface ReflectionApplierDeps {
  ledger: Ledger;
  approvals: Pick<Approvals, "get" | "receipts">;
  dataDir: string;
  /** Writes a skill (OA-204). Absent: skill proposals are refused with an error event, never half-applied. */
  saveSkill?: (botId: string, skill: SkillPayload) => Promise<void> | void;
  /** Skill curator revisions and archives. Absent: those proposals are refused, never half-applied. */
  skills?: Pick<SkillCatalogue, "revise" | "archive">;
  /** Called after a curator change so cached agent sessions pick up the new skill index. */
  skillsChanged?: () => Promise<void> | void;
}

const APPLIED: ReadonlySet<string> = new Set([REFLECTION_MEMORY_TOOL, REFLECTION_SKILL_TOOL, REFLECTION_SKILL_REVISE_TOOL, REFLECTION_SKILL_ARCHIVE_TOOL]);

export function createReflectionApplier(deps: ReflectionApplierDeps): { dispose(): void; idle(): Promise<void> } {
  let chain: Promise<unknown> = Promise.resolve();

  const fail = (approval: Approval, message: string) => {
    try {
      deps.approvals.receipts.finish(approval.id,{outcome:deps.approvals.receipts.get(approval.id)?.startedAt?"unknown":"not-run",detail:message});
      deps.ledger.append(approval.roomId, "daemon", "error", { approvalId: approval.id, message });
    } catch {
      // nothing else to do
    }
  };

  async function apply(approval: Approval): Promise<void> {
    // The edited payload replaces the stored one, but must pass the same strict schema as a proposal.
    const raw = approval.status === "edited" ? approval.edit : approval.payload;
    if (approval.toolName === REFLECTION_MEMORY_TOOL) {
      const parsed = MemoryPayloadSchema.safeParse(raw);
      if (!parsed.success) return fail(approval, "reflection memory proposal is invalid; nothing written");
      deps.approvals.receipts.start(approval.id,null,null);
      appendMemoryNote(deps.dataDir, approval.botId, parsed.data.text);
      await commitMemory(deps.dataDir, `memory: reflection apply (${approval.botId})`);
      deps.approvals.receipts.finish(approval.id,{outcome:"completed",detail:"The daemon wrote and committed the reviewed memory change."});
      return;
    }
    if (approval.toolName === REFLECTION_SKILL_TOOL) {
      const parsed = SkillPayloadSchema.safeParse(raw);
      if (!parsed.success) return fail(approval, "reflection skill proposal is invalid; nothing written");
      if (!deps.saveSkill) return fail(approval, "skills are not available; nothing written");
      deps.approvals.receipts.start(approval.id,null,null);
      await deps.saveSkill(approval.botId, parsed.data);
      deps.approvals.receipts.finish(approval.id,{outcome:"completed",detail:"The daemon saved the reviewed skill change."});
      return;
    }
    if (approval.toolName === REFLECTION_SKILL_REVISE_TOOL) {
      const parsed = SkillRevisePayloadSchema.safeParse(raw);
      if (!parsed.success) return fail(approval, "reflection skill revision is invalid; nothing written");
      if (!deps.skills) return fail(approval, "skills are not available; nothing written");
      // The stale check runs inside revise: a skill that changed after the proposal is refused.
      deps.skills.revise(approval.botId, parsed.data);
      deps.approvals.receipts.start(approval.id,null,null);
      await commitMemory(deps.dataDir, `skills: reflection revise ${parsed.data.slug} (${approval.botId})`);
      await deps.skillsChanged?.();
      deps.approvals.receipts.finish(approval.id,{outcome:"completed",detail:"The daemon saved the reviewed skill revision as a new version."});
      return;
    }
    if (approval.toolName === REFLECTION_SKILL_ARCHIVE_TOOL) {
      const parsed = SkillArchivePayloadSchema.safeParse(raw);
      if (!parsed.success) return fail(approval, "reflection skill archive proposal is invalid; nothing written");
      if (!deps.skills) return fail(approval, "skills are not available; nothing written");
      deps.skills.archive(approval.botId, parsed.data.slug, parsed.data.baseVersion, parsed.data.reason);
      deps.approvals.receipts.start(approval.id,null,null);
      await deps.skillsChanged?.();
      deps.approvals.receipts.finish(approval.id,{outcome:"completed",detail:"The daemon archived the reviewed skill."});
    }
  }

  const off = deps.ledger.subscribe("*", (e: LedgerEvent) => {
    if (e.type !== "approval_decided") return;
    const id = (e.payload as { approvalId?: unknown } | null)?.approvalId;
    if (typeof id !== "string") return;
    const approval = deps.approvals.get(id);
    if (!approval || !APPLIED.has(approval.toolName)) return;
    // Only an explicit accept/edit applies; ignore, respond and expiry (status ignored) never do.
    if (approval.status !== "accepted" && approval.status !== "edited") return;
    chain = chain.then(() => apply(approval)).catch((err: unknown) => fail(approval, err instanceof Error ? err.message : "apply failed"));
  });

  return { dispose: off, idle: () => chain.then(() => undefined) };
}

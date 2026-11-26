import { z } from "zod";

/** Validated reflection output; memory saves automatically, skill drafts and legacy approvals use the applier. */

export const REFLECTION_MEMORY_TOOL = "reflection_memory";
export const REFLECTION_SKILL_TOOL = "reflection_skill";
/** Skill curator: revise or archive an existing agent-owned skill. Both carry the version they were based on. */
export const REFLECTION_SKILL_REVISE_TOOL = "reflection_skill_revise";
export const REFLECTION_SKILL_ARCHIVE_TOOL = "reflection_skill_archive";
export const REFLECTION_TOOLS: ReadonlySet<string> = new Set([REFLECTION_MEMORY_TOOL, REFLECTION_SKILL_TOOL, REFLECTION_SKILL_REVISE_TOOL, REFLECTION_SKILL_ARCHIVE_TOOL]);

export const SKILL_SLUG_RE = /^[a-z0-9-]{1,64}$/;
export const MEMORY_TEXT_MAX = 300;
export const SKILL_BODY_MAX = 16_000;

export const MemoryPayloadSchema = z.object({ text: z.string().trim().min(1).max(MEMORY_TEXT_MAX) }).strict();
export const SkillPayloadSchema = z
  .object({
    slug: z.string().regex(SKILL_SLUG_RE),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(200),
    body: z.string().min(1).max(SKILL_BODY_MAX),
  })
  .strict();

const CuratorReason = z.string().trim().min(1).max(200);
const BaseVersion = z.number().int().min(1);
export const SkillRevisePayloadSchema = SkillPayloadSchema.extend({ reason: CuratorReason, baseVersion: BaseVersion }).strict();
export const SkillArchivePayloadSchema = z
  .object({ slug: SkillPayloadSchema.shape.slug, name: SkillPayloadSchema.shape.name, reason: CuratorReason, baseVersion: BaseVersion })
  .strict();

export type MemoryPayload = z.infer<typeof MemoryPayloadSchema>;
export type SkillPayload = z.infer<typeof SkillPayloadSchema>;
export type SkillRevisePayload = z.infer<typeof SkillRevisePayloadSchema>;
export type SkillArchivePayload = z.infer<typeof SkillArchivePayloadSchema>;

/** What the reflecting bot must answer with. */
export const ProposalsSchema = z.object({
  proposals: z.array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("memory_append"), text: MemoryPayloadSchema.shape.text }),
      z.object({ kind: z.literal("owner_note"), text: MemoryPayloadSchema.shape.text }),
      z.object({ kind: z.literal("skill"), ...SkillPayloadSchema.shape }),
      z.object({ kind: z.literal("skill_revise"), slug: SkillPayloadSchema.shape.slug, body: SkillPayloadSchema.shape.body, reason: CuratorReason }),
      z.object({ kind: z.literal("skill_archive"), slug: SkillPayloadSchema.shape.slug, reason: CuratorReason }),
    ]),
  ),
});
export type Proposals = z.infer<typeof ProposalsSchema>;

import { z } from "zod";
import { ProposalError, type ProposalKind } from "./management-proposals.js";
import { ResponsibilityError, responsibilityCreate } from "./responsibilities.js";
import { getBot, getRoom } from "./rooms.js";

/**
 * Responsibility proposals: create a standing responsibility, always paused, exactly as the desk does. The source
 * binding and resource come from the daemon's configured source, never from the bot; with no source connected the
 * proposal is refused, as the desk's create button is disabled. Enabling stays a separate owner action.
 */

export const MANAGEMENT_RESPONSIBILITY_TOOL = "management_responsibility";

export const responsibilityProposalSchema = z.object({
  name: z.string().min(1).max(80),
  /** Defaults to the proposing bot. Investigations run only on API or Ollama bots. */
  botId: z.string().min(1).max(120).optional(),
  roomId: z.string().min(1).max(120),
  sender: z.string().min(3).max(200),
  topic: z.string().min(3).max(120),
  question: z.string().min(1).max(1000),
  /** One of the source's permitted resources; defaults to the first. */
  resourceId: z.string().min(1).max(120).optional(),
}).strict();
export type ResponsibilityProposalInput = z.infer<typeof responsibilityProposalSchema>;

const payloadSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  display: z.object({ changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() }).strict()), notes: z.array(z.string()) }).strict(),
}).strict();

export const responsibilityProposal: ProposalKind<ResponsibilityProposalInput> = {
  tool: "propose_responsibility",
  approvalTool: MANAGEMENT_RESPONSIBILITY_TOOL,
  input: responsibilityProposalSchema,
  description: "Propose a standing responsibility, created paused: name, roomId (a conversation the bot is in), sender (exact email address), topic (words the subject contains), question (what to find out when such an email arrives); optional botId (an API or Ollama bot; default is you) and resourceId. Refused when no mail source is connected. Nothing changes until the owner or a full-access device accepts the card shown in this conversation; it expires after 24 hours. Enabling it afterwards is a separate owner action. Never say it is done.",
  prepare(deps, ctx, input) {
    const service = deps.responsibilities?.();
    const source = service?.readiness();
    if (!service || !source || source.state !== "configured" || !source.bindingId || !source.resourceIds.length) throw new ProposalError("standing responsibilities need a connected mail source, and none is configured");
    const resourceId = input.resourceId ?? source.resourceIds[0]!;
    if (!source.resourceIds.includes(resourceId)) throw new ProposalError("that resource is not permitted by the connected source");
    const botId = input.botId ?? ctx.botId;
    const bot = getBot(deps.db, botId);
    if (!bot) throw new ProposalError("bot not found");
    if (bot.runtime !== "api") throw new ProposalError("investigations run only on API or Ollama bots; choose another botId");
    const room = getRoom(deps.db, input.roomId);
    if (!room || room.id.startsWith("_") || !room.members.includes(botId)) throw new ProposalError("choose a conversation that contains the bot");
    const parsed = responsibilityCreate.safeParse({ name: input.name, botId, roomId: input.roomId, bindingId: source.bindingId, resourceIds: [resourceId], sender: input.sender, topic: input.topic, question: input.question });
    if (!parsed.success) throw new ProposalError(parsed.error.issues.map(i => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
    const c = parsed.data;
    return {
      payload: {
        config: c,
        display: {
          changes: [
            { field: "Name", from: "", to: c.name }, { field: "When", from: "", to: `Email from ${c.sender} with “${c.topic}” in the subject` },
            { field: "Question", from: "", to: c.question }, { field: "Bot", from: "", to: bot.name },
            { field: "Results go to", from: "", to: room.kind === "direct" ? "its direct chat" : room.name }, { field: "Source", from: "", to: `${c.bindingId} / ${resourceId}` },
          ],
          notes: ["It is created paused. Turn it on in Automations → Standing responsibilities after checking it."],
        },
      },
      verb: "add standing responsibility", name: c.name,
    };
  },
  apply(deps, stored, by) {
    const parsed = payloadSchema.safeParse(stored);
    if (!parsed.success) throw new ProposalError("the stored proposal is invalid");
    const service = deps.responsibilities?.();
    if (!service) throw new ProposalError("responsibilities are unavailable");
    if (service.readiness().bindingId !== parsed.data.config.bindingId) throw new ProposalError("the connected source changed after this was proposed; ask for a new proposal");
    try {
      const item = service.create(parsed.data.config);
      deps.ledger.append("_system", "user", "config", { action: "responsibility_created", responsibilityId: item.id, revision: item.revision, by });
      return { detail: `Standing responsibility "${item.name}" created, paused.`, audit: { target: "responsibility", change: "create", id: item.id } };
    } catch (err) {
      if (err instanceof ResponsibilityError || err instanceof z.ZodError) throw new ProposalError(err.message, "failed");
      throw err;
    }
  },
};

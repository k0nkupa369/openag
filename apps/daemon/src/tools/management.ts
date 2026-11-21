import { automationProposal } from "../management-automation.js";
import { deliveryRoomProposal, proactiveProposal } from "../management-settings.js";
import { directChatProposal, roomProposal } from "../management-rooms.js";
import { responsibilityProposal } from "../management-responsibilities.js";
import { ProposalError, type ManagementProposals, type ProposalKind } from "../management-proposals.js";
import type { ToolDef } from "./registry.js";

/** Every kind of management proposal (OA-347). Their `tool` names are `PROPOSAL_TOOLS` in policy.ts. */
export const PROPOSAL_KINDS: readonly ProposalKind<any>[] = [automationProposal, proactiveProposal, deliveryRoomProposal, roomProposal, directChatProposal, responsibilityProposal];

/**
 * One `propose_*` tool per kind. Like request_input they only store something for the owner and grant nothing, so they
 * run in every interactive mode without their own review. The runner offers them only to the default bot in an
 * interactive conversation; the owner applies a proposal by accepting the card.
 */
export function createProposalTools(proposals: () => ManagementProposals | undefined): ToolDef<any>[] {
  return PROPOSAL_KINDS.map(kind => ({
    name: kind.tool, class: "read", offlineSafe: true,
    permission: () => ({ approval: "allow" }), effectScope: () => ({ kind: "read" }),
    enabled: () => proposals() !== undefined,
    description: kind.description,
    input: kind.input,
    async execute(ctx, args) {
      const service = proposals();
      if (!service) throw Error("Proposals are unavailable.");
      try { return service.propose(kind.tool, { botId: ctx.botId, roomId: ctx.roomId }, args); }
      catch (err) { if (err instanceof ProposalError) throw Error(err.message); throw err; }
    },
  } satisfies ToolDef<any>));
}

import { automationProposalSchema, ProposalError, type AutomationProposalInput, type ManagementProposals } from "../management-proposals.js";
import type { ToolDef } from "./registry.js";

/**
 * Proposes an automation change (OA-347). Like request_input it only stores something for the owner and grants nothing,
 * so it runs in every interactive mode without its own review. The runner offers it only to the default bot in an
 * interactive conversation; the owner applies it by accepting the card.
 */
export function createProposeAutomationTool(proposals: () => ManagementProposals | undefined): ToolDef<AutomationProposalInput> {
  return {
    name: "propose_automation", class: "read", offlineSafe: true,
    permission: () => ({ approval: "allow" }), effectScope: () => ({ kind: "read" }),
    enabled: () => proposals() !== undefined,
    description: "Propose a scheduled automation change for the owner to accept: create (name, scheduleCron as 5-field cron, roomId, prompt; optional tz, botId, allowApprovals), update (automationId plus the fields to change), enable, disable or delete (automationId only). Only cron automations that post to a conversation. Nothing changes until the owner or a full-access device accepts the card shown in this conversation; it expires after 24 hours. Never say the change is done. Webhook, GitHub, Slack and polling triggers, devices, permissions, connectors, MCP servers and secrets cannot be proposed.",
    input: automationProposalSchema,
    async execute(ctx, args) {
      const service = proposals();
      if (!service) throw Error("Proposals are unavailable.");
      try { return service.proposeAutomation({ botId: ctx.botId, roomId: ctx.roomId }, args); }
      catch (err) { if (err instanceof ProposalError) throw Error(err.message); throw err; }
    },
  };
}

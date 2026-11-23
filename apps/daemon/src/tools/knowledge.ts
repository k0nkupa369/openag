import { z } from "zod";
import { knowledge } from "../knowledge.js";
import type { ToolDef } from "./registry.js";

export const openagHelpTool: ToolDef<{ topic: string }> = {
  name: "openag_help", permission:()=>({approval:'allow'}), offlineSafe:true,
  effectScope:()=>({kind:'read'}),class: "read",
  description: `Read installed OpenAg product help. Topics: ${knowledge.slugs().join(", ") || "none installed"}. This describes features, not live installation state.`,
  input: z.object({ topic: z.string().regex(/^[a-z0-9-]{1,40}$/) }).strict(),
  async execute(_ctx, { topic }) { return knowledge.load(topic); },
};

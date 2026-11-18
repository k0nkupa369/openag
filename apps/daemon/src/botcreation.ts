import { createHash } from "node:crypto";
import { z } from "zod";
import { canonical } from "./action-receipts.js";
import { parseBotSettings } from "./botsettings.js";
import { type BotModels, ModelError } from "./botmodels.js";
import type { Db } from "./db/index.js";
import type { Ledger } from "./ledger.js";
import { getDefaultRedactor } from "./redact.js";
import { handleAvailable, RESERVED_HANDLES } from "./handles.js";
import { createBot, getBot } from "./rooms.js";

export const creationRequestId = z.string().uuid();
const inputSchema = z.object({
  requestId: creationRequestId, name: z.string(), description: z.string().optional(), instructions: z.string().optional(),
  target: z.string().min(1).max(100), model: z.string().min(1).max(200), snapshotId: z.union([z.string().uuid(), z.string().regex(/^[a-f0-9]{64}$/)]),
  reasoning: z.record(z.string(), z.union([z.string().max(80), z.boolean(), z.number().int()])),
}).strict();

export function readBotCreation(db: Db, requestId: string) {
  if (!creationRequestId.safeParse(requestId).success) throw new ModelError("Invalid creation request id");
  const row = db.prepare("SELECT bot_id FROM bot_creations WHERE request_id = ?").get(requestId) as { bot_id: string } | undefined;
  return row ? getBot(db, row.bot_id) : undefined;
}

export function createDeskBot(db: Db, ledger: Ledger, models: BotModels, input: unknown, env = process.env, actor:string="owner") {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new ModelError("Expected name, model choices and a creation request id; unknown fields are refused");
  const b = parsed.data;
  const normalized = parseBotSettings({ name: b.name, description: b.description ?? "", instructions: b.instructions ?? "" });
  const text = getDefaultRedactor().redact(normalized);
  const payload = { ...normalized, target: b.target, model: b.model, reasoning: b.reasoning };
  if (canonical(getDefaultRedactor().redact({ model: b.model, reasoning: b.reasoning })) !== canonical({ model: b.model, reasoning: b.reasoning })) throw new ModelError("Model configuration contains a secret");
  const hash = createHash("sha256").update(canonical(payload)).digest("hex");
  return ledger.atomic(() => {
    const receipt = db.prepare("SELECT bot_id, payload_hash FROM bot_creations WHERE request_id = ?").get(b.requestId) as { bot_id: string; payload_hash: string } | undefined;
    if (receipt) {
      if (receipt.payload_hash !== hash) throw new ModelError("This creation request already has different content. Inspect its bot before starting another creation.", 409);
      return { bot: getBot(db, receipt.bot_id)!, created: false };
    }
    const model = models.creationConfig(b);
    let base = text.name!.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-$/, "") || "bot";
    if (RESERVED_HANDLES.has(base)) base = "bot";
    let id = base;
    // The id doubles as the first handle: free only if no agent holds or retired it, and no agent has it as id.
    for (let suffix = 2; !handleAvailable(db, id); suffix++) id = `${base}-${suffix}`;
    if (env[`OPENAG_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_MODEL`]) throw new ModelError("An administrator model override reserves this handle. Use a different name or ask the server administrator.", 409);
    const bot = createBot(db, { id, name: text.name, ...model, config: { ...model.config, description: text.description, instructions: text.instructions } });
    db.prepare("INSERT INTO bot_creations (request_id, bot_id, payload_hash) VALUES (?, ?, ?)").run(b.requestId, id, hash);
    ledger.append("_system", actor, "config", { action: "bot_created", botId: id, runtime: bot.runtime });
    return { bot, created: true };
  });
}

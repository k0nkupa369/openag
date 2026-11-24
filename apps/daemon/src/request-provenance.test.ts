import { expect, test } from "vitest";
import { RequestTrace } from "./request-provenance.js";
import type { TurnContext } from "./runtimes/types.js";

function settled(result: unknown) {
  const events: Array<{ type: string; payload: unknown }> = [];
  const ctx = { room: { id: "r" }, bot: { id: "b" }, turnId: "t", ledger: { append: (_room: string, _actor: string, type: string, payload: unknown) => { events.push({ type, payload }); } } } as unknown as TurnContext;
  new RequestTrace(ctx, "m").settle(1, "returned", result);
  return (events.at(-1)!.payload as { usage: unknown }).usage;
}

test("records cached input tokens from the flat usage the OpenAI models report", () => {
  expect(settled({ usage: { inputTokens: 14731, outputTokens: 13, totalTokens: 14744, cachedInputTokens: 14080, reasoningTokens: 0 } }))
    .toEqual({ source: "provider-reported", unit: "tokens", inputTokens: 14731, outputTokens: 13, totalTokens: 14744, cachedInputTokens: 14080 });
});

test("records cache reads and writes from the nested usage of newer model interfaces", () => {
  expect(settled({ usage: { inputTokens: { total: 5000, noCache: 1000, cacheRead: 3000, cacheWrite: 1000 }, outputTokens: { total: 20, text: 20, reasoning: 0 } } }))
    .toEqual({ source: "provider-reported", unit: "tokens", inputTokens: 5000, outputTokens: 20, cachedInputTokens: 3000, cacheWriteInputTokens: 1000 });
});

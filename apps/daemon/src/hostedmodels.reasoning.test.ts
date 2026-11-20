import { describe, expect, test } from "vitest";
import { getModelReasoningOptions } from "@mastra/core/llm";
import { reasoningCapabilities } from "./hostedmodels.js";

describe("reasoningCapabilities", () => {
  test("keeps the installed catalogue's answer for models it lists", () => {
    expect(reasoningCapabilities("openai", "openai/gpt-6-luna")).toEqual(getModelReasoningOptions("openai/gpt-6-luna"));
  });

  test("gives unlisted GPT-6+ OpenAI models the provider's effort values", () => {
    const efforts = [{ type: "effort", values: ["low", "medium", "high", "xhigh", "max"] }];
    expect(getModelReasoningOptions("openai/gpt-6.1-terra")).toBeUndefined();
    expect(reasoningCapabilities("openai", "openai/gpt-6.1-terra")).toEqual(efforts);
    expect(reasoningCapabilities("openai", "gpt-6.2-astra")).toEqual(efforts);
  });

  test("does not guess for chat variants, older families, other providers or unknown names", () => {
    expect(reasoningCapabilities("openai", "openai/gpt-6-chat-latest")).toBeUndefined();
    expect(reasoningCapabilities("openai", "openai/gpt-4.1-nano")).toEqual(getModelReasoningOptions("openai/gpt-4.1-nano"));
    expect(reasoningCapabilities("openrouter", "openai/gpt-6.1-terra")).toBeUndefined();
    expect(reasoningCapabilities("openai", "openai/whisper-2")).toBeUndefined();
  });
});

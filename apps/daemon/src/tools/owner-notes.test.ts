import { describe, expect, test } from "vitest";
import { MCP_TOOL_NAMES } from "../mcpserver.js";
import { classify } from "../policy.js";
import { createFirstPartyTools } from "./firstparty.js";
import type { Computer } from "../computer.js";
import type { Pusher } from "../push.js";

// Owner notes reach every agent's prompt, so no agent tool writes them (cross-agent prompt injection).
// The writers are the owner/Full desk route and validated nightly reflection.
describe("owner notes have no agent writer", () => {
  test("no first-party, MCP or classified tool appends owner notes", () => {
    const { defs, executors } = createFirstPartyTools({
      computer: {} as Computer,
      pusher: { status: () => ({ configured: false, enabled: false }) } as unknown as Pusher,
    });
    expect(defs.map((d) => d.name).filter((name) => /owner_note/.test(name))).toEqual([]);
    expect(Object.keys(executors).filter((name) => /owner_note/.test(name))).toEqual([]);
    expect(MCP_TOOL_NAMES.filter((name) => /owner_note/.test(name))).toEqual([]);
    expect(classify("owner_note_append")).toBe("act-external");
  });
});

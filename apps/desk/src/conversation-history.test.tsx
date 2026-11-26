import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "./api";
import { useLedger } from "./conversation-history";
import type { LedgerEvent, TranscriptPage } from "./types";

vi.mock("./stream", () => {
  const stream = { subscribe: () => () => {} };
  return { useStream: () => stream };
});

const message = (id: number): LedgerEvent => ({ id, roomId: "ops", ts: id, actor: "user", type: "message", payload: { text: `m${id}` } });
const state = { throughId: 300, runningTurns: [], work: [] };

function fakeApi() {
  const transcript = vi.fn(async (_room: string, query: { before?: number; after?: number } = {}): Promise<TranscriptPage> => {
    if (query.before === 101) return { events: [message(99), message(100)], before: 99, after: 300, hasMore: false, state };
    if (query.after === 100) return { events: [message(101), message(102)], before: null, after: 300, hasMore: false, state };
    return { events: [message(299), message(300)], before: 299, after: 300, hasMore: false, state };
  });
  return { api: { transcript } as unknown as Api, transcript };
}

describe("opening a conversation at a message", () => {
  it("loads the page ending at the message, then everything after it, and lands on it", async () => {
    const { api, transcript } = fakeApi();
    const { result } = renderHook(() => useLedger(api, "ops", 100));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(transcript.mock.calls.map(call => call[1])).toEqual([{ before: 101 }, { after: 100 }]);
    expect(result.current.events.map(event => event.id)).toEqual([99, 100, 101, 102]);
    expect(result.current.before).toBe(99);
    expect(result.current.initialPosition).toMatchObject({ messageId: "event-100" });
  });

  it("without a message opens at the recent end", async () => {
    const { api, transcript } = fakeApi();
    const { result } = renderHook(() => useLedger(api, "ops"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(transcript.mock.calls.map(call => call[1])).toEqual([{}]);
    expect(result.current.events.map(event => event.id)).toEqual([299, 300]);
  });
});

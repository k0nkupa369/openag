import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentRequestsPanel, SETTLED_REQUEST_LIMIT, SETTLED_RESULT_CHARS } from "./AgentRequestsPanel";
import type { Api } from "../api";
import type { AgentRequest } from "../types";

const req = (n: number, over: Partial<AgentRequest> = {}): AgentRequest => ({
  id: `r${n}`, revision: 1, createdAt: n, originMessageId: n, initiatorBotId: "boss", recipientId: "coder", kind: "mention",
  status: "cancelled", result: null, delivery: "delivered", deadlineAt: null, receiptIds: [], pendingInteractionIds: [], ...over,
});
const bots = [{ id: "coder", handle: "coder", name: "Coder", runtime: "acp", model: null }];
const api = (requests: AgentRequest[]) => ({ agentRequests: async () => ({ requests }) }) as unknown as Api;

describe("AgentRequestsPanel", () => {
  it("caps settled history behind Show earlier and never hides outstanding requests", async () => {
    const settled = Array.from({ length: SETTLED_REQUEST_LIMIT + 3 }, (_, i) => req(i + 1));
    const outstanding = [req(0, { id: "needs", status: "running", pendingInteractionIds: ["q1"] }), req(1, { id: "ready", status: "completed", delivery: "pending", result: "x" })];
    render(<AgentRequestsPanel api={api([...outstanding, ...settled])} roomId="main" events={[]} bots={bots} />);
    const more = await screen.findByRole("button", { name: "Show 3 earlier requests" });
    expect(screen.getAllByText("Cancelled")).toHaveLength(SETTLED_REQUEST_LIMIT);
    expect(screen.getByText("Needs input")).toBeTruthy();
    expect(screen.getByText("Findings ready")).toBeTruthy();
    fireEvent.click(more);
    expect(screen.getAllByText("Cancelled")).toHaveLength(SETTLED_REQUEST_LIMIT + 3);
    expect(screen.queryByRole("button", { name: /earlier/ })).toBeNull();
  });

  it("shortens a long settled answer until Show full answer, but not one awaiting delivery", async () => {
    const long = "a".repeat(SETTLED_RESULT_CHARS + 50);
    const pending = "b".repeat(SETTLED_RESULT_CHARS + 50);
    const { container } = render(<AgentRequestsPanel api={api([req(1, { status: "completed", delivery: "failed", result: long }), req(2, { status: "completed", delivery: "pending", result: pending })])} roomId="main" events={[]} bots={bots} />);
    await screen.findByText("Answer not delivered");
    fireEvent.click(screen.getByText("Answer not delivered"));
    expect(container.textContent).toContain(pending);
    expect(container.textContent).not.toContain(long);
    fireEvent.click(screen.getByRole("button", { name: "Show full answer" }));
    await waitFor(() => expect(container.textContent).toContain(long));
  });
});

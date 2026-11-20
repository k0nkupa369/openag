import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Feed } from "./Feed";
import type { LedgerEvent } from "../types";

vi.mock("../stream", () => ({ useStream: () => ({ status: "live", completedWork: new Map(), subscribe: () => () => {} }) }));

const ev = (id: number, type: LedgerEvent["type"], payload: unknown, actor = "user"): LedgerEvent => ({
  id,
  roomId: "main",
  ts: 1_700_000_000_000 + id,
  actor,
  type,
  payload,
});

const HOSTILE = "<img src=x onerror=alert(1)><script>alert(2)</script>";

describe("Feed", () => {
  it("uses the room lead's avatar for system messages without changing their labels", () => {
    const rooms = [{ id: "main", name: "Main", leadBotId: "boss", members: ["boss", "coder"] }];
    const bots = [{ id: "boss", handle: "boss", name: "Boss", runtime: "api", model: null }, { id: "coder", handle: "coder", name: "Coder", runtime: "api", model: null }];
    const events = [ev(1, "message", { text: "Alert", wake: true }, "primary"), ev(2, "message", { text: "Run", automationId: "a" }, "automation:test"), ev(3, "bot_output", { text: "Done" }, "coder"), ev(4, "message", { text: "Copied alert", forkSource: { roomId: "old", eventId: 1 } }, "primary"), ev(5, "message", { text: "Copied run", forkSource: { roomId: "old", eventId: 2 } }, "automation:test")];
    const { container, rerender } = render(<Feed events={events} rooms={rooms} bots={bots} />);
    expect([...container.querySelectorAll(".bot-avatar")].map(el => el.getAttribute("data-bot"))).toEqual(["boss", "boss", "coder", "boss", "boss"]);
    expect(container.textContent).toContain("primary");
    expect(container.textContent).toContain("automation:test");
    rerender(<Feed events={events} rooms={[]} bots={bots} />);
    expect(container.querySelector(".bot-avatar")?.getAttribute("data-bot")).toBe("primary");
  });

  it("does not draw an empty text bubble for an attachment-only message", () => {
    const file = { id: "f1", name: "notes.txt", mimeType: "text/plain", bytes: 15 };
    const { container } = render(<Feed events={[ev(1, "message", { text: "", attachments: [file] }), ev(2, "message", { text: "With text", attachments: [file] })]} />);
    const contents = [...container.querySelectorAll('[data-slot="bubble-content"]')].map(el => el.textContent);
    expect(contents).toEqual(["With text"]);
  });

  it("renders hostile message and bot_output text as text", () => {
    const { container } = render(
      <Feed
        events={[
          ev(1, "message", { text: HOSTILE }),
          ev(2, "bot_output", { text: HOSTILE }, "coder"),
        ]}
      />,
    );
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(container.querySelectorAll("script").length).toBe(0);
    const texts = [...container.querySelectorAll('[data-slot="bubble-content"]')].map((n) => n.textContent);
    // The user's text is shown verbatim; bot output is rendered as markdown, which drops raw HTML instead of executing it.
    expect(texts[0]).toBe(HOSTILE);
    expect(texts[1]).not.toContain("<img");
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("hides plumbing events and keeps errors", () => {
    const { container } = render(
      <Feed events={[ev(1, "route", { targets: ["coder"] }), ev(2, "error", { message: "boom" }, "daemon")]} />,
    );
    expect(container.textContent).not.toContain("routed to");
    expect(container.textContent).toContain("boom");
  });

  it("shows a thinking row while a turn is running and removes it when it finishes", () => {
    const started = ev(1, "turn_started", {}, "boss");
    // A status region takes no name from its content; match the live text instead.
    const working = () => screen.queryAllByRole("status").find((el) => el.textContent?.includes("boss is working…"));
    const { rerender } = render(<Feed events={[started]} />);
    expect(working()).toBeTruthy();
    rerender(<Feed events={[started, ev(2, "turn_finished", {}, "boss")]} />);
    expect(working()).toBeUndefined();
  });

  it("shows an empty state and exposes a live log region", () => {
    const { container } = render(<Feed events={[]} />);
    expect(container.querySelector('[role="log"][aria-live="polite"]')).toBeTruthy();
    expect(container.textContent).toContain("Start a conversation");
  });
});

describe("Feed inline approvals", () => {
  const approval = {
    id: "ap1", roomId: "main", botId: "coder", turnId: "t1", toolName: "write_file", toolClass: "act-local",
    payload: { path: "a.ts" }, status: "pending" as const, reviewVersion:"fixture-review",toolCallId:null,review:null,canEdit:true, createdAt: 1,
  };
  const requested = ev(1, "approval_requested", { approvalId: "ap1" }, "coder");

  it("shows the card for a pending approval and no ledger line", () => {
    const { container, getByText } = render(<Feed events={[requested]} approvals={[approval]} onDecide={async () => {}} />);
    expect(getByText("Waiting for you")).toBeTruthy();
    expect(container.textContent).not.toContain("approval requested:");
  });

  it("hides the row once the approval is no longer pending", () => {
    const { container } = render(<Feed events={[requested]} approvals={[]} onDecide={async () => {}} />);
    expect(container.querySelector("article")).toBeNull();
  });
});

describe("Feed tool plumbing", () => {
  it("shows tool calls and results in a collapsed activity trace", () => {
    const { container } = render(
      <Feed events={[ev(1, "tool_call", { tool: "x" }, "coder"), ev(2, "tool_result", { ok: true }, "coder")]} />,
    );
    expect(container.querySelectorAll('[data-slot="trace"]').length).toBe(1);
    expect(container.querySelectorAll('button[aria-expanded="false"]').length).toBe(2);
  });
});

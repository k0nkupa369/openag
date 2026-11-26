import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "./ApprovalCard";
import type { Approval, Decision } from "../types";
import type { Api } from "../api";

const HOSTILE = "<script>alert(1)</script><img src=x onerror=alert(2)>";

function approval(id: string, toolName: string, payload: unknown): Approval {
  return {
    id,
    roomId: "main",
    botId: "boss",
    turnId: "t1",
    toolName,
    toolClass: "act-local",
    payload,
    status: "pending", reviewVersion:"fixture-review",toolCallId:null,review:null,canEdit:true,
    createdAt: 1_700_000_000_000,
  };
}

function setup(a: Approval) {
  const onDecide = vi.fn<(id: string, d: Decision) => Promise<void>>(async () => {});
  const utils = render(<ApprovalCard approval={a} onDecide={onDecide} />);
  return { onDecide, ...utils };
}

describe("ApprovalCard reflection payloads", () => {
  it("renders a memory proposal as readable text; the raw JSON stays in the collapsed exact-proposal disclosure", () => {
    const { container } = setup(approval("m1", "reflection_memory", { text: "Prefers metric units" }));
    const card = within(container.querySelector("[role=\"article\"]") as HTMLElement);
    expect(card.getByText("Remember this")).toBeTruthy();
    expect(card.getByText("Prefers metric units")).toBeTruthy();
    const raw = container.querySelector("pre");
    expect(raw?.closest('[data-slot="collapsible-content"]')?.hasAttribute("hidden")).toBe(true);
  });

  it("renders a skill proposal's name, description and body in a pre", () => {
    const { container } = setup(
      approval("s1", "reflection_skill", {
        slug: "weekly-report",
        name: "Weekly report",
        description: "Builds the weekly summary",
        body: "1. Collect\n2. Summarise",
      }),
    );
    const card = within(container.querySelector("[role=\"article\"]") as HTMLElement);
    expect(card.getByText("Proposed skill: Weekly report")).toBeTruthy();
    expect(card.getByText("Builds the weekly summary")).toBeTruthy();
    expect(container.querySelector("pre")?.textContent).toBe("1. Collect\n2. Summarise");
  });

  it("renders hostile reflection text as inert text", () => {
    const { container } = setup(approval("m2", "reflection_memory", { text: HOSTILE }));
    expect(container.querySelector('[data-slot="reflection-text"]')?.textContent).toBe(HOSTILE);
    expect(container.querySelectorAll("script").length).toBe(0);
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("keeps the generic JSON view and Edit for other tools", () => {
    const { container, getByRole } = setup(approval("g1", "write_file", { path: "/tmp/a" }));
    expect(container.querySelector("pre")?.textContent).toBe(JSON.stringify({ path: "/tmp/a" }, null, 2));
    fireEvent.click(getByRole("button", { name: "Edit" }));
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      JSON.stringify({ path: "/tmp/a" }, null, 2),
    );
  });

  it("Edit still edits the raw JSON payload for a reflection proposal", () => {
    const { container, getByRole, onDecide } = setup(approval("m3", "reflection_memory", { text: "old" }));
    fireEvent.click(getByRole("button", { name: "Edit" }));
    const box = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(box.value).toBe(JSON.stringify({ text: "old" }, null, 2));
    fireEvent.change(box, { target: { value: '{"text":"new"}' } });
    fireEvent.click(getByRole("button", { name: "Approve edit" }));
    expect(onDecide).toHaveBeenCalledWith("m3", { reviewVersion:"fixture-review", kind: "edit", payload: { text: "new" } });
  });

  it("falls back to the JSON view when a reflection payload is malformed", () => {
    const { container } = setup(approval("m4", "reflection_memory", { note: 3 }));
    expect(container.querySelector("pre")?.textContent).toBe(JSON.stringify({ note: 3 }, null, 2));
  });
});

describe("reflection_skill slug", () => {
  it("shows the slug the skill will be saved under", () => {
    const { container } = render(
      <ApprovalCard
        approval={{ id: "a1", roomId: "main", botId: "boss", turnId: null, toolName: "reflection_skill", toolClass: "act-local", payload: { slug: "deploy-prod", name: "Tips", description: "d", body: "b" }, status: "pending", reviewVersion:"fixture-review",toolCallId:null,review:null,canEdit:true, edit: null, responseText: null, createdAt: 0, decidedAt: null } as never}
        onDecide={async () => undefined}
      />,
    );
    expect(container.textContent).toContain("deploy-prod");
  });
});

describe("ApprovalCard Slack source", () => {
  function withSource(source: string | null | undefined): Approval {
    return { ...approval("src", "write_file", { path: "/tmp/a" }), source };
  }

  it("shows the Slack user id for a slack:<id> source", () => {
    const { container } = setup(withSource("slack:U0123456789"));
    expect(container.querySelector('[data-slot="approval-source"]')?.textContent).toBe("From Slack user U0123456789");
  });

  it("shows plain 'From Slack' for an unknown Slack user", () => {
    const { container } = setup(withSource("slack"));
    expect(container.querySelector('[data-slot="approval-source"]')?.textContent).toBe("From Slack");
  });

  it("shows nothing for desk (null) or missing source", () => {
    expect(setup(withSource(null)).container.querySelector('[data-slot="approval-source"]')).toBeNull();
    expect(setup(withSource(undefined)).container.querySelector('[data-slot="approval-source"]')).toBeNull();
  });

  it("renders a hostile Slack source as inert text", () => {
    const { container } = setup(withSource("slack:<img src=x onerror=alert(1)>"));
    expect(container.querySelector('[data-slot="approval-source"]')?.textContent).toBe("From Slack user <img src=x onerror=alert(1)>");
    expect(container.querySelectorAll("img").length).toBe(0);
  });
});

describe("ApprovalCard management proposals", () => {
  const proposal = (overrides: Partial<Approval> = {}): Approval => ({
    ...approval("p1", "management_automation", {
      action: "create", automationId: null, base: null, change: {}, proposedBy: "bot",
      display: { action: "create", name: "Inbox check", schedule: "0 8 * * 1-5", timezone: "UTC", nextRunAt: null, room: "main", bot: "Bot", prompt: "Check my inbox", allowApprovals: false, enabled: true, changes: [] },
    }),
    botId: "daemon", turnId: null, source: "management-proposal", canEdit: false, ...overrides,
  });

  it("shows the proposed automation with Accept and Ignore only", () => {
    const { container, onDecide } = setup(proposal());
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(card.getByText("bot proposes a new automation")).toBeTruthy();
    expect(card.getByText("Inbox check")).toBeTruthy();
    expect(card.getByText("Check my inbox")).toBeTruthy();
    expect(card.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(card.queryByRole("button", { name: "Respond" })).toBeNull();
    fireEvent.click(card.getByRole("button", { name: "Create automation" }));
    expect(onDecide).toHaveBeenCalledWith("p1", { kind: "accept", reviewVersion: "fixture-review" });
    expect(card.getByRole("button", { name: "Ignore" })).toBeTruthy();
    expect(card.queryByText(/No explicit target supplied/)).toBeNull();
  });

  it("labels changed fields in plain words", () => {
    const base = proposal();
    const payload = base.payload as { display: Record<string, unknown> };
    const { container } = setup({ ...base, payload: { ...payload, display: { ...payload.display, action: "update", changes: [{ field: "scheduleCron", from: "0 9 * * 1", to: "0 16 * * 5" }] } } });
    const changes = within(container.querySelector('[aria-label="Changes"]') as HTMLElement);
    expect(changes.getByText("Schedule")).toBeTruthy();
    expect(changes.queryByText("scheduleCron")).toBeNull();
  });

  it("is read-only on a device that cannot decide", () => {
    const { container } = render(<ApprovalCard approval={proposal()} onDecide={vi.fn()} canDecide={false} />);
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(card.queryByRole("button", { name: "Create automation" })).toBeNull();
    expect(card.getByText("Needs an owner or full-access device to decide.")).toBeTruthy();
  });

  it("a lookalike tool name from a turn is not treated as a proposal", () => {
    const { container } = setup(proposal({ turnId: "t1", source: null, botId: "boss" }));
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(card.queryByRole("button", { name: "Create automation" })).toBeNull();
    expect(card.getByRole("button", { name: "Respond" })).toBeTruthy();
  });
});

describe("ApprovalCard settings proposals", () => {
  const proposal = (toolName: string, sentence: { verb: string; name: string | null }, changes: { field: string; from: string; to: string }[]): Approval => ({
    ...approval("s1", toolName, { feature: "heartbeat", base: {}, value: {}, proposedBy: "bot", sentence, display: { changes } }),
    botId: "daemon", turnId: null, source: "management-proposal", canEdit: false,
  });

  it("states the change and shows before and after, with Apply change and Ignore only", () => {
    const { container, onDecide } = setup(proposal("management_proactive", { verb: "change the scheduled checks", name: null }, [{ field: "Interval", from: "Every 180 minutes", to: "Every 60 minutes" }]));
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(card.getByText("bot proposes to change the scheduled checks")).toBeTruthy();
    const change = within(card.getByRole("region", { name: "Proposed change" }));
    expect(change.getByText("Interval")).toBeTruthy();
    expect(change.getByText("Every 180 minutes → Every 60 minutes")).toBeTruthy();
    expect(card.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(card.queryByRole("button", { name: "Respond" })).toBeNull();
    fireEvent.click(card.getByRole("button", { name: "Apply change" }));
    expect(onDecide).toHaveBeenCalledWith("s1", { kind: "accept", reviewVersion: "fixture-review" });
  });

  it("quotes a named destination", () => {
    const { container } = setup(proposal("management_delivery_room", { verb: "send proactive messages to", name: "Ops" }, [{ field: "Delivery", from: "The default bot's direct chat", to: "Ops" }]));
    expect(within(container.querySelector('[role="article"]') as HTMLElement).getByText("bot proposes to send proactive messages to “Ops”")).toBeTruthy();
  });

  it("shows only the new value for something new, and the card's notes", () => {
    const base = proposal("management_room", { verb: "change room", name: "Team" }, [{ field: "Name", from: "", to: "Launch plan" }, { field: "Agents", from: "Coder, Writer", to: "Writer" }]);
    const { container } = setup({ ...base, payload: { ...(base.payload as object), display: { changes: (base.payload as { display: { changes: unknown[] } }).display.changes, notes: ["1 automation in this room runs as this agent and will stop running."] } } });
    const change = within(within(container.querySelector('[role="article"]') as HTMLElement).getByRole("region", { name: "Proposed change" }));
    expect(change.getByText("Launch plan")).toBeTruthy();
    expect(change.getByText("Coder, Writer → Writer")).toBeTruthy();
    expect(change.getByText("1 automation in this room runs as this agent and will stop running.")).toBeTruthy();
  });

  it("is read-only on a device that cannot decide", () => {
    const { container } = render(<ApprovalCard approval={proposal("management_proactive", { verb: "turn on the morning brief", name: null }, [])} onDecide={vi.fn()} canDecide={false} />);
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(card.queryByRole("button", { name: "Apply change" })).toBeNull();
    expect(card.getByText("Needs an owner or full-access device to decide.")).toBeTruthy();
  });
});

describe("ApprovalCard skill curator proposals", () => {
  const revise = (payload: Record<string, unknown> = {}) => approval("r1", "reflection_skill_revise", {
    slug: "weekly-review", name: "Weekly review", description: "Review the week",
    body: "1. Collect\n2. Summarise the week\n3. Send", reason: "Missed the send step", baseVersion: 2, ...payload,
  });
  // Saved SKILL.md bodies end with a newline; the proposal usually does not, which is not a change.
  const skillApi = (version: number, body = "1. Collect\n2. Summarise\n") => ({
    getSkill: vi.fn(async () => ({ skill: { slug: "weekly-review", name: "Weekly review", description: "Review the week", version, triggers: [], body } })),
  }) as unknown as Api & { getSkill: ReturnType<typeof vi.fn> };

  it("shows a revision as removed and added lines against the agent's current version", async () => {
    const api = skillApi(2);
    const { container } = render(<ApprovalCard approval={revise()} onDecide={vi.fn()} api={api} />);
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(card.getByText("boss wants to revise a skill")).toBeTruthy();
    expect(card.getByText("Missed the send step")).toBeTruthy();
    const change = await card.findByRole("region", { name: "Changes to Weekly review" });
    expect(api.getSkill).toHaveBeenCalledWith("boss", "weekly-review");
    // Each line carries a visual +/- mark and a screen-reader label.
    const lines = [...change.querySelectorAll("[data-change]")].map(line => line.textContent);
    expect(lines).toEqual([" 1. Collect", "-removed: 2. Summarise", "+added: 2. Summarise the week", "+added: 3. Send"]);
    expect(card.queryByText(/changed after this proposal/)).toBeNull();
  });

  it("warns that accepting will be refused when the skill changed since the proposal", async () => {
    const { container } = render(<ApprovalCard approval={revise()} onDecide={vi.fn()} api={skillApi(3)} />);
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(await card.findByText(/changed after this proposal/)).toBeTruthy();
  });

  it("shows the proposed text without a comparison when the current version cannot be read", () => {
    const { container } = setup(revise());
    expect(container.textContent).toContain("3. Send");
  });

  it("shows the archive reason and Accept without Edit", () => {
    const a = { ...approval("x1", "reflection_skill_archive", { slug: "old-report", name: "Old report", reason: "Not loaded since August", baseVersion: 1 }), canEdit: false };
    const { container } = setup(a);
    const card = within(container.querySelector('[role="article"]') as HTMLElement);
    expect(card.getByText("boss wants to archive a skill")).toBeTruthy();
    expect(card.getByText("Archive skill: Old report")).toBeTruthy();
    expect(card.getByText("Not loaded since August")).toBeTruthy();
    expect((card.getByRole("button", { name: "Edit" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

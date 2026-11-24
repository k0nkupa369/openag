import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { ProactiveHistory, ProactiveSources } from "./ProactiveSources";

const status = { revision: 1, services: [], accounts: [], runs: [], intervalMinutes: 60, nextDueAt: null };
const makeApi = () => ({ getProactive: vi.fn(async () => status) }) as unknown as Api & { getProactive: ReturnType<typeof vi.fn> };

afterEach(() => cleanup());

describe("Proactive sources and history", () => {
  it("never reads proactive status on a Limited device", () => {
    const api = makeApi();
    render(<><ProactiveSources api={api} /><ProactiveHistory api={api} /></>);
    expect(screen.getByText("Needs an owner or full-access device.")).toBeTruthy();
    expect(screen.getByText(/Check details include mailbox excerpts/)).toBeTruthy();
    expect(api.getProactive).not.toHaveBeenCalled();
  });

  it("reads status for an owner or Full device", async () => {
    const api = makeApi();
    render(<><ProactiveSources api={api} canManage /><ProactiveHistory api={api} canManage /></>);
    await waitFor(() => expect(api.getProactive).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Needs an owner or full-access device.")).toBeNull();
  });

  it("shows model calls per day with provider-reported tokens", async () => {
    const api = { getProactive: vi.fn(async () => ({ ...status, usage: [
      { date: "2026-11-20", calls: 3, models: ["openai/gpt-5.4-mini"], tokens: { input: 11869, cached: 11008, output: 74, reportedCalls: 3 } },
      { date: "2026-11-18", calls: 1, models: ["openai/gpt-5.4-mini"], tokens: { input: 900, cached: 0, output: 9, reportedCalls: 1 } },
      { date: "2026-11-19", calls: 8, models: ["gpt-6.1-terra"], tokens: null },
    ] })) } as unknown as Api;
    render(<ProactiveHistory api={api} canManage />);
    const table = await screen.findByRole("table", { name: "Model use by day" });
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows[0]).toContain("3");
    expect(rows[0]).toContain("openai/gpt-5.4-mini");
    expect(rows[0]).toContain("11,869 in (11,008 cached)");
    expect(rows[0]).toContain("74 out");
    expect(rows[1]).toContain("900 in · 9 out");
    expect(rows[2]).toContain("8");
    expect(rows[2]).toContain("Not reported");
  });
});

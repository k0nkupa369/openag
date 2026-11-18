import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { ApiError } from "../api";
import { ReflectionPanel } from "./ReflectionPanel";

const setting = {
  enabled: false,
  time: "02:30",
  botId: "boss",
  lookbackHours: 24,
  maxMemoryProposals: 5,
  maxSkillProposals: 1,
};

const runs = [
  { id: 1, localDate: "2026-10-27", startedAt: 1, finishedAt: 2, status: "finished", memoryProposals: 2, skillProposals: 1 },
  { id: 2, localDate: "2026-10-26", startedAt: 3, finishedAt: null, status: "running", memoryProposals: 0, skillProposals: 0 },
];

function makeApi(overrides: Partial<Record<string, unknown>> = {}, status: Record<string, unknown> = {}) {
  let stored = { ...setting };
  return {
    getReflection: vi.fn(async () => ({ setting: stored, running: false, runs, ...status })),
    listBots: vi.fn(async () => ({ bots: [] })),
    putSetting: vi.fn(async (_key: string, value: typeof setting) => { stored = value; return { key: "reflection", value }; }),
    runReflection: vi.fn(async () => ({ started: true })),
    ...overrides,
  } as unknown as Api & {
    putSetting: ReturnType<typeof vi.fn>;
    runReflection: ReturnType<typeof vi.fn>;
    getReflection: ReturnType<typeof vi.fn>;
  };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe("ReflectionPanel", () => {
  it("loads the setting and shows the recent runs", async () => {
    render(<ReflectionPanel canManage api={makeApi()} />);
    await flush();
    expect((screen.getByRole("switch", { name: /Enable nightly reflection/ })).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByLabelText(/Time \(HH:MM\)/) as HTMLInputElement).value).toBe("02:30");
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("2 memory notes")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("shows the explanation and an empty state when there are no runs", async () => {
    render(<ReflectionPanel canManage api={makeApi({}, { runs: [] })} />);
    await flush();
    expect(screen.getByText("No runs yet")).toBeTruthy();
  });

  it("Save sends the full setting object with the edited time", async () => {
    const api = makeApi();
    render(<ReflectionPanel canManage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole("switch", { name: /Enable nightly reflection/ }));
    fireEvent.change(screen.getByLabelText(/Time \(HH:MM\)/), { target: { value: "23:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await flush();
    expect(api.putSetting).toHaveBeenCalledWith("reflection", { ...setting, enabled: true, time: "23:15" });
    expect(screen.getByText("Saved.")).toBeTruthy();
  });

  it("blocks an invalid time client-side and does not save", async () => {
    const api = makeApi();
    render(<ReflectionPanel canManage api={api} />);
    await flush();
    fireEvent.change(screen.getByLabelText(/Time \(HH:MM\)/), { target: { value: "25:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await flush();
    expect(api.putSetting).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Time must be HH:MM, 24-hour (for example 02:30).");
  });

  it("Run now calls runReflection", async () => {
    const api = makeApi();
    render(<ReflectionPanel canManage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await flush();
    expect(api.runReflection).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Run started/)).toBeTruthy();
  });

  it("shows the 409 message inline when a run is already in progress", async () => {
    const api = makeApi({
      runReflection: vi.fn(async () => {
        throw new ApiError("a reflection run is already in progress", 409);
      }),
    });
    render(<ReflectionPanel canManage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("a reflection run is already in progress");
  });

  it("disables Run now while a run is in progress", async () => {
    render(<ReflectionPanel canManage api={makeApi({}, { running: true })} />);
    await flush();
    expect((screen.getByRole("button", { name: "Run now" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("A run is in progress.")).toBeTruthy();
  });
});

const isDisabled = (el: Element) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");

describe("limited device", () => {
  it("shows reflection read-only and cannot save or run", async () => {
    const api = makeApi();
    render(<ReflectionPanel api={api} />);
    const save = await screen.findByRole("button", { name: "Save" });
    expect(isDisabled(save)).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: "Run now" }))).toBe(true);
    expect(isDisabled(screen.getByRole("switch", { name: "Enable nightly reflection" }))).toBe(true);
    fireEvent.click(save);
    expect(api.putSetting).not.toHaveBeenCalled();
  });
});


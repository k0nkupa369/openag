import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api";
import { OwnerNotesSection } from "./OwnerNotesSection";

const FILE = "- 2026-11-01 Prefers metric units\n- 2026-11-02 Works from Auckland\n";

function makeApi(text = FILE) {
  let stored = text;
  return {
    getOwnerNotes: vi.fn(async () => ({ text: stored, maxBytes: 16384, headTokens: Math.ceil(stored.length / 4), headCap: 500 })),
    putOwnerNotes: vi.fn(async (next: string) => { stored = next; return { text: stored }; }),
    set(next: string) { stored = next; },
  } as unknown as Api & { getOwnerNotes: ReturnType<typeof vi.fn>; putOwnerNotes: ReturnType<typeof vi.fn>; set(next: string): void };
}

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const notes = () => within(screen.getByRole("list", { name: "Owner notes" })).getAllByRole("listitem").map(item => item.textContent);

describe("Owner notes in Profile", () => {
  it("lists every note for a Limited device without edit or remove controls", async () => {
    render(<OwnerNotesSection api={makeApi()} canManage={false} />);
    await flush();
    expect(notes()).toEqual([expect.stringContaining("Prefers metric units"), expect.stringContaining("Works from Auckland")]);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit notes" })).toBeNull();
    expect(screen.getByText(/Full access is required to change owner notes/)).toBeTruthy();
  });

  it("says plainly when there are no notes yet", async () => {
    render(<OwnerNotesSection api={makeApi("")} canManage />);
    await flush();
    expect(screen.getByText("No owner notes yet")).toBeTruthy();
  });

  it("removes one note and keeps notes added since the page loaded", async () => {
    const api = makeApi();
    render(<OwnerNotesSection api={api} canManage />);
    await flush();
    api.set(FILE + "- 2026-11-03 Has a dog called Rua\n");
    fireEvent.click(screen.getByRole("button", { name: "Remove note: 2026-11-01 Prefers metric units" }));
    await flush();
    expect(api.putOwnerNotes).toHaveBeenCalledWith("- 2026-11-02 Works from Auckland\n- 2026-11-03 Has a dog called Rua\n");
    expect(notes()).toEqual([expect.stringContaining("Works from Auckland"), expect.stringContaining("Has a dog called Rua")]);
  });

  it("edits the whole file and shows the saved notes and prompt head the daemon reports", async () => {
    const api = makeApi();
    render(<OwnerNotesSection api={api} canManage />);
    await flush();
    expect(screen.getByText("Prompt head: 17 of 500 tokens")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    fireEvent.change(screen.getByLabelText("Owner notes text"), { target: { value: "- Lives in Auckland\n" } });
    api.getOwnerNotes.mockResolvedValueOnce({ text: "- Lives in Auckland\n", maxBytes: 16384, headTokens: 7, headCap: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await flush();
    expect(api.putOwnerNotes).toHaveBeenCalledWith("- Lives in Auckland\n");
    expect(notes()).toEqual([expect.stringContaining("Lives in Auckland")]);
    expect(screen.getByText("Prompt head: 7 of 300 tokens")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Owner notes saved.");
  });

  it("keeps the draft and shows the refusal when the text contains a secret", async () => {
    const api = makeApi();
    api.putOwnerNotes.mockRejectedValue(new ApiError("Owner notes cannot contain a secret. Remove it and save again.", 400));
    render(<OwnerNotesSection api={api} canManage />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    fireEvent.change(screen.getByLabelText("Owner notes text"), { target: { value: "- key sk-secret\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toMatch(/cannot contain a secret/);
    expect((screen.getByLabelText("Owner notes text") as HTMLTextAreaElement).value).toBe("- key sk-secret\n");
  });

  it("shows the daemon's refusal when a save is not allowed", async () => {
    const api = makeApi();
    api.putOwnerNotes.mockRejectedValue(new ApiError("owner token required", 403));
    render(<OwnerNotesSection api={api} canManage />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Remove note: 2026-11-02 Works from Auckland" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toMatch(/owner token required/);
    expect(notes()).toHaveLength(2);
  });
});

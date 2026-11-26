import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api, HistorySearchResult } from "../api";
import type { Room } from "../types";
import { Shell } from "./Shell";

const rooms: Room[] = [{ id: "ops", name: "Operations", leadBotId: "coder", members: ["coder"], kind: "room" }];

function renderShell(search: (q: string) => Promise<{ results: HistorySearchResult[] }>) {
  const historySearch = vi.fn((query: { q: string }) => search(query.q));
  render(<Shell api={{ historySearch } as unknown as Api} rooms={rooms} route={{ kind: "home" }} status="live"><p>content</p></Shell>);
  return historySearch;
}

async function openAndType(text: string) {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const input = await screen.findByRole("combobox");
  fireEvent.change(input, { target: { value: text } });
  return input;
}

afterEach(() => { window.location.hash = ""; });

describe("history search in the desk search command", () => {
  it("shows matching messages labelled by conversation with matched words highlighted", async () => {
    const historySearch = renderShell(async () => ({ results: [
      { eventId: 41, roomId: "ops", roomTitle: "Operations", actor: "coder", ts: Date.UTC(2026, 10, 1), snippet: "Noted: mirror to the NAS weekly.", highlights: [[21, 24]] },
    ] }));
    await openAndType("nas");
    const result = await screen.findByRole("option", { name: /mirror to the NAS weekly/ });
    expect(result.textContent).toContain("Operations");
    expect(result.textContent).toContain("coder");
    const marks = result.querySelectorAll("mark");
    expect([...marks].map(mark => mark.textContent)).toEqual(["NAS"]);
    expect(historySearch).toHaveBeenCalledWith(expect.objectContaining({ q: "nas" }), expect.anything());
  });

  it("says plainly when no message matches", async () => {
    renderShell(async () => ({ results: [] }));
    await openAndType("zebra");
    expect(await screen.findByText("No messages match.")).toBeTruthy();
  });

  it("opens the conversation at the selected message", async () => {
    renderShell(async () => ({ results: [
      { eventId: 41, roomId: "ops", roomTitle: "Operations", actor: "user", ts: Date.UTC(2026, 10, 1), snippet: "mirror the NAS", highlights: [] },
    ] }));
    await openAndType("mirror");
    const result = await screen.findByRole("option", { name: /mirror the NAS/ });
    act(() => { fireEvent.click(result); });
    await waitFor(() => expect(window.location.hash).toBe("#/room/ops/message/41"));
  });
});

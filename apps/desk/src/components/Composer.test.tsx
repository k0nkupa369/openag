import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { Composer, type ReplyTarget } from "./Composer";

const bots = [
  { id: "boss", handle: "boss", name: "Boss", runtime: "api", model: null },
  { id: "coder", handle: "coder", name: "Coder", runtime: "acp", model: null, adapter: "claude code" },
];

function type(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value, selectionStart: value.length } });
}

describe("Composer @mention picker", () => {
  it("lists the room's bots when typing @ and filters as you type", () => {
    render(<Composer api={{} as Api} roomId="main" onSend={vi.fn()} bots={bots} />);
    const box = screen.getByRole("combobox");
    type(box, "@");
    expect(screen.getAllByRole("option").length).toBe(3); // boss, coder, everyone
    type(box, "@co");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("Coder")]);
  });

  it("inserts the bot id on Enter instead of sending", () => {
    const onSend = vi.fn(async () => {});
    render(<Composer api={{} as Api} roomId="main" onSend={onSend} bots={bots} />);
    const box = screen.getByRole("combobox") as HTMLTextAreaElement;
    type(box, "@co");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("@coder ");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not open inside an email address and closes on Escape", () => {
    render(<Composer api={{} as Api} roomId="main" onSend={vi.fn()} bots={bots} />);
    const box = screen.getByRole("combobox");
    type(box, "mail a@co");
    expect(screen.queryAllByRole("option").length).toBe(0);
    type(box, "@");
    expect(screen.queryAllByRole("option").length).toBe(3);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryAllByRole("option").length).toBe(0);
  });
});

describe("Composer reply preview", () => {
  const targets: [string, ReplyTarget][] = [
    ["a quoted message", { kind: "message", messageId: 7, quote: { actor: "coder", text: "The message being quoted" } }],
    ["an open question", { kind: "question", questionId: "q1", revision: 2, quote: { actor: "boss", text: "Which local option?" } }],
  ];

  it.each(targets)("shows %s as the same quote preview, and Cancel reply or Escape cancels it", (_, target) => {
    const onCancelReply = vi.fn();
    render(<Composer api={{} as Api} roomId="main" onSend={vi.fn()} bots={bots} reply={target} onCancelReply={onCancelReply} />);
    const preview = screen.getByLabelText("Reply preview");
    const name = bots.find(bot => bot.id === target.quote.actor)!.name;
    expect(within(preview).getByLabelText(`Quoted message from ${name}`).textContent).toContain(target.quote.text);
    expect(screen.queryByRole("button", { name: "New message" })).toBeNull();
    fireEvent.click(within(preview).getByRole("button", { name: "Cancel reply" }));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onCancelReply).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RtcUnreachable } from "./RtcUnreachable";

describe("RtcUnreachable", () => {
  it("explains the state and offers retry and re-pairing", () => {
    const onRetry = vi.fn(), onPairAgain = vi.fn();
    render(<RtcUnreachable onRetry={onRetry} onPairAgain={onPairAgain} />);
    expect(screen.getByText(/can't reach OpenAg over WebRTC/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Pair again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onPairAgain).toHaveBeenCalledTimes(1);
  });
});

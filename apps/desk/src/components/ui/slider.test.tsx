import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Slider } from "./slider";

describe("Slider", () => {
  it("positions the thumb inside the control and renders one named thumb for a scalar value", () => {
    const { container } = render(<Slider aria-label="Zoom image" min={1} max={3} step={0.01} value={1.5} onValueChange={() => {}} />);
    const thumbs = container.querySelectorAll('[data-slot="slider-thumb"]');
    expect(thumbs).toHaveLength(1);
    // The thumb is absolutely positioned by Base UI; without a positioned control it escapes to the nearest dialog.
    expect(thumbs[0].parentElement?.className).toMatch(/\brelative\b/);
    expect(container.querySelectorAll('input[type="range"][aria-label="Zoom image"]')).toHaveLength(1);
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { ProfileSettings } from "./ProfileSettings";

const api = { getOwnerNotes: () => new Promise(() => {}) } as unknown as Api;

const profile = vi.hoisted(() => ({ value: { name: "You", avatar: null }, save: vi.fn(), open: vi.fn() }));
vi.mock("../profile", () => ({ useProfile: () => ({ profile: profile.value, loading: false, error: null, save: profile.save }) }));
vi.mock("../profile-image", () => ({ openProfileImage: profile.open }));

function busy(name: RegExp) {
  const button = screen.getByRole("button", { name }) as HTMLButtonElement;
  expect(button.matches(":disabled")).toBe(true);
  expect(within(button).getByRole("status", { name: "Loading" })).toBeTruthy();
}

describe("ProfileSettings busy states", () => {
  it("shows a spinner on the disabled Save button while the profile saves", () => {
    profile.save.mockReturnValue(new Promise(() => {}));
    render(<ProfileSettings api={api} canManage />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Taylor" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    busy(/Saving/);
  });

  it("shows a spinner on the disabled Upload button while an image is read", () => {
    profile.open.mockReturnValue(new Promise(() => {}));
    render(<ProfileSettings api={api} canManage />);
    fireEvent.change(screen.getByLabelText("Upload avatar image"), { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
    busy(/Reading image/);
  });
});

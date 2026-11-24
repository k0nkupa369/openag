// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CheckResult } from "./McpServerCheck";

afterEach(cleanup);

test("a server that asks for sign-in reads as reachable, with the next step, not as a failed check", () => {
  render(<CheckResult state={{ state: "done", ok: false, reason: "needs sign-in" }} />);
  expect(screen.getByText("Server reachable: sign-in needed")).toBeTruthy();
  expect(screen.getByText(/Turn on Sign in with OAuth, save the server, then choose Sign in in its settings\./)).toBeTruthy();
  expect(screen.queryByText("The check did not complete")).toBeNull();
});

test("an unreachable server still reads as a failed check", () => {
  render(<CheckResult state={{ state: "done", ok: false, reason: "connect failed" }} />);
  expect(screen.getByText("The check did not complete")).toBeTruthy();
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Login } from "./Login";

const DEVICE = "device-token-abc";

function json(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init ?? {}));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("Login", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pairs with a normalised code and stores the returned token", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetchMock = stubFetch((url) => {
      if (url === "/pair") return json(200, { deviceId: "d3", token: DEVICE });
      return json(404, {});
    });
    const onSignedIn = vi.fn();
    render(<Login notice={null} onSignedIn={onSignedIn} />);
    fireEvent.click(screen.getByRole("tab", { name: "Pair with a code" }));
    // The eight-slot input accepts letters and digits only; the separator is added when the code is sent.
    fill("Pairing code", "abcd2345");
    fill("Device name", "Tablet");
    fireEvent.click(screen.getByRole("button", { name: "Connect device" }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(DEVICE));
    const call = fetchMock.mock.calls.find(([u]) => u === "/pair");
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ code: "ABCD-2345", name: "Tablet" });
    expect((call?.[1] as RequestInit).headers).not.toHaveProperty("authorization");
    expect(setItem).toHaveBeenCalledWith("openag-token", DEVICE);
  });

  it("shows the invalid-code message on 400", async () => {
    stubFetch(() => json(400, { error: "invalid or expired code" }));
    render(<Login notice={null} onSignedIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Pair with a code" }));
    fill("Pairing code", "ZZZZZZZZ");
    fireEvent.click(screen.getByRole("button", { name: "Connect device" }));
    expect(await screen.findByText("Invalid or expired code")).toBeTruthy();
  });

  it("shows the Retry-After seconds on 429", async () => {
    stubFetch(() => json(429, { error: "too many attempts" }, { "Retry-After": "42" }));
    render(<Login notice={null} onSignedIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Pair with a code" }));
    fill("Pairing code", "ZZZZZZZZ");
    fireEvent.click(screen.getByRole("button", { name: "Connect device" }));
    expect(await screen.findByText("Too many attempts. Try again in 42 seconds.")).toBeTruthy();
  });
});

describe("Login join link", () => {
  it("opens on the pairing tab with the code from #/join/<code> and removes it from the URL", () => {
    window.location.hash = "#/join/ABCD2345";
    render(<Login notice={null} onSignedIn={() => {}} />);
    expect((screen.getByLabelText(/pairing code/i) as HTMLInputElement).value).toBe("ABCD2345");
    expect(window.location.hash).toBe("");
  });
});

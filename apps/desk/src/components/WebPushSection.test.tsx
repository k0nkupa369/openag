import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { WebPushSection } from "./WebPushSection";

const KEY = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function makeApi(over: Partial<Record<string, unknown>> = {}) {
  return {
    getWebPush: vi.fn(async () => ({ enabled: true, subjectSet: true, publicKey: KEY, mine: [] })),
    getSettings: vi.fn(async () => ({ settings: { push: { enabled: false, server: "https://ntfy.sh", topic: null, publicUrl: null, includeDetail: false, maxPerHour: 20, webPush: { enabled: true, subject: "mailto:o@example.com" } } } })),
    putSetting: vi.fn(async () => ({})),
    addWebPushSubscription: vi.fn(async () => ({})),
    removeWebPushSubscription: vi.fn(async () => ({ removed: true })),
    sendWebPushTest: vi.fn(async () => ({ ok: true })),
    ...over,
  } as unknown as Api & Record<string, ReturnType<typeof vi.fn>>;
}

/** A browser with a service worker and a push manager that hands out one fake subscription. */
type FakeSub = { options: { applicationServerKey: ArrayBuffer }; toJSON(): unknown; unsubscribe: ReturnType<typeof vi.fn> };
function installBrowser(permission: NotificationPermission = "default", existing: FakeSub | null = null) {
  let sub: FakeSub | null = existing;
  const pushManager = {
    getSubscription: vi.fn(async () => sub),
    subscribe: vi.fn(async (opts: { applicationServerKey: Uint8Array }) => (sub = { options: { applicationServerKey: opts.applicationServerKey.buffer as ArrayBuffer }, toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: KEY, auth: "BTBZMqHH6r4Tts7J_aSIgg" } }), unsubscribe: vi.fn(async () => true) })),
  };
  const reg = { pushManager };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve(reg), getRegistration: async () => reg } });
  vi.stubGlobal("Notification", { permission, requestPermission: vi.fn(async () => "granted") });
  return pushManager;
}

afterEach(() => vi.unstubAllGlobals());

describe("WebPushSection", () => {
  it("explains why it is unavailable instead of offering a button", async () => {
    render(<WebPushSection api={makeApi()} support={{ ok: false, reason: "insecure" }} />);
    await flush();
    expect(screen.getByText("Not available here")).toBeTruthy();
    expect(screen.getByText(/HTTPS \(for example Tailscale Serve\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on for this device" })).toBeNull();
  });

  it("turns on: asks permission, subscribes with the daemon's key and registers this device", async () => {
    const pm = installBrowser();
    const api = makeApi();
    render(<WebPushSection api={api} support={{ ok: true }} />);
    await flush();
    expect(screen.getByText("Off for this device")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn on for this device" }));
    await flush();
    expect(pm.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(api.addWebPushSubscription).toHaveBeenCalledWith({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: KEY, auth: "BTBZMqHH6r4Tts7J_aSIgg" } });
    expect(screen.getByText("On for this device")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send test" }));
    await flush();
    expect(screen.getByText("Test sent to this device.")).toBeTruthy();
  });

  it("replaces a subscription made for a rotated key when the panel opens", async () => {
    const old: FakeSub = { options: { applicationServerKey: new Uint8Array(65).fill(4).buffer }, toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/old", keys: { p256dh: KEY, auth: "BTBZMqHH6r4Tts7J_aSIgg" } }), unsubscribe: vi.fn(async () => true) };
    const pm = installBrowser("granted", old);
    const api = makeApi();
    render(<WebPushSection api={api} support={{ ok: true }} />);
    await flush();
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(pm.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(api.addWebPushSubscription).toHaveBeenCalledTimes(1);
    expect(api.addWebPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://fcm.googleapis.com/fcm/send/x" }));
    expect(screen.getByText("On for this device")).toBeTruthy();
  });

  it("shows a blocked permission as denied", async () => {
    installBrowser("denied");
    render(<WebPushSection api={makeApi()} support={{ ok: true }} />);
    await flush();
    expect(screen.getByText("Blocked in browser settings")).toBeTruthy();
  });

  it("shows owner controls only when the daemon lists every subscription, and saves the contact", async () => {
    installBrowser();
    const api = makeApi({ getWebPush: vi.fn(async () => ({ enabled: false, subjectSet: false, publicKey: KEY, mine: [], all: [{ id: "1", deviceId: "d", deviceName: "phone", host: "fcm.googleapis.com", createdAt: 1, lastOkAt: null, lastError: null }] })) });
    render(<WebPushSection api={api} support={{ ok: true }} />);
    await flush();
    expect(screen.getByText("phone · fcm.googleapis.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Web Push for this OpenAg" }));
    fireEvent.change(screen.getByLabelText("Contact for push services"), { target: { value: "mailto:me@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Web Push" }));
    await flush();
    expect(api.putSetting).toHaveBeenCalledWith("push", expect.objectContaining({ webPush: { enabled: true, subject: "mailto:me@example.com" }, server: "https://ntfy.sh" }));
  });
});

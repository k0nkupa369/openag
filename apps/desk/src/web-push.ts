import type { Api } from "./api";

/** What this browser can do for Web Push. Each reason maps to one short line in the Notifications panel. */
export type WebPushSupport =
  | { ok: true }
  | { ok: false; reason: "insecure" | "unsupported" | "ios-not-installed" };

export type WebPushState = "unavailable" | "denied" | "off" | "on";

/** Web Push needs a service worker (HTTPS or localhost), the Push API and Notification. iOS also needs the installed app. */
export function webPushSupport(w: Window & typeof globalThis = window): WebPushSupport {
  if (!w.isSecureContext) return { ok: false, reason: "insecure" };
  const ios = /iPad|iPhone|iPod/.test(w.navigator.userAgent) || (w.navigator.platform === "MacIntel" && w.navigator.maxTouchPoints > 1);
  const standalone = w.matchMedia?.("(display-mode: standalone)").matches || (w.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return { ok: false, reason: "ios-not-installed" };
  if (!("serviceWorker" in w.navigator) || !("PushManager" in w) || !("Notification" in w)) return { ok: false, reason: "unsupported" };
  return { ok: true };
}

/** The browser's subscription, if any. The service worker is registered by main.tsx (production builds). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const keyBytes = (base64url: string) => {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64url.length + 3) % 4));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

/** A subscription made for another key (the owner rotated it) cannot be reused: pushes signed with the new key fail. */
const madeForOtherKey = (sub: PushSubscription, publicKey: string) =>
  sub.options.applicationServerKey != null && new Uint8Array(sub.options.applicationServerKey).join() !== keyBytes(publicKey).join();

const wire = (sub: PushSubscription) => {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("the browser returned an incomplete subscription");
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
};

/** Asks for permission, subscribes this browser with the daemon's key and registers it for this device. */
export async function enableWebPush(api: Api): Promise<WebPushState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  const { publicKey } = await api.getWebPush();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && madeForOtherKey(sub, publicKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api.addWebPushSubscription(wire(sub));
  return "on";
}

export async function disableWebPush(api: Api): Promise<WebPushState> {
  const sub = await currentSubscription();
  if (sub) {
    const { endpoint } = wire(sub);
    await sub.unsubscribe().catch(() => false);
    await api.removeWebPushSubscription(endpoint);
  }
  return "off";
}

/**
 * Re-registers an existing browser subscription. This covers a subscription the browser renewed while the desk was
 * closed: the service worker holds no device token, so it cannot do this itself. A subscription made for an older key
 * is replaced with one for the daemon's current key, since the device had already opted in.
 */
export async function resyncWebPush(api: Api, publicKey: string): Promise<boolean> {
  let sub = await currentSubscription();
  if (!sub || Notification.permission !== "granted") return false;
  if (madeForOtherKey(sub, publicKey)) {
    await sub.unsubscribe();
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  }
  await api.addWebPushSubscription(wire(sub));
  return true;
}

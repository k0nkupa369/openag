import { getRtcIdentity, setRtcIdentity, type RtcIdentity } from "./auth";
import { createRtcFetch } from "./rtc/rtcFetch";
import { createRtcTransport, type RtcTransport, type RtcTransportOptions } from "./rtc/transport";

/**
 * Picks how the desk reaches the daemon. Direct (same-origin HTTP/WebSocket) is the default and is used whenever no
 * RTC identity is stored or the daemon answers a direct probe. Otherwise the desk joins over WebRTC; if that fails
 * the result is direct again, with the error for display.
 */
export type Connectivity =
  | { mode: "direct"; error?: string }
  | { mode: "rtc"; transport: RtcTransport; fetch: typeof fetch };

export type Probe = (ms: number) => Promise<boolean>;

export interface ResolveOptions {
  token: string;
  identity: RtcIdentity | null;
  probe?: Probe;
  createTransport?: (opts: RtcTransportOptions) => Promise<RtcTransport>;
}

export const PROBE_TIMEOUT_MS = 3000;
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30_000;

/** Failed reconnects in a row, after a live WebRTC session, before the desk stops showing the stale workspace. */
export const UNREACHABLE_AFTER_FAILURES = 3;

/**
 * Whether a failed connect should replace the current view with the "can't reach OpenAg" screen. A tab that never had a
 * live WebRTC session has nothing worth keeping; one that did keeps its workspace (and drafts) through a short drop.
 */
export function showUnreachable(hadLiveSession: boolean, consecutiveFailures: number): boolean {
  return !hadLiveSession || consecutiveFailures >= UNREACHABLE_AFTER_FAILURES;
}

/**
 * Whether a resume signal (tab visible again, page restored, network back) should reconnect right away instead of
 * waiting out the backoff, which a phone may have throttled while the tab was hidden.
 */
export function shouldReconnectNow(s: { hidden: boolean; hasIdentity: boolean; live: boolean; resolving: boolean }): boolean {
  return !s.hidden && s.hasIdentity && !s.live && !s.resolving;
}

/**
 * Whether to schedule a background reconnect. A hidden WebRTC tab waits for the resume signal instead, so an idle
 * phone does not renegotiate through the relay every time the daemon idles its connection out.
 */
export function shouldScheduleRetry(s: { hidden: boolean; hasIdentity: boolean }): boolean {
  return !(s.hidden && s.hasIdentity);
}

/** Exponential reconnect delay: 1 s, 2 s, 4 s ... capped at 30 s. `attempt` counts from 0. */
export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_MS);
}

/** GET /health (unauthenticated) with a short timeout. Any failure counts as unreachable. */
export const defaultProbe: Probe = async (ms) => {
  try {
    const res = await fetch("/health", { signal: AbortSignal.timeout(ms) });
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Fetches fresh TURN credentials over a connected device transport in the background and stores them in the identity
 * for the next connect. Failures are ignored. Credentials are never logged.
 */
export function refreshTurnInBackground(transport: RtcTransport, token: string, identity: RtcIdentity): void {
  void Promise.resolve()
    .then(() => transport.turnCredentials({ authorization: `Bearer ${token}` }))
    .then((turn) => {
      // Only persist for the same device still stored (sign-out or re-pairing may have replaced it).
      if (turn && getRtcIdentity()?.deviceId === identity.deviceId) setRtcIdentity({ ...identity, turn });
    })
    .catch(() => undefined);
}

export async function resolveTransport(opts: ResolveOptions): Promise<Connectivity> {
  const { identity } = opts;
  if (identity === null) return { mode: "direct" };
  const probe = opts.probe ?? defaultProbe;
  if (await probe(PROBE_TIMEOUT_MS)) return { mode: "direct" };

  const create = opts.createTransport ?? createRtcTransport;
  try {
    const transport = await create({
      invite: {
        server: identity.server,
        topic: identity.topic,
        stun: identity.stun,
        ...(identity.turn ? { turn: identity.turn } : {}),
      },
      auth: { kind: "device", deviceId: identity.deviceId, token: opts.token },
    });
    refreshTurnInBackground(transport, opts.token, identity);
    return { mode: "rtc", transport, fetch: createRtcFetch(transport) };
  } catch (err) {
    return { mode: "direct", error: err instanceof Error ? err.message : "WebRTC connect failed" };
  }
}

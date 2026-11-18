# WebRTC join-without-VPN (OA-214 design, OA-305..307 implementation)

STATUS: the daemon side (`rtc.ts`, setting `rtc`, OFF by default, owner-only), the desk transport (`apps/desk/src/rtc/`) and its UI wiring exist. A two-machine join on one network passed on 11 November 2026 (see "Acceptance" below). Carrier-NAT traversal (TURN, OA-307) is still untested. The original spike is `scripts/spikes/webrtc-spike.mjs`. Everything below describes what the daemon enforces.

## Goal
A phone reaches the desk without Tailscale or a public port, with device pairing still required. Thin client against the
existing gateway, not a rewrite. Tailscale stays the default private path.

## Spike result (verified)
`werift@0.25.2` (pure TypeScript, MIT, Node >= 22, no native build; alternative `node-datachannel@0.33.6`, native
libdatachannel bindings, MPL-2.0) lets two peers open a data channel. In the spike the "daemon" peer answers each request
frame `{id, method, path, headers, body}` by calling the REAL gateway (`createGateway(...).fetch`), so auth is the gateway's:
`/health` 200, `/whoami` without token 401, with a device token 200, with a bad token 401, a path outside the allow-list 400.
Run: `pnpm -r build && cd scripts/spikes && npm i --no-save werift@0.25.2 && node webrtc-spike.mjs`. Signaling is in-memory,
no STUN/TURN: it proves the transport, not NAT traversal.

## Design
- Transport: one data channel `openag-api` per paired device. Frames: request/response (HTTP-shaped, JSON, <= 64 KB, an
  allow-list of API paths, GET/POST) and a stream subscription that replaces `/stream` (same ledger events).
- Phone: the desk PWA gets a small transport shim (a `fetch`/stream adapter) selected when the LAN/Tailscale URL is unreachable.
- Signaling (outbound-only on both sides; pick one in Phase 4): (a) a tiny rendezvous relay (a Cloudflare Worker/Durable
  Object, same account as the `/hooks` tunnel), (b) an ntfy topic (already integrated, topic is a secret), (c) copy/QR of
  offer/answer (no server; fine for the first pairing).
- NAT: STUN (public) and optional coturn TURN; ICE candidates reveal the daemon's addresses to the rendezvous, which is acceptable.
- Pairing binding (the key rule): an offer is only accepted if it carries an HMAC over the offer's DTLS fingerprint,
  keyed by (new device) the unused 8-char pairing code, or (known device) a key derived from its device token. A
  signaling MITM therefore cannot swap fingerprints, and a stranger who finds the rendezvous id cannot get a channel.
- Even with a channel, every frame still carries the device Bearer token and goes through the normal gateway auth, so the
  signaling layer is NOT an auth boundary. The OWNER token is never accepted over RTC (owner-only routes stay LAN/Tailscale).

## Threat model
- Who can signal: anyone who learns the rendezvous id. Mitigations: HMAC-bound offers, size caps, rate limits, at most N
  concurrent peers, offers expire in minutes. A bad offer is dropped silently (no oracle).
- A compromised rendezvous can drop or delay, and can see peer addresses; it cannot authenticate (no key) or read data (DTLS).
- A stolen device token over RTC equals a stolen token over HTTP: revocation (`DELETE /devices/:id`) must also close the peer connection.
- Abuse of the data channel: path allow-list, frame cap, per-peer rate limit, no raw WebSocket/Upgrade passthrough.

## Not done
ICE restart (deliberately: a reconnect is a new authenticated offer); a test with a real phone over carrier NAT, iOS Safari and the installed PWA (OA-307 acceptance); the WebRTC access cap for Full devices (open decision, see Known limits). Service-worker caching stays shell-only and never touches the data channel.


## As built (OA-305) and what the security review changed
- Signaling: an ntfy-compatible server (https only; http only for localhost), a SECRET topic (`POST /rtc/topic`, owner only, never listed by `GET /settings`, rotated automatically when any device is revoked). Offers go to the topic, answers to `<topic>-<id>`.
- Offer MAC: `HMAC-SHA256(key, id \n ts \n dtls-fingerprint \n kind \n device)`; the SDP must have exactly ONE `a=fingerprint` line and it must be sha-256 (werift verifies against the strongest algorithm present, so an extra sha-512 line could smuggle another certificate). Keys: `device` = sha256(token) hex; `pair` = a random per-invite SECRET minted by `POST /rtc/invite` (memory only, 5 min). The 8-char pairing code is NOT a MAC key: 40 bits can be cracked offline by anyone who saw the offer.
- ANSWER MAC (review finding 1): the daemon signs its answer with the same key over the ANSWER's own fingerprint (`kind=answer`); the phone must verify it before applying the SDP, otherwise anyone who can publish to the sub-topic could complete DTLS and steal the first frame's token or the pairing code.
- Pair peers: only `POST /pair` and `GET /health`, at most 2, absolute 3 min lifetime. Device peers: bound to one device, max 2 per device, 4 in total (slots reserved before async setup), 15 min idle, 60 frames per 10 s. Allowed paths are matched against the URL as parsed (no `%`, `\`, `//`; the parsed path must equal the sent path, defeating `%2e%2e`), and `/settings` is not reachable over RTC. The owner token is refused. Only `authorization` (rebuilt from the validated token) and a printable `content-type` are forwarded.
- A frame handler can never throw into the process: header values are validated and every handler promise is caught.
- Events: same as `/stream` minus hidden rooms; an event over 60 KB is replaced by a stub (`payload.truncated`) because SCTP messages are limited to 64 KB. Responses are chunked at 8 KB, 256 KB max (2 MB for rooms, Work, results, approvals, questions, MCP, avatars and the App library; 512 KB for provenance reads).
- Audit (`_system`): `rtc_peer` open/close with device id and counts, `rtc_offer_rejected` (rate limited), `rtc_topic_rotated`. Invites are audited as `pairing_code_created` (via rtc).

## Known limits (documented, not fixed)
- Anyone holding the topic can flood it (30 offers/min and 60 bad-MAC offers/10 min are global limits), which can delay legitimate joins; rotating the topic fixes it. A copy of the DB can sign device offers (the key is the stored token hash) but not frames. After a daemon restart an authenticated offer captured within its 2 minute window could be replayed (it only holds a slot; DTLS cannot complete). `/pair` over RTC shares one rate-limit bucket. ICE candidates chosen by an authenticated offerer make the daemon send STUN checks to those addresses. No backpressure on the data channel beyond the size caps. Hidden rooms are reachable by id exactly as over HTTP for a device.
- A device the owner changes to Full access is treated as the owner by the gateway over RTC too, so it can decide owner-only approvals (for example command reviews and management proposals) on allow-listed paths. The Design line "owner-only routes stay LAN/Tailscale" therefore holds for Limited devices and the owner token, not for Full devices. Found in the OA-306 review; not changed.
- Revoking any device rotates the topic, so every direct-join phone has to pair again with a new invite. Until then it shows the "can't reach OpenAg" screen.
- An ntfy server turns messages over 4096 bytes into attachments; an answer over 3800 bytes is refused (a werift answer with many candidates could hit it).

## TURN (OA-307)
Optional, env only: `OPENAG_RTC_TURN_URLS` + `OPENAG_RTC_TURN_SECRET` (see `docs/coturn.md`).
- **Credentials.** Only short-lived REST credentials leave the daemon. The secret is never stored, returned or visible to bots.
  - Invites and the daemon's own peer get 1 hour.
  - The phone carries the invite's `turn` into its pairing connection and its stored identity.
  - A connected device fetches 7-day credentials (`TURN_DEVICE_TTL_S`) after every connect.
- **Only the first URL is used by the daemon.** werift uses only the first TURN URL, so list UDP `turn:` first.
- **Diagnostics.**
  - `GET /rtc` reports `turn`, `icePolicy` and `lastCandidateType` (host, srflx or relay, taken from werift's nominated pair; never an address).
  - `rtc_peer` audit events with `state: "connected"` record the route.
  - `OPENAG_RTC_ICE_POLICY=relay` forces the daemon's peers through the relay, as a test aid.
- **Interface binding.** `OPENAG_RTC_BIND_IPV4=<local IPv4>` makes the daemon's peers use only that interface (werift `iceInterfaceAddresses`). A host on Tailscale, a VPN or Docker bridges then stops offering those addresses as candidates. A value that is not an IPv4 address is ignored. The address is not reported anywhere, and `OPENAG_RTC_*` is stripped from bot processes.
- **Reconnect.**
  - The daemon gives an ICE `disconnected` 15 s to recover before closing the peer, and closes at once on `failed`.
  - A daemon peer whose data channel has not opened within 30 s is closed (`connect timeout`).
  - A device's new offer replaces its own peer that never connected (`replaced`). Without this, two attempts the phone gave up on held its two slots until the 15-minute idle timeout, and every further offer was refused with `too many peers for device`. The OA-307 lab run found this.
  - The desk transport watches the connection state: `failed` ends the transport, `disconnected` gets 10 s.
  - The app reconnects with backoff, and immediately when the tab becomes visible, the page is restored or the network comes back (`shouldReconnectNow`).
  - A hidden tab schedules no background reconnect (`shouldScheduleRetry`). It waits for the resume signal, so an idle phone does not renegotiate through the relay every time the daemon idles out its connection (every 15 minutes in the lab run). Notifications do not depend on this connection; they use push.
  - Each reconnect is a NEW offer with a new id and a fresh MAC.
  - After a revoke rotates the topic, the phone re-pairs with a new invite.
  - ICE restart of a live peer is not implemented: a new offer replaces it.

## Acceptance (OA-306), 11 November 2026

Two machines, one network, real browser:
- **Daemon side.** A throwaway daemon ran on one Mac, built from `staging` `4cd2a92`, bound to `127.0.0.1:4781` only, with `rtc` enabled, signaling through `https://ntfy.sh` on a fresh secret topic, and default STUN.
- **Phone side.** On a second Mac, reached as a Cua relay Space, the built desk was served as static files on `localhost:8788` and opened in the Android emulator (`Pixel_10`, Chrome 149). `adb reverse` made it appear on the emulator's `localhost`, which is a secure origin. This is the "desk served elsewhere" case: the desk host's `/health` returns 404, so it must use WebRTC.
- **Driver.** The emulator was driven over Chrome DevTools via `adb forward … chrome_devtools_remote`.

| Step | Result |
|---|---|
| Owner creates a topic, enables RTC, creates a phone invite | `GET /rtc`: subscribed, 0 peers, no error |
| Phone: Join without VPN, paste invite | Paired and on `#/room/chat` about 6 s after submit; a new **Limited** device; chat, history and proposal cards loaded over the data channel (read-only cards: "Needs an owner or full-access device to decide.") |
| Chrome killed and reopened (happened by accident) | Reconnected automatically with the stored identity; a new device offer was accepted, peers stayed at 1 |
| Owner revokes the device (`DELETE /devices/:id?cascade=1`) | Peers 1 → 0; topic rotated (hash changed); audit `rtc_topic_rotated`, `device_revoked` |
| Revoked phone, **before the fix** | Fell back to direct mode against the static host: stale content plus "Could not load room: Request failed (404)", and no explanation |
| Revoked phone, **after the fix** (cold start; a tab with a live session now keeps its workspace for 3 failed reconnects first) | "This browser can't reach OpenAg over WebRTC right now… If this device was removed from OpenAg, pair it again." with Try again and Pair again. Pair again cleared the stored token and identity |
| Fresh invite after rotation | Paired again in about 4 s; old device stays revoked, new device Limited, 1 peer, 5 offers, 0 rejected |

The `_system` audit order was `rtc_topic_rotated`, `pairing_code_created`, `rtc_peer`(pair), `pairing_redeemed`, `rtc_peer`(device)×n, `rtc_topic_rotated`, `device_revoked`.

Not covered: carrier NAT or a real phone on mobile data (both machines share a LAN, so host candidates connect); TURN; iOS Safari (simulators were available but not used); the installed PWA; a desk loaded over plain-HTTP LAN, which is not a secure context and cannot be used for this.

## Relay lab acceptance (OA-307), 12 November 2026

**Setup**
- **Relay.** coturn 4.6.1 from Ubuntu's package, on the Linux test host. The packaged service stayed disabled; a separate lab instance was bound only to the test host's Tailscale address (UDP/TCP 3478, relay ports 49160-49200) with a throwaway shared secret, `no-tcp-relay`, quotas, and private ranges denied.
- **Daemon.** A throwaway daemon on this Mac (`127.0.0.1:4782`), built from `claude/oa-307-turn-reconnect`, with `OPENAG_RTC_TURN_URLS=turn:100.67.89.25:3478?transport=udp`, `OPENAG_RTC_ICE_POLICY=relay` and **no STUN**, so a connection could only succeed through the relay.
- **Phone.** The Android emulator (`Pixel_10`, Chrome) on the second Mac mini, as in OA-306. All three machines reached each other over Tailscale.

**Results**

| Step | Result |
|---|---|
| `GET /rtc` before joining | `turn: true`, `icePolicy: "relay"`, `lastCandidateType: null` |
| Invite | Carried `turn`, with empty STUN |
| Phone: Join without VPN | Paired and on the chat about 8 s after submit. `lastCandidateType: "relay"`; audit `rtc_peer` `connected` with route `relay` |
| coturn log | Permission requests toward the peers' private LAN candidates were refused by the deny list; the Tailscale path stayed allowed |
| Stored phone credentials | In-page probe: `expiresInHours: 168` (the 7-day refresh worked); a relay-only gather produced a `relay` candidate |
| Network cut 35 s (Wi-Fi and data off, Chrome backgrounded) | The daemon closed the device peer after its grace period |
| Restore and resume, **before the fix** | The phone's offers produced peers that never connected; the third offer and later were refused with `too many peers for device` |
| Restore, **after the fix** | Abandoned attempts closed with `connect timeout` (no lockout); after the emulator recovered, it reconnected through the relay at 20:56:15 without re-pairing |
| Afterwards (hours) | Every 15 min 33 s: idle close, then reconnect about 3 s later. This led to `shouldScheduleRetry` |

Four attempts timed out just before recovery. During that window `adb` reported the emulator `offline` and the host was heavily loaded, so they are recorded as emulator instability, not an OpenAg fault.

**Not covered**
- A public relay, carrier NAT or a real phone (OA-307 real acceptance).
- iOS Safari and the installed PWA.
- The hidden-tab reconnect deferral live (unit-tested only).

## Cross-network run (OA-307), 12 November 2026

**Setup**
- **Daemon:** a throwaway daemon on this Mac (on the home LAN).
- **Phone:** the Android 15 emulator (`openag-pixel`, Chrome 124) on the Linux test host, which sits on a different network (a separate private subnet behind another router).
- **Tailscale excluded.** Both machines are on Tailscale, so the daemon was bound to its LAN address with `OPENAG_RTC_BIND_IPV4` to keep the Tailscale path out of the candidates.

| Case | Result |
|---|---|
| STUN only (Google STUN, no TURN) | **Failed.** The pairing peer closed with `connect timeout` after 30 s and never connected. The two NATs in the path (home router, plus the test host's router and the emulator's own NAT) are not traversable with STUN alone. |
| Through the lab relay (coturn on the Linux test host, Tailscale address; daemon relay-only) | **Joined** in about 16 s. `lastCandidateType: "relay"`, audit `connected` route `relay`. |
| Expired invite (more than 5 minutes old) | Refused silently with `bad mac`, as designed: no oracle. The next fresh invite joined. |

So, with this pair of networks, direct join needs the TURN relay, which is the case OA-307 is for. In this run the daemon reached the relay over Tailscale, so a public relay with a real carrier phone is still the remaining acceptance.

# Web Push to the installed desk

Built 12 November 2026 for 0.6.0. Push notifications reach the desk itself, so no separate app is needed. They are end-to-end encrypted, and each subscription belongs to a paired device. ntfy ([ntfy.md](ntfy.md)) stays available for plain-HTTP LAN setups and self-hosted ntfy. The same message goes to whichever transports are on.

## How it works

- **Messages and gates.** `push.ts` builds each message once, with the same fixed templates, redaction, 200-character clip, dedupe and hourly cap, and sends it to ntfy if enabled and to Web Push if enabled. The cap counts the message once.
  - The payload is `{title, body, url}`. `url` is a desk route: `#/approvals/<id>` for an approval, `#/room/<id>` for a provider request, `#/` otherwise.
  - Urgency is `high` for approvals and provider requests. A `Topic` header (a hash of the dedupe key) lets a repeated message replace the earlier one at the push service.
- **Crypto (`webpush.ts`).** It uses `node:crypto` only, with no dependency.
  - RFC 8291 `aes128gcm` encryption: an ephemeral P-256 ECDH key, HKDF, AES-128-GCM, one record, padding delimiter `0x02`. It matches the RFC 8291 §5 example byte for byte (`webpush.test.ts`).
  - RFC 8292 VAPID: an ES256 JWT `{aud: push service origin, exp: +12 h, sub: contact}`.
- **Keys.** The VAPID key pair is created on first use and stored in `connector-webpush.enc`, under the existing connector key. The private key is never in the DB, settings or any response, and is registered with the redactor. `POST /push/web/rotate-key` (owner/Full) replaces it and deletes every subscription, because they were made for the old public key. A device that had opted in gets a new subscription for the new key the next time its Notifications panel opens.
- **Subscriptions (`web-push-subscriptions.ts`, table `web_push_subscriptions`, migration 039).**
  - One row per browser endpoint, owned by the calling device. The owner token has no device, so it gets 409. There are at most 3 per device; the oldest is dropped.
  - Endpoints must be `https:` on a browser push service: `fcm.googleapis.com`, `push.services.mozilla.com`, `push.apple.com` or `notify.windows.com`. Anything else is refused.
  - Delivery goes through the guarded fetch (`mcp/ssrf-fetch.ts`): no redirects, connections pinned to the checked address, a 10 s timeout.
  - Endpoints are registered with the redactor. Listings show only the push service host.
  - A `404` or `410` deletes the row. Other failures record `HTTP <status>` or the error name only.
  - **Revoking a device deletes its rows** (`auth.onRevoke` in `main.ts`), across the whole revoke tree.
- **Routes.**
  - `GET /push/web`: enabled, contact set, public key, the caller's subscriptions, and everyone's for owner/Full.
  - `POST /push/web/subscriptions`, `DELETE /push/web/subscriptions/current`, `POST /push/web/test` (this device only).
  - `POST /push/web/rotate-key` (owner/Full).
- **Settings.** `push.webPush = { enabled, subject }`. The contact (`mailto:` or `https:`) is required before enabling, because push services, Apple in particular, reject a missing `sub`. Changing `webPush` is owner/Full only, and a save that leaves `webPush` out keeps it, since `PUT` replaces the whole value. `GET /push/status` adds `webPush: {enabled, ready, subscriptions}`. `notify_user` is offered when either transport is ready.
- **Desk.**
  - `sw.js` shows the notification. A click focuses the desk and navigates to the url, which is only ever a same-origin route.
  - Settings → Proactive → Notifications → "Notifications on this device" handles turn on/off and Send test. Owner/Full also see the installation switch, the contact and the subscribed devices.
  - The browser's current subscription is re-registered whenever the panel opens. One made for an older key is first replaced with one for the current key. The service worker holds no device token, so it does not handle `pushsubscriptionchange` itself.

## Requirements and limits

- **A secure origin.** The desk must be opened over HTTPS (for example Tailscale Serve) or on `localhost`. A plain-HTTP LAN address cannot use Web Push; use ntfy there.
- **iOS and iPadOS 16.4+.** Only the desk added to the Home Screen and opened from there can receive pushes.
- **Message contents.** Push services see only ciphertext, plus metadata: timing, size and urgency. Message texts stay as minimal as ntfy's, without payloads or paths.
- **Verified:** controlled tests (`webpush.test.ts`, `web-push.test.ts`, `WebPushSection.test.tsx`) and the real FCM delivery below.

## Real delivery run, 12 November 2026

**Setup**
- **Daemon:** a throwaway daemon built from `claude/web-push`, behind a temporary Tailscale Serve HTTPS route on port 8443. The route was removed afterwards and Serve was left with no config.
- **Phone:** the Android 15 emulator (`openag-pixel`, Chrome 124, Google Play services) on the Linux test host, opening the desk at that HTTPS origin. The tailnet name was mapped to the Mac's Tailscale IP with Chrome's `--host-resolver-rules`, because MagicDNS is not in the test host's resolver.

| Step | Result |
|---|---|
| Desk over HTTPS | Loaded; the service worker registered (scope `/`) |
| Pair with a code | A Limited device ("Android browser") |
| Owner: Web Push on, contact `mailto:` set | `GET /push/web`: enabled, contact set, 87-character public key |
| Turn on for this device | Chrome's own prompt ("… wants to send you notifications"), then Allow. Permission `granted`; subscription on `fcm.googleapis.com`; the daemon lists it for "Android browser" |
| Send test | Delivered through FCM. The service worker showed **OpenAg / "Test notification from OpenAg"** with link `#/settings/proactive/notifications`; it appeared in the Android notification shade with the OpenAg icon. The daemon recorded `last_ok_at` and no error |
| Owner revokes the device | `204`; subscriptions 1 → 0 (API and table) |

**Notes**
- Android Chrome ignored DevTools `Browser.grantPermissions`; the real prompt had to be accepted.
- The emulator's software GPU raised a "System UI isn't responding" dialog once, which was dismissed with Wait.

**Not covered:** Mozilla and Apple push services, iOS (needs a real iPhone with the Home Screen app), a click-through from the shade (the service worker click handler is not tested), and a real approval trigger. Approval fan-out and links are covered by `web-push.test.ts`.

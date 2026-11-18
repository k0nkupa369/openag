# Conversation history loading (OA-488)

Direct chats and rooms use the same transcript reader. This is desk presentation, not model context selection or history deletion.

## Reads and current state

`GET /rooms/:id/transcript` opens at the recent end. A page targets 50 non-internal message/bot-output events and stops at 500 total ledger events, whichever comes first. A busy technical tail can therefore show fewer than 50 messages. No older data is discarded: `before` is an exclusive event-ID cursor for earlier pages. Empty pages return no earlier cursor. The desk uses the explicit **Load earlier messages** control rather than automatically walking all history.

`after` reads ascending pages of up to 500 events. `hasMore` and the returned `after` distinguish a partially synchronized interval from a complete snapshot. Live events never advance the fetched cursor past a gap. Fetched catch-up pages publish together after the gap completes; a reconnect queued behind a failed request still starts its synchronization. All pages return chronological events and a current-state snapshot with its own event boundary. The snapshot and page are read together in a SQLite transaction. Current running turns and active Work come from daemon records, not a partial replay of the visible window; open questions and approvals keep their existing dedicated reads. Only public event projections cross the gateway. The existing `/events?after=` endpoint remains compatible for the Ledger screen.

## Reading and session cache

Initial history finishes loading before the real scroller mounts. It lands at latest once. Transcript rows use measured heights instead of estimated offscreen heights. shadcn MessageScroller owns following, jumps and prepend preservation. The load-earlier control sits outside the measured content so it cannot mask a prepended first row. Every direct content child is a MessageScrollerItem; activity runs retain their assigned row identity in the session view so extending either end or revisiting does not replace the anchor.

Leaving a chat saves a message ID and viewport offset, or the intent to follow latest. Returning restores a retained window immediately and synchronizes only newer events. The temporary cache holds at most five inactive conversations and 10 MiB of estimated JSON text storage (UTF-16 size); the active conversation is separate. This is not a database copy or a bound on total browser heap. Oversized entries are not cached; least recently used entries are evicted first. Cache lookup is side-effect free during render, including React development StrictMode. Eviction or refresh opens at latest. There is no browser-persistent chat cache. A changed authenticated API replaces the cache; signing out/revocation unmounts it. Late responses cannot populate a disposed reader. Cache contents are never written to logs or shared product knowledge.

Loaded earlier pages remain available while the conversation is open. True virtualization and persistence across refresh are deferred. Loading many earlier pages can still grow render and memory cost.

## Verification

`node scripts/verify-transcript.mjs` checks the public gateway against a disposable synthetic installation. `--browser` additionally drives real Chromium; set `OPENAG_PLAYWRIGHT_MODULE` to an installed Playwright module when it is not normally resolvable. `--screenshots` saves synthetic desktop/phone evidence under `docs/notes/evidence/oa488/`. No live installation, provider, or retained owner history is used. The ticket and component audit record results and limits.

## Local acceptance — 5 November 2026

Public HTTP and real Chromium checks passed for direct and room chats. In the synthetic delayed-network fixture, cold opens reached usable latest content in approximately 0.2–0.8 seconds; this is not a production latency target. Cached reading restoration measured 0px displacement for both types. Browser coverage includes delayed preceding content, prepend/activity anchoring, follow-latest, a 520-event reconnect gap, queued reconnect recovery after a failed request, rapid room switches, five-entry/oversized eviction, refresh and sign-out/re-pair isolation. Existing render integration also verifies unique IDs after backfill splits an activity run and preserves waiting moods while the underlying turn remains running.

Packaged help delivery passed through controlled API, Ollama, ACP/MCP, cached ACP and replacement-default paths. These are integration fixtures, not real-provider acceptance or an update to the installed service. The topic remains within the existing 12 KiB handbook limit. No unit/Jest/Vitest runner was invoked; no live history or configuration was changed.

Standards and Spec reviews finished with no open substantive findings. Built-in `codex review --uncommitted` identified three edge cases (split activity identities, queued synchronization after failure, and waiting moods); all were fixed and its focused uncommitted follow-up reported no substantive related regression. The verification scripts protect those behaviors. `pnpm -r build`, chat-display/render integration, the real-browser transcript check, all four bot-knowledge groups and whitespace checks passed. The relay build is a dry run, not a deployment.

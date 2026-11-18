# Chat unread and notification research

## Scope

The owner wants normal agent replies to remain visible after reopening OpenAg and to notify through ntfy only while no visible chat has caught up. Read state is shared across devices.

This is the initial research and proposed design. The current source behavior and verification limits are recorded in [the conversation domain note](chat-notifications-domain.md); installed behavior depends on deployment.

## Evidence at the time of research

- The daemon writes agent output as `bot_output`, potentially in several chunks; a turn later emits `turn_finished`. The transcript pages ledger events, while the desk filters some internal messages. The separate model-history projection has different eligibility rules and must not be treated as the display contract. See `apps/daemon/src/runtimes/runner.ts`, `apps/daemon/src/ledger.ts`, `apps/daemon/src/transcript.ts` and `apps/desk/src/components/Feed.tsx`.
- `request_input` publishes a normal bot `message` with a `questionId`, then ends the turn awaiting input. It has no ordinary completion reply to notify. See `apps/daemon/src/questions.ts` and `apps/daemon/src/runtimes/runner.ts`.
- The shared pusher currently listens only for `approval_requested` and open `mcp_interaction_updated` events. It sends minimal redacted text through the configured ntfy topic and applies one shared hourly limit. See `apps/daemon/src/push.ts`.
- The desk has one authenticated event stream and already loads rooms, transcripts and live event updates, but it has no read cursor or browser-visibility state. See `apps/desk/src/stream.tsx`, `apps/desk/src/hooks.ts` and `apps/desk/src/conversation-history.tsx`.

## External evidence

- The browser Page Visibility API identifies a tab that is hidden because the user switched tab/app or minimized the browser. `visibilitychange` is the reliable lifecycle event; `unload` and `beforeunload` are not reliable on mobile. [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [MDN: `sendBeacon`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon).
- A polite status update should use `role="status"` and include enough context for assistive technology, rather than announcing an unexplained number. [W3C ARIA22](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22).
- ntfy accepts a title, priority and click URL. Its default server cache retains published messages for twelve hours, and its public service has message and request limits. The existing generic, redacted notification body is therefore appropriate. [ntfy publishing](https://docs.ntfy.sh/publish/).

## Initial recommendation

Persist one shared cursor per room:

```text
room_read_state(room_id primary key, event_id, updated_at)
```

An eligible reply is unread when its event ID is higher than the cursor. Define eligibility against what the user can actually see: include interactive agent replies, published questions and guest replies; exclude private rooms, internal consultations, technical activity and the user's own messages. Proactive and scheduled messages that appear in a public conversation need explicit handling: retain their existing wake and notification rules and avoid duplicate alerts. Do not equate `noIndex`, delegation or the model-history filter with invisibility; trace each path before choosing its behavior.

The desk acknowledges the latest eligible event only when that room is active, its document is visible, and the transcript is at the latest position. It re-evaluates on a live event, route change, jump-to-latest, scroll position and `visibilitychange`. Opening a room or loading old messages does not mark it read. This prevents an active-but-scrolled-up chat from silently clearing an unread reply.

Expose unread state with the room read API. Render an `attention` Badge on room rows and direct-agent rows, indicate unread activity on the mobile navigation trigger, and show a new-messages boundary in the transcript. Prefer a simple unread marker to a misleading count when one reply has multiple output chunks. Use one concise `role="status" aria-atomic="true"` announcement for changes. The shared cursor means reading a room on an authorized device clears its badge everywhere, as requested. Define which device access levels may update this shared state and validate cursor room and boundary server-side.

For ordinary final replies, defer the ntfy decision briefly after the final visible event. If a visible desk catches up and posts the cursor in that interval, send nothing. If it remains unread, send one generic notification such as “New reply from Atlas. Open OpenAg to read it.” The existing configured desk URL remains the click target; do not add route-specific public URLs in this slice.

Published `request_input` questions need the same deferred unread check, keyed by question ID, because they do not have a final normal reply. They should say that an agent needs a response. The existing immediate approval and provider-input notifications remain unchanged.

## Rate-cap and delivery rules

`maxPerHour` is one flat counter for approvals, provider input, wake pings and explicit bot notifications. The approved implementation reserves `ceil(maxPerHour / 4)` slots for existing notifications: ordinary chat and question alerts may send only while usage is below `maxPerHour - reserve`. Approvals and provider-input notifications retain the existing full pool. At very low limits, chat alerts may be suppressed; the persisted unread badge is then the source of truth.

Keep the current live-only, best-effort policy: no push replay on restart, no claim that ntfy delivered to a device, and no reply text in the notification. A restart inside the short defer window can lose that alert, but the unread state remains and replaying old chat would be more disruptive. On upgrade, establish a baseline at the current visible history boundary so old conversations do not all become unread; messages arriving during the upgrade or baseline must not be skipped. Confirm that the configured desk URL is reachable from the receiving device before promising click-through.

## Why this is preferable to presence tracking

An open WebSocket or a visible app shell does not mean the user has read a chat. A presence-only design incorrectly suppresses alerts when a person is on another page or scrolled above the new reply. A durable cursor, updated only after the visible transcript catches up, captures the actual user outcome and also gives the requested return-to-app UI.

## Implementation reach

The change will touch a database migration; room/read gateway routes and types; the pusher and its ledger subscription; room-list unread projection; desk read acknowledgements and sidebar badges; a narrow standalone verification script; `docs/help/conversations.md` and notification help; the bot-knowledge manifest/delivery check; and the component consistency audit. It does not need a new provider, browser-notification permission, or a new ntfy topic.

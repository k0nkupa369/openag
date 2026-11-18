# Chat history loading and scroll stability: OSS research

Research date: 5 November 2026. This is a source review, not runtime acceptance of the upstream applications. Sources below are pinned to the exact commits returned by their public GitHub trees during this review. Development branches can contain unreleased behavior.

## Finding

Treat three problems separately: fetching too much history, rendering too much history, and moving the reader when content changes. A cache improves repeat visits but does not itself preserve the viewport. Loading a recent window reduces first-load work but also needs scroll anchoring when older content is prepended. Virtualization limits mounted DOM; it is a further rendering measure, not a substitute for correct pagination and scroll behavior.

These are conclusions from the source patterns below, not a claim that one of these mechanisms caused the recorded OpenAg jump.

## Comparable implementations

| Project and reviewed snapshot | Source behavior | Useful pattern for OpenAg |
| --- | --- | --- |
| LobeChat, `658cdedf1e5e35eba161d3c54cd95461c28a4a54` | Loads older history before a newest-first server window. Older loads are guarded against duplicate requests, exhausted history, and missing server-backed rows. An upward user gesture near the top triggers the load. Its `virtua` list detects a prepend and sets `shift` for that render. | Fetch recent history first; load older history on demand; preserve the same visible message when prepending. |
| LibreChat, `f4154b649efa37e1345ccc517a4d8d1ed2178c82` | Initial bottom landing waits until rendered rows belong to the selected conversation, then runs once per conversation. Stream/cache identity changes do not retrigger landing. A separate retention hook bounds inactive conversation caches and preserves active jobs. | Make first landing an explicit state transition, separate from later message updates. Bound any cache instead of retaining every visited chat. |
| Element Web, `a3f5be54f4bf77eee950e38aedb3251bf059dc38` (`develop`) | `ScrollPanel` distinguishes following the bottom from reading at a fixed message. Fixed position stores a message token plus a relative pixel offset, rather than absolute `scrollTop`. It exposes fill callbacks near the start/end of the list. | Preserve a message identity and its viewport offset while reading; follow new content only when already following the bottom. |

### LobeChat: recent window, prepend anchoring, optional restoration

`loadEarlierMessages` documents and implements paging older than the newest-first window, with an in-flight guard and a real cursor. It explicitly avoids reconstructing a cursor from millisecond timestamps because equal timestamps can skip rows. The same file supports hydrating persisted transcript data before a route commits, while preserving newer in-memory/streamed rows. [Transcript actions, lines 81–123 and 150–165](https://github.com/lobehub/lobe-chat/blob/658cdedf1e5e35eba161d3c54cd95461c28a4a54/src/store/chat/slices/message/actions/transcript.ts#L81-L165).

The earlier-history trigger listens for upward intent near the top, including when a short page cannot scroll. This avoids treating a programmatic mount/restore as a request for more history. [Earlier-history trigger](https://github.com/lobehub/lobe-chat/blob/658cdedf1e5e35eba161d3c54cd95461c28a4a54/src/features/Conversation/ChatList/hooks/useEarlierHistoryTrigger.ts).

The virtual list preserves the old first message on prepend with `shift`, keeps a permanent leading slot so a loading indicator does not remount all rows, and disables native overflow anchoring while the virtualizer manages position. This is evidence for using one scroll-position owner, not a recommendation to disable native anchoring globally. [Virtualized list](https://github.com/lobehub/lobe-chat/blob/658cdedf1e5e35eba161d3c54cd95461c28a4a54/src/features/Conversation/ChatList/components/VirtualizedList.tsx#L452-L523).

Restoration stores a message anchor and relative offset. Its code also has bounded settling because estimated virtual row heights change when actual rows mount. Virtualization therefore brings its own measurement complexity. [Topic scroll persistence](https://github.com/lobehub/lobe-chat/blob/658cdedf1e5e35eba161d3c54cd95461c28a4a54/src/features/Conversation/ChatList/hooks/useTopicScrollPersist.ts).

### LibreChat: one initial landing and bounded cache

The initial landing effect checks the selected conversation against the rendered tree and records a landed conversation ID. Its comments explain the race: the ID can change before the new rows mount; scrolling at that point affects the outgoing thread. Re-running for every stream delta or cache reconciliation would pull readers back down. [Message scrolling, lines 419–469](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/hooks/Messages/useMessageScrolling.ts#L419-L469).

The hook also observes content resize and distinguishes user interaction from follow-bottom behavior. Copying only its initial scroll call would omit that distinction. [Resize reconciliation, lines 250–315](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/hooks/Messages/useMessageScrolling.ts#L250-L315).

Inactive cached histories have configurable time, count, and byte limits; the routed chat and running jobs are pinned. This is cache management evidence, not proof of server-side message pagination. [Message retention](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/hooks/Messages/useMessagesRetention.ts). The query code protects newer cached/streamed messages from an older response completing later. [Message queries](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/data-provider/Messages/queries.ts#L190-L274).

### Element: stable reader position

The scroll panel defines two states: following the bottom, or tracking a fully visible message token and relative offset. Its documented reason for avoiding absolute position is that width, zoom, and loaded history can change. [ScrollPanel contract, lines 99–136](https://github.com/element-hq/element-web/blob/a3f5be54f4bf77eee950e38aedb3251bf059dc38/apps/web/src/components/structures/ScrollPanel.tsx#L99-L136).

## Design implications to validate locally

1. On first open, request a bounded recent window and position it before displaying the finished transcript. Use deterministic cursors with a tie-breaker, not timestamps alone.
2. Treat “following latest” and “reading earlier” as separate states. Content resizing should maintain the active state. Avoid smooth scrolling for initial positioning.
3. When adding older history, preserve a stable message ID and its viewport offset. Do not restore only an absolute scroll offset.
4. For revisits, a small in-memory cache plus saved reading anchor is a reasonable first step. Reconcile live events and late fetches by stable IDs; clear private cached content when the authenticated session ends.
5. Consider true virtualization only after measuring remaining DOM/render costs. It must support variable-height Markdown, tool details, media, selection, search/deep links, and prepend anchoring.

## OpenAg evidence

The supplied 5.96-second recording shows navigation from a direct chat to Devices and back. In frames sampled between approximately 2.86 and 3.15 seconds, the same recent messages move upward before settling. It shows a visible positioning adjustment, but provides no network trace, event count, or layout measurements. The owner also reports the same issue in room chats. No private message text or video frames are copied into this shared note.

The current checkout has these relevant behaviors:

- `apps/desk/src/App.tsx` mounts `RoomView` for both direct chats and rooms, and unmounts it on navigation to Settings. `RoomView.tsx` uses the same `useLedger` and `Feed` in both cases.
- `apps/desk/src/hooks.ts`, `useLedger`: clears the event array, starts its cursor at zero, requests successive 500-event pages, and merges each page into React state immediately. There is no revisit cache in this hook. Live events merge separately; the history cursor deliberately advances only from fetched pages to avoid missing gaps.
- `apps/daemon/src/gateway.ts`, `GET /rooms/:id/events`: exposes an `after` cursor. `apps/daemon/src/ledger.ts` lists matching events in ascending ID order with a default limit of 500. Thus opening a long conversation walks forward from its oldest events to reach its latest events. These are ledger events, including technical activity, not 500 user-visible messages.
- `apps/desk/src/components/Feed.tsx` uses `MessageScrollerProvider autoScroll` and maps the complete loaded event collection to rows. `ui/message-scroller.tsx` applies `content-visibility:auto` with a 10rem estimated intrinsic row size. This skips some offscreen rendering; it does not bound fetched data or mounted row count. Estimated heights and asynchronous card content are additional candidates to measure, not established causes.
- `RoomRail.tsx` derives running agents from turn-start/finish history; `avatar-activity.ts` derives moods from Work events. Simply truncating the array can omit state needed by these consumers. Keep current execution state authoritative independently of the visible history window.

The full-history reload is confirmed from source. Its contribution to this particular small jump remains unproved. A browser reproduction with request timing and visible-message offsets is needed before selecting the exact scroll fix. This investigation did not run that reproduction.

## Recommended OpenAg change

Implement one shared behavior for direct and room chats:

1. **Cold open:** fetch a bounded recent transcript window, using monotonic event IDs as cursors. Start with a target such as 50 visible messages plus a bounded amount of related activity, and tune it with measurements. An arbitrary 50 ledger events can contain no messages during a busy turn. Return explicit older-page availability and a forward synchronization boundary. Keep the existing forward event API behavior compatible for the separate Ledger screen.
2. **Initial positioning:** show a loading placeholder until that window can land at the latest message once, without a visible smooth-scroll traversal. Do not treat every history page or late fetch as newly appended live output. Check placeholders and asynchronous cards so the initial position is not consumed before real messages mount.
3. **Earlier history:** load only on upward reading intent or an explicit load-earlier action. Prepend with stable row IDs and preserve the visible message and its offset. Grouped activity rows must also keep a stable anchor when a page boundary extends a group.
4. **Revisit:** keep a bounded, session-scoped in-memory view cache and reading anchor. Restore it immediately, then fetch only missing newer events. If the owner left at the bottom, continue following latest; if they left reading earlier, restore that message. Clear the cache on sign-out, revocation, or server/session change. This remains a transient view cache; the daemon keeps the only authoritative database.
5. **Synchronization:** retain the existing gap-safe cursor principle. Deduplicate overlapping fetch/stream events by ID, reject responses for an old room/session, and handle reconnects without replaying a complete transcript. Reconcile active turns, approvals, questions, and Work independently so history paging cannot hide current state.

Reuse the installed shadcn composition before adding a scrolling package. The current official [Message Scroller documentation](https://ui.shadcn.com/docs/components/base/message-scroller) describes initial-position hiding, stable message IDs, and default prepend preservation. Verify those contracts against the locked installed version during implementation. The local viewport already includes `data-pending-scroll:invisible`; adding that class again is not a fix. Do not use the documentation's server-rendered inline-script workaround: OpenAg loads messages on the client.

Defer true virtualization until the bounded-window version is profiled. Add it only if many loaded pages still cause slow rendering, with one component owning scroll positioning and variable-height measurement.

### Implementation reach and acceptance

The change would reach daemon event queries/routes, desk API types, `useLedger`, `RoomView`, `Feed`, and the shared scroller composition where needed. Audit the separate `LedgerView` caller and history-derived running/mood state. Update affected fixtures and the conversation help/bot knowledge delivery in the same implementation slice. This research changes no product behavior, so no help or bot knowledge update is needed yet.

Use a browser scenario with a long synthetic history and delayed pages. Verify both direct chats and rooms: cold open requests recent history first; leaving for Settings and returning restores position; older-page loads keep the same visible message offset; new output does not drag a reader away; following latest still works; reconnects and rapid room switches do not lose or mix events; cache clears with session changes; activity grouping and delayed Markdown/media/cards do not move the reading anchor. Include narrow-screen coverage and the required component audit. Record request count, time to usable latest messages, mounted rows, and visible-anchor displacement. Do not run unit tests or Jest under the owner's standing rule.

## Verification and limits

Reviewed the pinned upstream source files above, public GitHub tree metadata, official shadcn documentation, the supplied recording's sampled frames, and the local source paths listed above. No upstream application or live OpenAg browser reproduction was run. No application code, installation state, or retained history was changed. No unit tests or Jest were run. The recording alone does not establish whether loading, row measurement, or an auto-scroll rule causes OpenAg’s visible jump.

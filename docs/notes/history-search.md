# History search

Release 0.8, spec `docs/specs/release-0.8-memory.md` ("History search"). This note covers the index, the `GET /history/search` route, the `history_search` agent tool and the desk search command.

## Index

- Migration `045_history_search.sql` creates `history_fts`, an SQLite FTS5 table (`unicode61`, diacritics folded) keyed by event id, with an unindexed `room_id` column.
- Indexed: `message` and `bot_output` events whose payload `text` is a non-empty string, in rooms whose id does not start with `_`, excluding payloads marked `internalConsultation` or `runtimeDiagnostic` (runner notices such as "Incomplete: ..."). Tool results, approvals, turn state and every hidden `_` room are never indexed.
- The ledger redacts payloads on append, so the index holds only redacted text. A secret cannot be found by its raw value.
- An `AFTER INSERT` trigger on `events` adds rows; an `AFTER DELETE` trigger removes them, so deleted history stops matching. The ledger stays append-only.
- The migration backfills existing events in one pass, so existing installations need no manual reindex.
- No embeddings, sqlite-vec or Ollama are involved.

## Query

`parseHistoryQuery` (`history.ts`) turns input into a safe FTS5 query. Input is cut to 300 characters and split on whitespace. Each chunk loses `"` and `*` characters and becomes a quoted phrase, so FTS5 operators (`OR`, `NOT`, `NEAR`, `:`, `^`, `-`, parentheses) are literal text. A chunk that ended in `*` keeps a prefix match. Chunks with no letter or digit are dropped, at most 8 phrases are kept, and all must match. Input with nothing searchable returns no results.

Ranking is BM25 with a boost of up to 30% for messages from the last 90 days (linear decay), then newest event id. Snippets are about 24 tokens, capped at 400 characters.

## HTTP: `GET /history/search`

Authenticated (owner, Full or Limited device). `history` is in `API_SEGMENTS`. Query parameters, all optional, unknown ones refused with 400:

| Parameter | Meaning |
| --- | --- |
| `q` | Search text, at most 300 characters. Empty or unsearchable gives `{ "results": [] }`. |
| `room` | One conversation id. Unknown or hidden (`_`) rooms give 404. |
| `before` | Positive event id; only events with a smaller id match. |
| `limit` | 1 to 50, default 20. |

Visibility follows `GET /rooms`: every conversation except hidden `_` rooms, for every device. Search grants no access beyond that list.

Response `200`:

```json
{
  "results": [
    {
      "eventId": 1234,
      "roomId": "ops",
      "roomTitle": "Operations",
      "actor": "coder",
      "ts": 1764000000000,
      "snippet": "Noted: mirror to the NAS weekly.",
      "highlights": [[7, 13]]
    }
  ]
}
```

`actor` is `user` for the owner's messages and the agent id for replies. `ts` is epoch milliseconds. `highlights` are `[start, end)` UTF-16 offsets of matched words in `snippet`. `snippet` is plain text; render it as text, not HTML. Errors: `400 {"error":"invalid search"}`, `404 {"error":"room not found"}`, `401` without a token.

To open the conversation at a result, use the existing transcript cursors around `eventId` (`GET /rooms/:id/transcript?before=<eventId+1>` and `after=<eventId>`).

## Agent tool: `history_search`

- Wired once in `tools/firstparty.ts`, listed in `MCP_TOOL_NAMES` (offered to ACP bots over `/mcp`), class `search` in `policy.ts`, permission `allow`, `offlineSafe`, read effect scope. Not a direct API tool; API bots find it through tool search.
- Input: `query` (1 to 300 characters), optional `conversation` (one room id), optional `limit` (1 to 10, default 8).
- Scope: the rooms the calling agent is a member of, read from `room_members` at call time, minus hidden `_` rooms. A `conversation` the agent is not a member of returns no results.
- Output: `{ untrusted: true, notice, results: [{ eventId, conversation: { id, title }, speaker, time (ISO 8601), snippet }] }`.
- Availability: an auto-allowed read in every permission preset, including Read Only. Unattended turns may use it. Offline (`noNetwork`) turns may use it too: `turnToolRestriction` now refuses a `search`-class tool offline only when it is not `offlineSafe`. Isolated turns (reflection, hook runs without tools) still get no tools.

## Desk search command

- The existing desk search command (Cmd+K or Ctrl+K, and **Search** in the sidebar so phones can reach it) gains a **Messages** group. Typed text is sent to `GET /history/search` after a 180 ms pause; the previous request is aborted. Rooms, agents and pages still match locally and sort above messages. Message results keep the server's order (cmdk does not filter or re-rank them).
- Each result shows the conversation title, speaker (`You`, the agent's name, or its id), date and the snippet as text, with `highlights` ranges wrapped in `<mark>`. An empty result says "No messages match."; an error shows the error text.
- Selecting a result opens `#/room/<id>/message/<eventId>`. The transcript reader (`useLedger`) skips the session cache, reads the page ending at the event (`before=<eventId+1>`), then every later event (`after=<eventId>`, followed while `hasMore`), so the window stays contiguous for live updates. The reader lands with the message near the top and marks it briefly. **Load earlier messages** continues from the first page's cursor.
- Cost: opening an old message in a busy conversation reads every later event in 500-event pages before showing it. A gap-aware window with a "load newer" control is not built.
- Over WebRTC, `history` is not in the device path allow-list (`rtc.ts` `DEVICE_PATHS`), so the search request is refused there.

## Verification

- `apps/daemon/src/gateway.history.test.ts`: HTTP results and highlights, hidden rooms, room filter and Limited device visibility, non-message events, FTS5 syntax as literal input, empty and invalid queries, `before`/`limit`, redacted secrets, deletion, backfill of pre-upgrade events.
- `apps/daemon/src/tools/history.test.ts`: through the real runner and gate: own-conversation results, another agent's direct chat and hidden rooms excluded, membership read at call time, auto-allowed in unattended, offline and Read Only turns, MCP listing.
- `apps/desk/src/components/HistorySearch.test.tsx` (search command: labelled, highlighted results, empty state, opening at the message), `apps/desk/src/conversation-history.test.tsx` (anchored transcript reads and landing position), `apps/desk/src/route.test.ts` (message route).
- Live journey, 26 November 2026 (`node scripts/verify-history-search-acp.mjs`): real Claude Code (`claude-agent-acp` 0.97.0) and Codex (`codex-acp` 2.3.0, model `gpt-6.1-sol`) each called `history_search` over `/mcp` twice in one session (same bot and conversation), auto-allowed with no approval, and replied with the code from a member conversation. A conversation the bot is not in held a decoy code for the same words, and the decoy did not appear in either reply. Temporary data only. It covers one search per call and the answer reaching the reply. It does not cover the desk or unattended turns.
- The script keeps `USER` in the stripped environment, because the CLIs read their login from the macOS Keychain. It takes the Codex model as an optional argument, because the account's default Codex model may not be available to a ChatGPT login.

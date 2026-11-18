# Agent handles

Each agent has two identifiers. They are deliberately separate.

- **Agent id** (`bots.id`) is the immutable key. Rooms, members, the lead, ledger actors, turns, receipts, approvals, `OPENAG_<ID>_MODEL` overrides and stored references use it. It never changes after creation.
- **Handle** (`bots.handle`) is the lowercase `@` address. It is unique across all agents and editable by the owner or an authorized interactive Full-access agent. Mentions, direct-chat targets, room delegation lines, the agent roster, delegation results, agent requests and the desk display use it. Creation starts with the handle equal to the id.

## Rules

- Format: 1–48 characters from `a–z`, `0–9`, `-` and `_`, starting with a letter or digit. Input is trimmed and lowercased.
- Reserved, so bot messages cannot be confused with other actors: `everyone`, `user`, `slack`, `owner`, `primary`, `daemon`, `scheduler`, `system`, `poll`, `constructor`, `prototype`.
- A handle is free only when no agent holds it now and no agent has retired it. A taken or reserved handle is refused (409).
- **Retired handles stay reserved.** When an agent changes handle, its previous handle is reserved to that agent (`agent_handle_reservations`). No other agent can take it. It still addresses the same agent in mentions, so existing text keeps routing. An agent can take back its own retired handle.
- Changing a handle does not change the id, conversation history, memory, skills, permissions, room membership, lead, default-bot setting, or the automatic avatar (which is derived from the id).
- Messages already stored keep their original text and actor id. Their text is not rewritten.

## API (owner only)

`PUT /bots/:id/handle` with body `{ "handle": "builder" }` (no other fields):

| Status | Meaning |
| --- | --- |
| 200 | `{ bot, changed }`. Unchanged when the handle is already current. |
| 400 | Invalid handle, or extra fields. |
| 403 | Owner token required. |
| 404 | Unknown agent. |
| 409 | Reserved, or held by another agent. |

`GET /bots` and `POST /bots` responses carry the current `handle` alongside `id`. Each change writes a `_system` `config` event `bot_handle_changed` with the old and new handle. Daemon room-level and direct-chat mentions resolve handles through the shared index (`handles.ts`, `addressing.ts`). The composer inserts current handles while room creation/settings store permanent IDs. Room delegation (`@handle` lines) resolves current and retired handles to member ids (`delegation.ts`); a raw id is not an address there. Agents see members as `@handle` in the roster. Consultations (`agent_consult`) accept a current or retired handle, with or without the leading `@`; a raw id is still accepted there for compatibility.

## Desk

Owner-scoped bot settings show a **Handle** field with **Change handle**. The bot header, composer, room sheets and the sidebar show the current handle. The avatar and the avatar's colour still derive from the id.

## Limits

- Retired handles keep routing indefinitely. Removing that alias would need an explicit owner decision.
- Historical text is not rewritten, so an old `@handle` in a past message still shows what was typed.
- The model-based room router still matches its picks to member ids internally; agents and the roster never show ids.
- Verified by `scripts/verify-agent-handles.mjs` and `scripts/verify-agent-delegation.mjs` (real runner and parser with a fake runtime; no adapter, model or network) and the daemon typecheck. Real adapter turns after a rename were not run. Current rendered and mounted integration coverage is recorded in the OA-492 component audit and evidence below.

OA-492 integration: migration 040 follows main’s existing proactive migration 039. Identifiers recognised by the redactor are refused. Saving a handle refreshes shared room and agent lists through bot_handle_changed. The composer model controls use the current handle; a typed retired/unknown address that is not resolved by the local picker never falls back to another agent’s controls. Daemon routing still resolves retired aliases. See the OA-492 evidence and component audit for current acceptance.

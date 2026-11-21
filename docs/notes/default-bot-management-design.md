# Default bot management tools — design (OA-347)

Draft, 11 November 2026. **Slice 1 (automations) is implemented** on branch `claude/oa-347-automation-proposals`: `propose_automation` (`apps/daemon/src/tools/management.ts`), `apps/daemon/src/management-proposals.ts`, the runner gate, the owner-only decision guard and the desk card. The other actions in the v1 table are still design only. Current status stays in [ROADMAP.md](../../ROADMAP.md).

Slice 1 implementation notes: the approval row belongs to `daemon` (not the proposing bot) so a pending proposal never makes the default bot busy; the payload carries `proposedBy`. Validation is a dry run of the real create/update inside a rolled-back transaction (`previewAutomationChange`). There is no per-tool `enabled` by bot, so the runner refuses non-default bots at the gate; other bots may still see the tool listed.

## Problem

The default bot can explain OpenAg (`openag_help`, `openag_capabilities`, `openag_status`) but cannot change it. Every configuration change — automations, rooms, bots, settings — happens in the desk through owner or full-device routes. The owner wants to say "check my inbox every weekday at 8" or "turn the heartbeat on" in chat and have it happen, without that becoming a way for a prompt, an email, a webhook payload or a Limited device to change the installation.

[personal-secretary-design.md](personal-secretary-design.md) (slice F) and [docs/specs/personal-secretary.md](../specs/personal-secretary.md) block natural-language responsibility setup on this design.

## Decision

**The bot proposes; the owner applies.** A management tool never changes configuration. It records a *management proposal*: the exact change, rendered for review, posted as a card in the originating conversation. Only an owner or full device deciding that card applies it, through the same service code the desk route already uses.

This is the pattern MCP command review already proves (`mcp-command-review.ts`, `docs/notes/mcp.md`): the request only proposes, the stored payload is what runs, a stale or altered proposal is refused, and only the owner may decide (`gateway.ts:1419`).

### Why not an ordinary gated tool

If `automation_create` were a normal `act-local` tool, the permission session would decide it. In Full access / Never there is no review, so the bot would change configuration with no human seeing it. Explicit review under Never is refused by design ([permission-sessions.md](permission-sessions.md)). Configuration authority belongs to the owner's devices, not to the bot's action permission mode. Proposal tools keep the two separate: permission modes govern what the bot can *do*; management proposals govern what it can *set up*.

## Proposal lifecycle

1. **Propose.** The bot calls a `propose_*` tool through `ctx.callTool`. The tool validates the arguments with the same schema the desk route uses (for automations: 5-field cron, 5-minute minimum, 50 maximum, bot must be a member of a non-`_` room). Invalid proposals are refused immediately with the validator's message, so the bot can correct itself.
2. **Record.** The daemon stores an approval with a new source `management-proposal`, tool name `management_<action>`, the normalized payload, a **base revision** of what it changes (the current row's `updated_at`/revision or settings digest) and a display. The redactor runs on it; a payload that comes back with `[REDACTED` is refused (as command review does), because a proposal that carried a secret is not what was proposed.
3. **Show.** The card renders in the originating conversation: action, exact fields, before → after for edits, and for anything that runs later (automations, responsibilities) the bot, room, prompt, schedule, tool access and delivery destination. The turn continues; it does not wait on the decision.
4. **Decide.** Accept or Ignore. There is no Edit on the card; to change a proposal, the owner asks the bot to revise it, which produces a new proposal. Only `principal.kind === "owner"` (owner token or full device) can decide. Limited devices see the card read-only. Slack, push and WebRTC peers never decide (unchanged).
5. **Apply.** On accept the daemon re-reads the base revision. If it changed, the proposal is refused as stale and nothing is written. Otherwise it calls the existing service (`automations.create`, `settings.put`, …), finishes the receipt (`completed` / `failed` / `not-run`) and appends one `config` event to `_system` (`management_applied` / `management_failed`, ids and action only).
6. **Expire.** 24 hours after it is proposed, max 10 pending per conversation. A permission-mode change does not expire them (they are not action reviews); deleting the target or the room does.

Proposals never replay. A failed apply is reported; the bot may propose again.

## Who may propose

| Turn | Proposal tools |
|---|---|
| Interactive turn, owner message, in a room or a direct chat | Offered |
| Interactive turn in Read Only mode | Offered (proposing changes nothing) |
| Interactive turn, message from a Limited device | Offered, but the card says it needs an owner or full device |
| Slack-originated turn | Offered; decision only in the desk ("waiting in the desk") |
| Unattended (heartbeat, cron automation, reflection) | **Not offered** |
| Hook, watcher, GitHub poll (isolated) | **Not offered** (no tools, unchanged) |
| Any bot other than the default bot | Not offered in v1 |

Proposals work the same in a room (the default bot is a member) and in the default bot's direct chat; the card appears in whichever conversation the request came from. Restricting v1 to the default bot keeps one place to look and matches the ticket. Widening to other bots is a later owner setting, not a code change to the authority rule.

## v1 action set

Chosen for value and reversibility. Each maps onto an existing route and validator.

| Tool | Applies via | Notes |
|---|---|---|
| `propose_automation` (create / edit / enable / disable / delete) | `/automations` service | Cron + room only in v1; `allowApprovals` is shown prominently and defaults off |
| `propose_proactive` | `heartbeat`, `brief`, `reflection` settings | The same three switches `readiness/apply` may flip; schedule and bot |
| `propose_room` (create / add or remove member / set lead) | room creation and membership services | |
| `propose_direct_chat` (open a one-to-one chat with a bot) | `POST /rooms {kind:"direct"}` | Reuses the bot's existing direct chat, as the desk does |
| `propose_delivery_room` | `deliveryRoom` setting | |
| `propose_responsibility` | `/responsibilities` (OA-368) | Created paused, as the desk does; enabling remains a separate owner action |

## Out of scope (never proposable)

Anything that grants access, holds a secret or changes who decides:
- Devices, pairing codes, device access, owner credentials.
- Permission sessions and modes.
- MCP servers, MCP secrets, OAuth sign-ins, Composio, Google/Apple connectors, Apps enable.
- `computer` backend, Slack, WebRTC, push topic, `limits`.
- Webhook / GitHub / Slack trigger automations and GitHub polls (they store secrets or open ingress).
- Bot adapter, model, instructions, memory and skill library assignment.
- The `defaultBot` setting itself.

The proposal tools refuse these by construction (each tool has a fixed target), not by a deny list.

## Boundaries that stay unchanged

- `ctx.callTool` remains the only path for the proposal tool call; the tool is class `read` with a daemon-owned `{approval:"allow"}` requirement and a read effect scope, so it runs in every interactive mode, including Read Only, without its own review.
- Unattended turns stay unable to request anything beyond `auto` reads.
- A proposal grants no action permission. An accepted automation still runs as an unattended turn with its usual limits.
- Content quoted from email, documents or tool results cannot accept a proposal; only a decision from an owner principal does.

## Owner decisions (11 November 2026)

1. Read Only mode still lets the bot propose.
2. Proposals expire 24 hours after they are made.
3. Cards offer Accept and Ignore only; no Edit.
4. Proposal tools work in rooms and in direct (single-agent) chats, and the v1 set includes room and direct-chat actions.

Checked against source: a tool whose daemon-owned requirement is `{approval:'allow'}` maps to `auto` in every preset (`sessionToolMode`, `apps/daemon/src/policy.ts:128-129`); `request_input` already works this way (`apps/daemon/src/tools/input.ts:5`, class `read`, read effect scope). Proposal tools follow that shape. `create_work` (`tools/work.ts:10`) is the opposite precedent: it asks for operation review, so Full access / Never refuses it. Proposals deliberately do not copy it.

## Acceptance (when implemented)

- Controlled: propose → accept → applied through the real gateway and services; stale base revision refused; Limited device decision 403; unattended and hook turns have no proposal tools; redaction-altered payload refused; expiry; out-of-scope targets unreachable.
- Real adapters: one bounded journey through Claude and Codex default bots, including a second proposal in the same session.
- Knowledge: update `docs/help/` (what the bot can set up and what it cannot), bot tool descriptions and `docs/notes/default-bot.md`; run `node scripts/verify-bot-knowledge.mjs`.
- Rendered card check on desktop and phone (currently blocked; see ROADMAP).

## Slice 1 real-adapter acceptance (11 November 2026)

`node scripts/verify-management-proposals-real.mjs --authorized-claude --authorized-codex` ran the real built daemon (commit `911c3df`) on a temporary data directory and port, with the installed Claude Code and Codex subscriptions as the default bot in turn. The live service and its data were not touched. Owner-token decisions only. The automations were synthetic and deleted afterwards.

| Adapter | First turn | Accepted | Second turn, same conversation | ACP sessions |
|---|---|---|---|---|
| Claude Code | called `propose_automation` (create); reply said nothing exists until the card is accepted | `0 8 * * 1-5` created in `chat-claude` | called `propose_automation` (disable); accepted, automation paused | 1 |
| Codex | called `propose_automation` (create); reply said nothing has changed yet | `0 8 * * 1-5` created in `chat-codex` | called `propose_automation` (disable); accepted, automation paused | 1 |

Each proposal was a `daemon`-owned, turnless `management-proposal` approval, and no automation existed before acceptance. The request named the room id explicitly; whether the bots find the conversation without it was not checked. Each turn also logged one unnamed tool call/result pair beside the proposal; that pair was not investigated. Not covered here: the rendered card on desktop/phone (blocked while local browser use is disabled in Work settings), Limited-device decisions through a real device, Slack-originated proposals, and deployment to the live service.

## Slice 1 rendered acceptance (11 November 2026)

This ran in a Cua Space ([procedure](cua-spaces-rendered-checks.md); `local:home-claude-code`, an Ubuntu 24.04 container on the owner's Mac). The `staging` source (`6905dc0`) was copied in with `git archive` and built there, then run as a throwaway daemon with synthetic data: one direct chat with three pending proposals (create, update with changes, delete). Its Chromium signed in through `desk:open`, which gives a single-use Full pairing. A Limited device was paired by code. Screenshots came from the Space's driver. The live service and its data were not involved.

- Desktop width: all three cards show the right heading, Accept/Ignore only and action-specific labels ("Create automation", "Apply change", "Delete automation").
- Phone width (~430 px): the sidebar collapses, the two buttons share the width, and nothing overflows.
- Limited device: the card has no buttons and reads "Needs an owner or full-access device to decide."
- Three defects were found and then fixed on `claude/proposal-card-polish`. After rebuilding, they were checked again in the same Space:
  - "Runs as Bot in Bot" in a direct chat now reads "Bot in its direct chat".
  - The generic "No explicit target supplied" line no longer appears on proposal cards.
  - Changed fields use plain labels ("Schedule", "Prompt") instead of `scheduleCron` and `prompt`.

Not covered: dark mode, a physical phone, and the "next run" line (the seed ran without the scheduler, so it was empty; the real-adapter run showed it populated).

## Shared proposal base (21 November 2026)

The remaining slices reuse one base. `management-proposals.ts` owns everything that is the same for every proposal: the conversation check, input validation, the redaction refusal, the 10-per-conversation cap, the turnless `daemon` approval, the 24-hour expiry (re-armed after a restart), the accept listener, receipts and the `management_applied` / `management_failed` audit events. Each kind (`ProposalKind`) supplies only its `propose_*` tool name and description, the `management_*` approval tool name, an input schema, `prepare` (validate against current state, build the stored payload and its card display; never writes) and `apply` (its own stale check, then the existing service).

- Kinds are listed once in `tools/management.ts` (`PROPOSAL_KINDS`). Their tool names are `PROPOSAL_TOOLS` in `policy.ts`, which the classifier, the MCP allow-list and the runner gate all read; a test fails if the two lists drift or a kind is not offered over MCP as `read`.
- The stored payload carries `proposedBy` and a `sentence` (`verb`, `name`) written by daemon code. The morning brief reads only that sentence, so a new kind needs no brief change. Proposals stored by 0.7.4 have no sentence and show as the generic approval line in a brief until they expire (24 hours).
- Automations are the first kind (`management-automation.ts`), with unchanged behaviour: the existing proposal, gate, gateway and brief tests pass unchanged apart from the call shape.

## Proactive and delivery room proposals (21 November 2026)

`management-settings.ts` adds two kinds:
- `propose_proactive` → `management_proactive`: one feature per proposal (`heartbeat`: enabled, everyMinutes, botId; `brief`: enabled, time, days; `reflection`: enabled, time, botId). Other fields are refused, including the heartbeat prompt and reflection limits, which stay on the settings pages. The merged value is validated with the setting's own schema at proposal time, and a no-op is refused.
- `propose_delivery_room` → `management_delivery_room`: an existing non-`_` conversation, or `null` for the default bot's direct chat.
- Stale check: the whole current value must equal the value when proposed (settings rows have an `updated_at`, but comparing values also covers a change made and undone). Apply re-checks a chosen bot or room still exists, then makes the same validated `setSetting` write and `setting_changed` audit event as `PUT /settings/:key`, with `by: proposal:<id>`. The heartbeat, brief and reflection schedulers read these settings live, so nothing reloads.
- The card shows each changed value before and after, labelled by the daemon (for example "Interval: Every 180 minutes → Every 60 minutes"), so a heartbeat interval change is explicit before you accept it.
- Desk: proposals other than automations share one card. The heading comes from the proposal sentence ("Bot proposes to change the scheduled checks"), and the before → after rows come from the payload. It offers Apply change and Ignore, and is read-only on a Limited device.
- Help: a new `proposals` topic holds the proposal guidance (moved out of `proactive`, which was at the 12 KB topic limit). The handbook's topic-count cap went from 13 to 16. The 2 KB index limit, which bounds what reaches the prompt, is unchanged.

Checks: `management-settings.test.ts` (propose, accept with audit, field and bot refusals, stale refusals, ignore, delivery room missing at apply); the gate test covers every `PROPOSAL_TOOLS` entry; the gateway test refuses a Limited device on both new approvals; desk card tests failed on the old card and pass now; `verify-rendered-acceptance.mjs proposal-settings` passes 8/8 (desktop and phone, light and dark, Full and Limited).

## Room and direct chat proposals (21 November 2026)

`management-rooms.ts` adds two kinds:
- `propose_room` → `management_room`.
  - `create`: name, members, optional lead. The room id is a slug of the name, with a random suffix if it is taken. Validation is `validateDeskRoom`, the same as the new-room sheet. Apply is `createDeskRoom`. An id taken between proposal and accept fails without writing.
  - `update`: name, addMembers, removeMembers, leadBotId. Validation is `planRoomUpdate` and apply is `updateDeskRoom`.
  - Stale check: name, lead and members must be unchanged.
  - The card lists agents before and after, and warns how many enabled automations in that room run as a removed agent.
- `propose_direct_chat` → `management_direct_chat`: refused if the bot already has a direct chat. Apply is `ensureDirectChat`, so accepting two cards still leaves one chat.
- **Remove member** stays in, as the owner asked. The `PATCH /rooms/:id` logic moved out of `gateway.ts` into `roomcreation.ts` and gained `removeMembers` (see [room-creation.md](room-creation.md)). The route and proposals share one validator and writer. There's no desk control for removal yet.
- **Desk:** the shared proposal card shows only the new value for something new (no "from"), and shows the payload's `notes`, such as the automation warning.

Checks: `management-rooms.test.ts` (create, slug collision, update with add/remove/lead, lead and last-agent rules, direct chat and hidden-room refusals, automation warning, stale refusal, direct chat open and idempotence); a `gateway.test.ts` removal test that fails on the old route; the room and gateway suites and `node scripts/verify-room-membership.mjs` pass on the shared writer; `verify-rendered-acceptance.mjs proposal-rooms` 4/4.

## Responsibility proposals (21 November 2026)

`management-responsibilities.ts` adds `propose_responsibility` → `management_responsibility`:
- **Creates paused.** It creates a standing responsibility, always paused, through `responsibilities.create` (the same path as the desk's create button). Turning it on stays a separate owner action in Automations.
- **Source comes from the daemon.** The bot supplies name, conversation, sender, subject topic, question, and optionally the bot and resource. The binding and resource come from the daemon's configured source, never from the bot.
- **Refusals.** It's refused when no source is connected, the resource isn't permitted, the bot isn't API/Ollama (investigations don't run on ACP), or the conversation doesn't contain the bot.
- **Stale check.** If the connected source's binding changed between proposal and accept, it's refused.
- **Production today:** `main.ts` constructs Responsibilities without a source adapter (OA-368 is synthetic only), so this proposal is always refused on a normal install, matching the desk's disabled create button. It becomes usable when a real mail source lands.
- **Card:** the shared card lists name, trigger, question, bot, destination and source. Its note says it's created paused.

Checks: `management-responsibilities.test.ts` covers accept creating a paused, source-bound responsibility with its audit event; the source, resource, runtime, conversation and email refusals; and a source change before accept. The gateway Limited-device test covers the approval type. There's no rendered check for this kind, because the rendered fixture has no source; it uses the shared card covered by `proposal-settings` and `proposal-rooms`.

# Default bot (OA-339)

Every install has one **default bot**. It is the bot that unattended features (heartbeat, nightly reflection) use when their
own Bot setting is left on "Default bot". The setting is `defaultBot` (`{ botId }`, owner-only, changes audited as
`setting_changed` in `_system`).

In its direct chat the default bot coordinates the owner's request. See [coordinator judgment](agent-requests.md#coordinator-judgment) for delegation and the fallback when no role fits. Shared turn guidance also reaches existing default bots; changing the initial instructions below does not overwrite their configured instructions.

## Creation (`defaultbot.ts`, `ensureDefaultBot`, called once in `main.ts` right after the ledger)
- Runs only when `defaultBot.botId` is `null`. One transaction creates the bot, stores the setting and appends a `config`
  event `default_bot_created` (`botId`, `adapter`) to `_system`.
- The bot is named "Bot", handle `bot` (the first free of `bot`, `bot-2` .. `bot-9`). Runtime `acp`. It creates no room and no
  membership and starts no turn. Existing bots, rooms, members, settings and history are never touched, so an existing
  install gets a NEW bot next to `boss`; `boss` keeps its own MEMORY.md and skills.
- The adapter is chosen with `detectAdapter()` (`models.ts`): the first installed ACP package, Claude Code before Codex. This
  is module resolution only: nothing is launched and no provider is contacted. With none installed the bot still exists with the
  Claude Code shape and reports `not_configured`.
- A setting that names a deleted bot is not recreated; `defaultBotStatus` reports `missing`.

## Status (`defaultBotStatus`)
`ok` | `missing` | `not_configured` (adapter package not installed, or the hosted provider key is not set). Sign-in cannot be
known without starting the adapter, so it is never claimed. It feeds the required Readiness item `defaultBot`.

## Resolution
`heartbeat.ts` and `reflection.ts` use `setting.botId ?? defaultBotId`. They no longer read room `main`. A missing default
skips the run with a one-time log line ("bot <id> not found") or "no bot chosen and no default bot"; there is no fallback to
another bot.

## API and desk
- `PUT /settings/defaultBot`: owner or full-access device only (limited device 403); `botId` must name an existing bot (400).
- `GET /bots` and `GET /rooms/:id` mark the bot with `isDefault: true`.
- The Proactive Bot selects show "Default bot (<name>)" for the empty value (stored settings are unchanged); Bots shows a
  "Default" badge. There is no desk control to change the default in this ticket.

Verified by `node scripts/verify-default-bot.mjs` (needs `pnpm -r build`).

## Management proposals (OA-347)
The default bot can propose scheduled automations (`propose_automation`), the scheduled checks, morning brief and nightly reflection switches and schedules (`propose_proactive`) the message destination (`propose_delivery_room`), rooms (`propose_room`: create, rename, add or remove agents, lead) direct chats (`propose_direct_chat`) and paused standing responsibilities (`propose_responsibility`, refused while no mail source is connected); the owner or a full-access device applies them by accepting the card in the conversation. See [default-bot-management-design.md](default-bot-management-design.md).

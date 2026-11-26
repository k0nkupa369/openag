# Changelog

All notable changes to OpenAg are recorded here. Versions follow [Semantic Versioning](https://semver.org); before 1.0, minor versions may change interfaces.

## 0.8.0

### History search
- Agents can search past messages in the conversations they belong to with the new `history_search` tool. It only reads local data, needs no approval, and returns results as data to cite, never as instructions. Hidden conversations are never searched.
- In the desk, press Cmd+K (or **Search** in the sidebar on a phone) to find a message. Choosing a result opens the conversation at that message.

### Owner notes
- One shared file of facts about you that every agent reads, shown in **Settings → Profile**. Owner and Full devices can edit it or remove single notes. Every device can read it.
- Nightly reflection can add owner notes on its own. Notes that contain a secret, or that would push the file past 16 KB, are refused. Agents cannot write owner notes directly.

### Skills
- OpenAg records when each skill was last used, and the Skills page shows it.
- Nightly reflection can propose revising or archiving a skill. Nothing changes until you accept. A revision shows exactly what changes, and a proposal made against an older version of the skill is refused.
- Archived skills leave the agent's skill list and can be restored from the Skills page.

### Help
- The built-in handbook can hold up to 24 topics.

### Phones over WebRTC
- A phone connected over WebRTC can use history search and read owner notes. Editing owner notes still needs the desk on your network.

## 0.7.10

### MCP servers
- Fixed: agents on hosted OpenAI models could not set Notion page properties such as the title. Strict tool mode rewrote free-form objects in MCP tool inputs to an empty object, so the model could only send `{}`. MCP tool inputs are now sent as the server wrote them; OpenAg's own tools stay strict, and every call still goes through the same checks and approval gate.

## 0.7.9

### MCP servers
- Fixed: agents on hosted API models could find an MCP tool through `tool_search` but never call it, so no MCP tool (Notion, Composio, Apple apps and others) worked for them on 0.7.8. Found tools are now offered on the next step. Claude Code and Codex agents were not affected.
- Checking a server that needs sign-in (such as Notion) shows **Server reachable: sign-in needed** with the next step, instead of a failed check.

## 0.7.8

### Proactive checks
- Fixed: Outlook checks failed with `context_limit` and sent a "check was incomplete" message. Isolated turns (proactive assessments, webhook and wake-watcher runs) refuse every tool, but they still sent every tool description to the model and went over the request size limit. They now send none, which also makes each assessment call smaller.
- Proactive history shows how much of each call's input was served from the provider's prompt cache, for example `11,869 in (11,008 cached) · 74 out`.

### Cost per turn
- Agents on hosted API models get a short list of common tools plus `tool_search`. They load any other tool by keyword when they need it, and it goes through the same approval gate. In a measured six-call run on gpt-6-luna, input tokens fell 46% (46,763 → 25,398).
- Request records count cached input tokens from both usage formats that providers return.
- `scripts/measure-prompt-cache.mjs --authorized-api` measures input and cached tokens per call on a temporary install.

### Memory
- When saved-memory search is unavailable (for example, embeddings are down), the bot is told so and says memory search is unavailable rather than that it does not remember. `GET /memory/search` returns 503 with the reason instead of an empty result.

### MCP servers
- **Tools to offer**: a custom MCP server can be limited to listed tool names (desk field, or `tools` in `mcp.json`). Only listed tools reach agents. Leaving it blank offers every tool, as before.
- The MCP servers help topic has a Notion Memory setup: address `https://mcp.notion.com/mcp`, sign in with OAuth, and offer `notion-memory-search`, `notion-fetch`, `notion-create-pages` and `notion-update-page`.

### Verification
- `scripts/verify-mcp-desk.mjs` finds custom server cards again after the desk redesign removed the label it looked for.

## 0.7.7

### Default bot help
- Computer control and model-request limits each have their own help topic (`computer`, `model-requests`), which leaves room in the two topics that were full. The computer and integrations topic is now titled Integrations; its id is unchanged.
- The `openag_help` tool lists every installed help topic. It used to name only 8, so bots other than the default could miss the rest.
- Help topics refer to each other by topic id, so a bot that follows a pointer finds the topic.

### Memory
- When Ollama is not running, the service log says `Ollama is not reachable at <address> (ECONNREFUSED)` instead of `request failed`. Other connection errors keep their code.

### Verification
- `scripts/verify-daemon-shutdown.mjs` works again. It waited for a `0.0.0.0` address, but the daemon has listened on `127.0.0.1` by default since that changed.
- `scripts/verify-bot-knowledge.mjs` checks that `openag_help` lists exactly the installed topics and that every help cross-reference names a real topic.

## 0.7.6

### Default bot
- Fixed: a default bot on a hosted API model (for example OpenAI) could not make proposals. The change was refused with "Execution arguments differ from the approved snapshot" whenever the model left out an optional field, so no card appeared. This affected automation proposals in 0.7.4 too.

### Verification
- `scripts/verify-management-proposals-api.mjs --authorized-api` runs every proposal type through an API default bot on a real model, in one conversation, on a temporary install.

## 0.7.5

### Default bot
- The default bot can now propose more changes, each shown as a card in the conversation. Nothing changes until you or a Full device choose Apply change, and a proposal expires after 24 hours. It can propose:
  - turning scheduled checks, the morning brief or reflection on or off, and changing their schedule or bot;
  - where proactive messages go;
  - creating a room, renaming one, adding or removing agents, changing the lead, and opening a direct chat;
  - a standing responsibility, created paused (this needs a connected mail source).
- A card is refused if what it changes was edited after it was proposed, and Limited devices see it read-only. The bot can explain the rules (its help has a Proposals topic).

### Proactive checks
- A check that is behind (for example a busy Outlook inbox) runs up to five rounds straight away instead of waiting for the next interval. Each round still reads at most 20 items and makes at most one model call.
- Settings → Proactive → History shows the model calls per day, the models used, and input/output tokens where the provider reports them.

### Reflection
- Nightly reflection skips OpenAg's own pings and morning briefs, so it reviews your actual conversations.

### Security
- Every settings change now needs the owner or a Full device. Before, a Limited device could change some settings (scheduled checks, reflection, backups, ntfy alerts). Limited devices also no longer see the ntfy topic.

### Desk
- Cmd+B opens and closes the sidebar instantly. Clicking the toggle keeps its short animation.
- Expandable sections open and close smoothly instead of jumping.
- Dragging the profile image crop is smoother.

## 0.7.4

### Desk
- A tooltip opened right after another one (for example Copy, then Reply on a message) appears at once instead of waiting again.
- Dragging a sidebar room or agent to reorder it: the row follows your pointer, stretches slightly past the ends of the list, and returns home if you let go outside a target. A second finger is ignored.
- On phones, the navigation drawer closes with a swipe toward its edge, and the background fades as you swipe. A short drag snaps it back open.

### Verification
- `scripts/verify-avatar-performance.mjs` checks avatar frame pacing and main-thread cost in Chromium (OA-390).
- `scripts/verify-composio-connect.mjs` matches permission sessions: a confined mode refuses the Composio call, and Full access runs it once without an approval.

## 0.7.3

### Models
- A rejected model request now says why. The chat error shows the provider's status, error code and message (redacted) after `provider_error`, instead of only "Hosted model request failed".
- Newer GPT-6 OpenAI models that the bundled catalogue does not list yet, such as `gpt-6.1-terra` and `gpt-6.2-astra`, offer an Effort setting (low, medium, high, xhigh, max).
- Saved model choices refresh automatically when OpenAg's capability rules change, so an update can no longer leave stale options in place.

### Conversations
- Replying to a message and answering an agent's question use the same quoted reply preview; Cancel reply or Escape clears either.
- A message with only attachments no longer shows an empty bubble above its files.
- "Load earlier messages" sits in its own bordered row above the transcript.
- On phones, the activity summary keeps the agent's name and shortens the counts instead.
- The composer's icons are back to the standard size, and the "Some model sources are unavailable" notice no longer appears inside the composer (model refresh stays in Settings → Models).

### Desk
- Keyboard-opened menus, popovers, tooltips, the Cmd+K palette and the @mention picker appear instantly. Mouse opens keep their short animation.
- Sheets open in 200ms and close in 150ms on the desk's standard easing, and the jump-to-latest button leaves faster.
- The sign-in title is a page heading for screen readers, and sign-in errors appear at the top of the card.
- Profile: the image zoom slider's handle stays on its track, and busy buttons show a spinner.
- Agent settings help text uses the standard description style.

## 0.7.2

- The public repository is now [k0nkupa369/openag](https://github.com/k0nkupa369/openag). Clone from there and report security issues through its advisories page. Releases before 0.7.2 are not carried over; 0.7.2 matches 0.7.1 apart from these references.

## 0.7.1

### Proactive checks
- Gmail checks work again. They read message metadata (subject, sender, time and preview) instead of full message bodies. Full bodies made the provider return a sampled reply, so every check failed on the same window and coverage stopped advancing.
- A provider reply too large to read inline is reported as such in check history. Its sample is never treated as complete coverage, and the window and page position are kept.
- Gmail alerts use the message preview text instead of the start of the HTML body.

### Desk
- Agent requests list only the five most recent settled requests, behind Show earlier requests, and shorten long settled answers until Show full answer. Requests that need input or have findings ready are never hidden.
- Automations notifications use the shared toast component and follow the Light/Dark choice.

### MCP servers
- HTTP header references accept only `OPENAG_MCP_<NAME>` variables. The legacy exception for one other credential name is removed; rename such a variable to an `OPENAG_MCP_` name in `mcp.json` and the service environment, or the server is refused at load.

## 0.7.0

### Agents
- Agents have editable @handles. Old handles keep reaching the same agent, and each agent has its own avatar and name across chats, alerts and briefs.
- Agent requests are asynchronous. A busy agent queues a request instead of refusing it, and the asking agent uses each reply as it arrives. A reply waits only for its own conversation, never for approvals or Work elsewhere.
- A delegated agent that consults others reports back to its delegator exactly once, including when its requests are cancelled or fail.
- Guest @mentions in a direct chat can run as guest Work without changing membership. In interactive Full access, the default agent can create and configure agents.
- Coordinator guidance for delegation, and simpler approval reviews. The receipt-conflict gate has been removed: Unknown and pending receipts are kept as evidence, not as locks.

### Conversations
- Unread badges and a new-messages marker, kept in step across devices. A reply composer that can quote a message, a working indicator, and dismissable unanswered questions.
- Push (ntfy and Web Push) can notify about an unread finished reply, a guest reply or an open question.

### Proactive
- Proactive checks of selected Composio services (Outlook and Gmail inbox, GitHub notifications), with check history, per-account coverage and a message destination for alerts and the morning brief. With no service selected, the model heartbeat runs as before.
- Check status and history include mailbox excerpts, so only the owner or a Full device can see them.
- Gmail, GitHub and connection-list reads are approved automatically only inside these checks. In other turns they keep external-action handling.
- Reflection run history with proposal details (owner/Full).

### Sign-in and security
- The sign-in page has been redesigned: an eight-slot pairing code, and direct join.
- Automatic localhost sign-in (`POST /devices/host`) has been removed. Any local program could use it to mint a Full device. On the daemon computer, use `pnpm desk:open`, which goes through the protected Unix socket. Devices created by the old route stay valid until you revoke them.

### Upgrades
- 0.6.0 installs: the Web Push migration is renumbered from 039 to 044 in place, and existing subscriptions are kept. The migration runner now refuses duplicate migration numbers and renamed migrations.

## 0.6.0

### Notifications
- Web Push to the installed desk: end-to-end encrypted (RFC 8291, VAPID per RFC 8292, `node:crypto` only), turned on per device in Settings → Proactive → Notifications. Subscriptions belong to a paired device and are deleted when it is revoked. Needs the desk over HTTPS (for example Tailscale Serve) or on `localhost`; on iPhone and iPad, from the Home Screen app. ntfy stays available alongside it.

### Default agent
- The default agent can propose an automation in a conversation; nothing is created until the owner or a Full device accepts it. Proposals expire after 24 hours and appear in the morning brief.
- Creating, changing and deleting automations now needs the owner or a Full device; any device can still read them and run one now.

### WebRTC
- Phones can pair and use the desk over WebRTC from another network, through an operator-run TURN relay (coturn guide in `docs/coturn.md`). Device TURN credentials last 7 days.
- Reconnects ride out short drops and resume when a backgrounded phone tab returns; the desk explains an unreachable connection instead of failing requests.
- Relay status and the active route are reported, with a relay-only test switch. Operators can bind WebRTC to one IPv4 interface.

### Models
- OpenAI requests are credit-safe: response storage is off, scheduled runs use Flex processing (falling back when Flex has no capacity), and quota or billing errors stop the run instead of retrying.

### Development
- Feature work goes through a `staging` branch before a release; CI runs on `staging` pushes.

## 0.5.1

- `pnpm onboard`: one command from a fresh clone to a running daemon and a signed-in desk (detects Claude Code, Codex, API keys and Ollama; optional always-on service; `--dry-run`).
- The desk reports "cua is not installed" instead of a raw spawn error when the Cua CLI is missing.
- The owner's MCP server list no longer shows credentials written into a server URL by hand.
- The sign-in relay accepts callbacks from custom remote MCP servers; the daemon still checks the issuer before any code exchange.
- `pnpm onboard --service` no longer builds twice.
- README logo and demo animation, recorded against demonstration data (`scripts/capture-demo.mjs`).
- Issue and pull request templates; CONTRIBUTING explains how public contributions reach a release.
- CI uses current GitHub Actions and type-checks the daemon's test files.
- Releases are published with `scripts/publish-release.mjs`, which scans each snapshot before it is pushed.

## 0.5.0 — first public release

OpenAg is a self-hosted, always-on desk for AI agents: one daemon (`openagd`) and a web desk, running on your own Mac.

### Agents and models
- Claude Code and Codex agents over ACP, using the unmodified CLIs and your existing sign-in.
- API agents through Mastra (OpenAI, Anthropic, OpenRouter) and local Ollama chat models.
- A default agent created on first start; per-agent model and reasoning selection with capability discovery.
- Direct chats, shared rooms with a lead, `@mentions`, `@everyone` and delegation between agents.

### Permissions and safety
- One daemon-owned permission gate for every tool call, across all agents and runtimes.
- Permission modes: Read Only, Workspace Write (default for new installs) and Full access. Reviews happen in the originating conversation.
- The CLIs' native tools are disabled; agents reach OpenAg tools through a scoped MCP server.
- Secrets are redacted from the database, ledger, approvals, turn state and logs. Device tokens are stored as hashes.
- Scheduled runs cannot use approval-gated tools unless allowed per automation; webhook and GitHub-triggered runs are isolated.

### Memory and proactive work
- Per-agent `MEMORY.md` with vector search (sqlite-vec) and versioned skills.
- Optional nightly reflection that saves memory notes; skill drafts need approval.
- Heartbeat with a worth-waking filter (deduplication, active hours, urgency, daily budget) and a morning brief.
- Cron automations, verified webhooks, GitHub polling and an optional Slack channel.

### Computer use
- A managed Cua sandbox with screenshots, input and shell tools, plus human takeover.
- Optional Browserbase, Docker and SSH backends.

### Tools and connectors
- MCP client: local commands with owner review and hash pinning, remote HTTP servers with SSRF protection, stored secrets and OAuth sign-in.
- Owner-installed Apps; optional Composio bridge with browser sign-in.
- Read-only Apple Mail and Calendar, and Google Gmail and Drive read/search connectors.

### Devices and operations
- Responsive web desk, device pairing with single-use codes, Full and limited device access, revocation.
- Push notifications through ntfy; Tailscale access; optional WebRTC peer service (off by default).
- launchd service installer, daily verified SQLite backups, turn watchdog, readiness checklist.

### Changes for existing installs
- **The daemon now listens on `127.0.0.1` by default.** Set `OPENAG_HOST=0.0.0.0` (and re-run `scripts/install-service.sh` for the service) to keep LAN or direct tailnet-IP access. Access through `tailscale serve` works without it.
- **There is no built-in sign-in relay.** Composio and remote-MCP browser sign-in use a private Tailscale callback, or a relay you deploy yourself and set with `OPENAG_SIGNIN_RELAY_URL` ([guide](docs/signin-relay.md)). An invalid relay URL now stops the daemon at startup.

### Known limits
- macOS only; Linux and Windows are untested.
- The daemon speaks plain HTTP; use Tailscale or a trusted network for other devices.
- Real provider acceptance for connectors is recorded per connector; see [ROADMAP.md](ROADMAP.md) for open items.

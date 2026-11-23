# OpenAg Roadmap

This replaces the former internal ticket queue. It summarises what has shipped, what is still open, and ideas deliberately kept out of scope. Product concepts are in [docs/openag.md](docs/openag.md); feature behaviour is in [docs/notes/](docs/notes/).

Ticket IDs are not unique across campaigns. Some IDs were reused (for example OA-390, OA-398 to OA-403, OA-454 to OA-457). Treat an ID plus its title as the identity.

## Shipped

### Phase 1: spine
- Single daemon (`openagd`) with SQLite (WAL) and sqlite-vec; numbered migrations.
- Append-only ledger per room, rooms, bots and addressing (`@name`, `@everyone`, room lead).
- Policy gate: every tool call goes through `ctx.callTool` to auto, ask or deny; approvals pause the turn.
- REST and WebSocket gateway; bare web desk; macOS launchd service installer.
- Restart survival: in-flight turns are marked interrupted and can resume after approval.

### Phase 2: MVP
- Multi-bot routing (boss and specialists); Claude Code and Codex bots over ACP.
- Redaction of secrets before ledger, approval, turn-state and log writes.
- Per-bot `MEMORY.md` plus vector memory; permission modes (Read Only / Workspace Write / Full access).
- Desk v1; device pairing with single-use codes and per-device `oag_` tokens.
- Scheduler, heartbeat, wake filter, morning brief, cron automations, ntfy push.
- MCP client and openagd as an MCP server; Cua managed computer with tools and human takeover.

### Phase 3: v1 capabilities
- Nightly reflection (validated proposals; skill drafts still need approval).
- Skills (versioned agent-owned SKILL.md files, shared read-only library with assignments).
- Webhook automations with a Cloudflare Tunnel for `/hooks/*`; GitHub and Slack event triggers; ambient watchers.
- Computer backends: Browserbase, optional local Docker, VPS/SSH.
- First-party Apps SDK; optional Composio bridge; room router; Ollama chat bots.
- Slack channel (Socket Mode, one channel, allow-listed users); WebRTC peer service (daemon side, flagged off).

### Phase 4: hardening and always-on operations
- Turn watchdog, adapter stall diagnostics, approval source tags, Slack liveness.
- Daily verified SQLite backups; turn budget; liveness ping; log rotation; keep-awake; readiness checklist.

### Desk, integrations and safety campaigns
- Native shadcn/base-nova desk: shell, conversations, Work records, approvals, receipts, Settings pages, Devices page.
- Permission sessions replace category settings; permission confinement proven through both ACP adapters.
- Remote MCP servers managed from the desk (HTTP with env references, direct secrets, stdio with command review, generic OAuth).
- Read/search connectors: Apple Mail and Calendar (read-only), Google Gmail and Drive read/search, connector cards with evidence-based status.
- Composio browser sign-in through hosted or private callback routes.
- Model catalogue with capability discovery; Ollama switching; composer dictation; hosted-model continuity and bounded execution.
- Request provenance across hosted and ACP runtimes; tool execution reliability contract; ACP permission and instruction delivery.
- Room membership and layout; direct one-to-one chats; new bot and new room flows; default bot; conversation delivery model.
- OA-427 Available file-drop target in the composer ([desk-motion.md](docs/notes/desk-motion.md)).
- OA-395 Reviewed read-only Composio batches complete instead of leaving Unknown receipts ([mcp.md](docs/notes/mcp.md)).
- OA-215 GitHub polling trigger without a tunnel, `repo` mode ([github-poll.md](docs/notes/github-poll.md)). Notifications mode is not implemented because it needs a classic token.
- Rendered acceptance, 18 Nov 2026 ([rendered-acceptance.md](docs/notes/rendered-acceptance.md)): OA-477 questions and decisions in chat, OA-476 replies to a message, OA-473 provider forms in chat, OA-474 invocation result separate from effect verification, OA-469 receipt inspection removed, OA-460 user name and avatar, OA-462 uploaded profile image, OA-459 automatic reflection memory, and OA-466 conversation rendering and typing work (owner confirmed the remote Mac feels faster, 20 Nov). Physical phone, Safari, PWA and screen-reader use remain unverified.
- OA-390 Replace agent avatars with Open Bot Avatar, 20 Nov 2026: rendered check and Chromium performance check passed (`scripts/verify-avatar-performance.mjs`, [avatars/](docs/notes/avatars/README.md#browser-performance-20-november-2026)). Physical phones and Safari remain unverified.
- OA-306 Desk WebRTC transport and pairing: a phone joins, uses the desk over WebRTC, reconnects, is revoked and re-pairs; checked with an Android emulator on a second machine on one network ([webrtc.md](docs/notes/webrtc.md)). Crossing carrier NAT moves to OA-307.

## Built, awaiting acceptance

The source is on `main` and in the 0.5.x releases. Each item stays unticked until its remaining gate passes; the notes linked below record what was checked.

The rendered desktop/phone check now runs in real Chromium (`scripts/verify-rendered-acceptance.mjs`, [rendered-acceptance.md](docs/notes/rendered-acceptance.md)).

Other remaining gates:
- OA-475 Isolate uncertain action conflicts across conversations: final Claude subscription re-verification was quota-blocked ([receipt-isolation-acceptance.md](docs/notes/receipt-isolation-acceptance.md)).
- OA-335 Bot adapter switching and model selection: browser and real-runtime acceptance incomplete ([oa-335-acceptance.md](docs/notes/oa-335-acceptance.md)).
- OA-330 Settings integration and branded providers: a fresh installed-Codex run with one reviewed temporary file write awaits owner authorization ([settings/README.md](docs/notes/settings/README.md)).
- OA-307 TURN and reconnect for WebRTC: TURN reaches pairing phones, 7-day device credentials, reconnect on blips and resume, stale-attempt cleanup, relay diagnostics and interface binding. Lab-checked through a coturn relay, including from a second network where STUN alone failed ([webrtc.md](docs/notes/webrtc.md)). **Parked (owner, 12 Nov 2026):** public relay with a real phone on mobile data, iOS Safari and the installed PWA.
- Web Push notifications for 0.6.0: built (end-to-end encrypted pushes to the installed desk, per-device subscriptions removed on revoke, ntfy kept alongside) with controlled tests and a real FCM delivery to Android Chrome, plus revoke ([web-push.md](docs/notes/web-push.md)). iOS, Mozilla and Apple push services are pending.
- OA-354 Live connector acceptance: Apple Mail, Calendar, Reminders and Notes passed; live Google acceptance is deferred and needs separate authority and a disposable target ([apple-live-acceptance.md](docs/notes/apple-live-acceptance.md)).

## Open

Not yet built.

**Memory, models and routing**
- OA-347 Default bot management tools ([default-bot-management-design.md](docs/notes/default-bot-management-design.md)). Every v1 proposal kind is built: automations (with real Claude/Codex journeys), and in 0.7.5 the shared base, heartbeat/brief/reflection, delivery room, rooms (including removing a member), direct chats and responsibilities, with controlled tests and rendered card checks. A real API default bot journey (gpt-6-luna) covered every kind in one conversation and found a snapshot-comparison bug for API tool calls, now fixed. Not yet run: real Claude/Codex journeys for the new kinds. Responsibility proposals are refused until a mail source adapter exists (OA-368 is synthetic only).

**Channels and remote access**
- WebRTC access cap (decision first): a device set to Full access is treated as the owner over WebRTC, while the WebRTC design keeps owner-only routes on LAN/Tailscale. Decide whether WebRTC peers are capped at Limited access ([webrtc.md](docs/notes/webrtc.md), Known limits).

**Deferred**
- OA-440 Investigate LFM3 tool-result generation, only if the model is reprioritised.

## Parking lot

Ideas kept out of scope on purpose:
- Native phone app (the desk PWA comes first).
- Multi-box computer pools or parallel sandboxes per bot.
- Public App marketplace and code signing.
- Replacing the ACP CLIs with a custom agent loop.
- Making Composio a required dependency.
- Help topic room: every topic must stay under the 12 KB `HELP_TOPIC_MAX`, and the handbook allows 16 topics, all now used. The next topic that fills up needs the topic limit raised (the 2 KB index limit, 1.8 KB used, is what bounds the prompt) or content moved to an existing topic.
- Proactive pings that bypass the wake filter.
- A second SQLite database or a client-side database. The daemon owns the only one.

Known issue: the Claude adapter once stalled under the launchd service (cause unknown; it has not recurred). Stall watchdog (OA-301) and adapter diagnostics (OA-302) are in place; the manual reproduction step of OA-302 is still pending.

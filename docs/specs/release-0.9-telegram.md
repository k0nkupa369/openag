# Release 0.9: Telegram channel

Status: draft specification, 25 November 2026. It describes desired behavior and claims no implementation or acceptance. External publication is pending: no issue tracker or triage vocabulary is configured for this repo, and `origin` is public.

Idea drawn from OpenClaw and Hermes Agent, where everyday use goes through chat apps. The OpenAg Slack channel ([slack.md](../notes/slack.md)) is the local pattern to follow.

## Problem Statement

The owner wants to reach their agents from a phone while away from home. Today that means the desk PWA over LAN, Tailscale or WebRTC, or Slack, which suits a workspace rather than a personal assistant. Opening a PWA to send one line is slow. OpenAg's notification channels (ntfy, Web Push) tell the owner something happened, but they can't be replied to. The owner wants to send a message to an agent and read the reply in the chat app they already have open.

## Solution

OpenAg connects to one Telegram bot that the owner creates with BotFather. The daemon reaches Telegram outbound only, by long polling. It needs no tunnel and no public address. Private messages from allow-listed Telegram user ids arrive in one configured OpenAg conversation as ordinary owner messages and pass through the same policy gate as desk messages. Replies to those messages go back to the same Telegram chat. Approvals are never decided in Telegram. Telegram only says that a decision is waiting in the desk. The feature is off by default and set up from Connectors in the desk.

## User Stories

1. As the owner, I want to message my default bot from Telegram, so that I can ask for things without opening the desk.
2. As the owner, I want the reply to arrive in the same Telegram chat, so that the exchange reads as one conversation.
3. As the owner, I want my Telegram messages to also appear in the OpenAg conversation, labelled as coming from Telegram, so that the desk keeps the complete record.
4. As the owner, I want to choose which OpenAg conversation receives Telegram messages, so that I can route them to the default bot's direct chat or to a room.
5. As the owner, I want the default destination to be the default bot's direct chat, so that setup needs no extra choice.
6. As the owner, I want only Telegram user ids I list to reach OpenAg, so that a stranger who finds the bot gets nothing.
7. As the owner, I want an empty allow-list to mean nobody, so that a half-finished setup is safe.
8. As the owner, I want messages from anyone not on the list ignored silently, so that the bot does not confirm it is live.
9. As the owner, I want group and channel messages ignored, so that other members of a group can't feed text to my agents.
10. As the owner, I want my bot token kept only in the daemon's environment, so that it never enters the database, an API response, a log or an agent process.
11. As the owner, I want the token treated as a secret everywhere it could appear (including request URLs and errors), so that a log line can't leak it.
12. As the owner, I want approvals never decided from Telegram, so that someone holding my unlocked phone or Telegram session can't approve an action.
13. As the owner, I want Telegram to tell me when an agent is waiting for a decision, without the tool name, payload or approval id, so that I know to open the desk.
14. As the owner, I want agent questions that need an answer shown in Telegram as text that I can reply to, so that a simple clarifying question doesn't force me into the desk.
15. As the owner, I want only replies to Telegram-originated messages sent to Telegram, so that desk conversations don't leak into my chat app.
16. As the owner, I want a long reply split into several Telegram messages in order, so that nothing is truncated.
17. As the owner, I want replies sent as plain text with link previews off, so that agent output can't inject formatting or fetch links on my behalf.
18. As the owner, I want inbound messages rate limited per user, so that a runaway client can't flood my agents.
19. As the owner, I want duplicate deliveries ignored, so that a retry never starts a second turn.
20. As the owner, I want the poll position kept across restarts, so that a restart neither replays old messages nor drops new ones.
21. As the owner, I want messages sent while the daemon was down to be handled when it comes back, within Telegram's retention, so that short outages don't lose requests.
22. As the owner, I want the channel to back off and recover on network errors and Telegram rate limits, so that it stays up without attention.
23. As the owner, I want Connectors to show whether Telegram is connected, which bot username it uses, the time of the last message received, and any error, so that I can tell whether it works.
24. As the owner, I want the status badge to follow the shared Badge mapping (Connected success, needs setup attention, failed destructive), so that it matches other connectors.
25. As a Limited device user, I want to view the Telegram status but not change it, so that configuration stays with the owner and Full devices.
26. As the owner, I want turning Telegram off to stop polling right away, so that the switch is trustworthy.
27. As the owner, I want photos, voice notes, files and stickers answered with a short note that only text is supported, so that I know why nothing happened.
28. As the owner, I want edited messages ignored, so that an edit never starts a second turn.
29. As the owner, I want Telegram replies included in push and unread state like other agent replies, so that I'm not notified twice for the same reply.
30. As the owner, I want the default bot to explain how to set up Telegram, so that I can follow it without reading the source.
31. As the owner, I want the readiness checklist to list Telegram as optional and never turn it on by itself, so that it never needs a secret it doesn't have.

## Implementation Decisions

- Module: a new Telegram channel module beside Slack. Its constructor takes injected dependencies (fetch, settings reader, ingress, ledger subscription, clock, redactor), the same shape as the Slack channel. It exposes start, stop and status.
- Transport: Telegram Bot API over HTTPS to the fixed host `api.telegram.org`, with `redirect: "error"` and request timeouts. Inbound uses `getUpdates` long polling with an `offset` cursor and a bounded timeout. It accepts only the `message` update type. Outbound uses `sendMessage` with `reply_to_message_id`, no `parse_mode`, and link previews disabled. On startup, `getMe` confirms the token and reads the bot username. Webhook mode is not used, so no ingress route is added.
- Credentials: `TELEGRAM_BOT_TOKEN` comes from the daemon environment only. It is registered with the redactor at startup. The `TELEGRAM_` prefix is added to the daemon secret environment list, so it is stripped from agent processes and refused in MCP header references. The Bot API puts the token in the URL path, so request URLs are never logged, and errors are fixed short strings. Response bodies are never echoed.
- Setting: a new `telegram` setting, off by default, writable by the owner or a Full device only. It holds `enabled`, `allowedUserIds` (numeric strings, empty means nobody) and `conversationId` (empty means the default bot's direct chat, through the existing delivery resolution). A destination that is set but gone pauses inbound handling and shows a status error. It never falls back to another conversation.
- Cursor: the last processed `update_id` is stored durably and advanced only after the message has been posted to ingress or deliberately ignored. A duplicate update id or Telegram message id is dropped.
- Filter, in order: update type `message`; chat type `private`; sender id in the allow-list; sender not a bot; text present (other media gets one fixed note per message); not an edit; per-user rate limit (same order of magnitude as Slack's 10 per minute).
- Ingress: an accepted message is posted through the same ingress as the desk, as an owner message with actor `telegram` and a `[Telegram]` prefix, redacted before any agent sees it. It carries an origin marker (chat id and message id) on the turn, so replies can be routed back.
- Replies: only agent replies to turns that came from Telegram go back to Telegram, including the lead's answer after delegation. The pattern is the same as Slack thread routing. Text is split at a safe size below Telegram's 4096-character limit. A 429 honors `retry_after` once with a cap, then gives up and records the error.
- Approvals and questions: a pending approval sends one fixed message, "Waiting for your decision in the OpenAg desk.", with no tool, payload or id. An open question sends the question text. The owner's next Telegram message in that chat is posted as an ordinary message, and the existing question answering in the conversation applies. Telegram grants no action permission.
- Status: `GET /telegram/status` (any device; it never includes the token or user ids for Limited devices) reports configured, enabled, connected, bot username, last-received time and last error. Add `telegram` to the static route guard's API segments.
- Desk: a Telegram card in Connectors, modelled on the Slack card. It has an enable switch, an allow-list editor, a destination picker, status and a collapsed setup guide (BotFather steps, how to find your numeric user id). Credentials stay outside the form.
- Help: a new `telegram` help topic. This depends on the handbook capacity change in release 0.8. Update `docs/notes/` with a `telegram.md` that records the API facts checked against the Bot API documentation.

## Testing Decisions

- Good tests assert what the owner and the gate observe: which Telegram messages become ledger messages, what text reaches Telegram, what never leaves the daemon. They don't assert private helpers or polling internals.
- Seams, highest first:
  1. The Telegram channel module with a fake fetch that plays Telegram responses, plus a real ingress and ledger on a temp database. Prior art: `slack.test.ts` (fake socket and fetch).
  2. The gateway for the setting and status routes, including owner/Full-only writes and Limited masking. Prior art: `gateway.slack.test.ts`, `gateway.settings.test.ts`.
- Required cases: non-allow-listed sender ignored with nothing sent back; group chat ignored; empty allow-list admits nobody; duplicate update dropped; cursor survives restart without replay; an approval sends only the fixed text; a reply to a desk-originated turn is not sent to Telegram; long reply split in order; the token never appears in ledger, logs, status or errors (assert through the redactor and captured logs); 429 handling; a disabled setting stops polling; `TELEGRAM_BOT_TOKEN` is absent from an agent child environment.
- Live acceptance, recorded separately from controlled tests: one real bot and one owner account, a text round trip through the Claude adapter and the Codex adapter including a second message in the same session, one approval notice, and one restart with a message sent while down. The status card is checked in the rendered desk.

## Out of Scope

- Deciding approvals in Telegram (inline buttons or commands).
- Group chats, channels and several allow-listed chats routed to different conversations.
- Media in either direction (voice notes, images, files), including transcription of Telegram voice notes.
- Webhook mode and any new public ingress.
- Telegram as a trigger for automations.
- WhatsApp, Signal, iMessage and Discord.
- Proactive pings or the morning brief delivered to Telegram. A possible follow-up, but it must go through the wake filter.

## Further Notes

- Telegram does not end-to-end encrypt bot chats, so Telegram can read the messages. The help topic should say this plainly. That's acceptable for a convenience channel and is why approvals stay in the desk.
- iMessage is the most requested alternative on macOS hosts, but no supported bot API exists for it. Revisit it after Telegram ships.

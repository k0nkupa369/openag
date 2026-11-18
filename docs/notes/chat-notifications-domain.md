# Conversation unread and notification domain model

Status: **implemented in source**, 6 November 2026. Deployment and phone delivery remain separate. [Research](chat-notifications-research.md) records the earlier design exploration.

## Purpose and boundaries

The owner needs to find new agent messages after leaving a conversation, including after closing the desk, and receive an ntfy notice when away from that conversation. The owner has chosen shared unread state across devices and confirmed that all visible agent messages, including scheduled and proactive messages, make their conversation unread. Reading on any authorized device, including a Limited device, can advance the shared boundary. Existing proactive notification rules stay in force.

The existing **Conversation** covers both **Direct chat** and **Room**. A conversation's identity, rather than a display name or agent name, owns its unread state. A room with one agent is still a distinct conversation from that agent's direct chat. Guest answers belong to the conversation where they are displayed; private agent consultations do not become owner messages merely because they relate to that conversation.

## Concepts and relationships

- A **visible agent message** is an agent-authored message presented to the owner in a conversation. This includes normal replies, published questions, guest answers, scheduled messages and proactive messages. The current product can show inter-agent messages in a transcript; their actual presentation must be traced before defining eligibility, rather than assumed invisible. The owner's own messages and technical execution events are not agent messages.
- A **read boundary** represents the furthest conversation position the owner has reached. It is shared across devices and only moves forward during ordinary reading. A reading position belongs to a particular view and can move backwards without changing the shared boundary.
- A conversation is **unread** if it contains a visible agent message beyond its read boundary. A later message can make it unread again. Unread is a relationship between the owner and a conversation, not an agent's work status.
- A **conversation notification** is a separate notice that can draw the owner's attention to new activity when they are away from that conversation. Unread state makes an ordinary reply a candidate for notification; it is not evidence that a notification was sent, delivered or seen. A normal reply, an open question, an approval request and a proactive attention item have different purposes and must keep their own delivery rules.

## Reading and alerting

When the first unread message has entered the visible transcript and the conversation has caught up to its latest messages, any authorized device, including a Limited device, may advance the owner's shared read boundary through the latest loaded unread message. This changes reading state only and grants no authority to answer, approve, dismiss or otherwise act. Merely loading a transcript, opening a hidden tab or staying scrolled in older history is not evidence of catching up. Reaching the latest message is a product convention for marking earlier messages read, not proof that the owner read or understood each word. If the unread boundary is outside the loaded window, load earlier history and reach it first.

An ordinary completed agent reply can produce a conversation notification after five seconds. If the owner catches up on another device before the notification decision, no ordinary reply notice is needed. If the owner is elsewhere, or is in the conversation but has not reached the new reply, the reply remains unread and may be notified. A long agent turn may produce multiple visible messages; they can affect unread state while it is running without requiring a phone alert for every fragment. An incomplete turn does not send a completion notice. An initial completed reply and a later synthesized reply after delegation or consultation are distinct messages and may each notify if still unread; delegated child turns do not independently send ordinary reply notices.

A published question can require attention even without a completed ordinary reply. Reading it changes unread state only: the question stays open until answered or dismissed. Opening or reading an approval or provider request does not decide it. Existing approval/provider notifications remain distinct; conversation notification logic must not weaken their delivery rules or cause redundant notices for the same underlying event.

Proactive and scheduled messages visible in the conversation also make it unread. Their existing attention filter, quiet hours, delivery destination and push rules determine whether they produce a proactive notice; unread status alone must not bypass those rules or create a second push. An agent may explicitly request a separate notification under existing tool permissions; this model does not grant new authority.

## Scenario checks

| Situation | Expected domain outcome |
| --- | --- |
| Owner sends a message, closes the tab, and the agent later replies | The conversation becomes unread; an ordinary reply notification may be sent after the grace period. |
| Owner is in the same conversation at the latest message on a visible device | The boundary can advance when the reply is displayed; a pending ordinary reply notice is suppressed. |
| Owner has the conversation open but is reading older history | The new reply remains unread; it may be notified. The reading position is preserved. |
| Owner sees the reply on a second device before the notification decision | The shared boundary advances and the first device eventually reflects the same read state. |
| Owner reads on an authorized Limited device | The shared boundary advances across devices; action and decision permissions remain unchanged. |
| Two devices update the boundary out of order | An older update cannot move the shared boundary backwards or clear a newer message it did not observe. |
| A new message arrives while a device is acknowledging an earlier one | Only the observed boundary is acknowledged; the new message remains unread until reached. |
| An agent asks a question | The visible question makes the conversation unread; seeing it does not answer or dismiss it. |
| A scheduled message is delivered to a room | The room becomes unread; existing scheduling and proactive notification rules remain authoritative. |
| An agent continues working or sends a new visible message after the owner catches up | The later message can make the conversation unread again; completion and unread are independent. |
| ntfy is disabled, capped, unavailable or the daemon restarts during the notice delay | The conversation remains unread. An attempted or accepted push is not proof of phone delivery; the existing live-only behavior does not replay notices after restart. |
| A fork is created from a conversation | The fork and original are different conversations; reading one does not mark the other read. Copied fork history starts at the read boundary. |

## Delivery and migration

Existing conversation history is baselined at upgrade; copied fork history is baselined in the fork transaction. Visible agent messages after those boundaries are unread. Enabled, configured ntfy uses a five-second delay and the configured desk URL; pending notices are not replayed on restart. Chat replies and question notices share the hourly cap but reserve one quarter rounded up for other notifications. At a cap of one, chat notices cannot send. No reply content is sent to ntfy.

The transcript's New messages marker identifies the first unread message. It clears with the shared unread badge once an authorized device catches up. If the first unread message predates the loaded window, the marker appears at the first available message until earlier history is loaded.

## Evidence and scope

Definitions are recorded in [GLOSSARY.md](../../GLOSSARY.md). Source paths checked include `apps/daemon/src/questions.ts`, `apps/daemon/src/agent-requests.ts`, `apps/daemon/src/runtimes/runner.ts`, `apps/daemon/src/wake.ts`, `apps/daemon/src/brief.ts`, and the transcript and desk paths in the research note. This document does not assert a deployed capability or device-delivery result.

# Default bot proposals

The default bot can propose configuration changes in a conversation. A proposal changes nothing: it is a card in that conversation, and only the owner or a full-access device can accept it (applying exactly the card) or ignore it. Limited devices see the card read-only. A card expires after 24 hours and is refused if what it changes was edited after it was proposed; ask the bot for a new proposal then. Never say a proposed change is done until the card was accepted.

What the default bot can propose (rooms and agents themselves cannot be deleted):
- **Automations** (propose_automation): create, change, turn on, pause or delete a scheduled automation that posts to a conversation. The card shows name, schedule, time zone, bot, room, prompt and approval setting.
- **Scheduled checks, morning brief and nightly reflection** (propose_proactive): turn each on or off; the check interval and bot; the brief time and days; the reflection time and bot. The card shows each changed value before and after, for example the check interval.
- **Message destination** (propose_delivery_room): the conversation that receives pings, the morning brief and reflection proposals, or the default bot's direct chat.
- **Rooms** (propose_room): create a named room with its agents and lead, or change a room's name, add or remove agents, or change its lead. A room keeps at least one agent; removing the lead needs a new lead in the same proposal. The card warns when removed agents have automations in that room, which stop running.
- **Direct chats** (propose_direct_chat): open a one-to-one chat with a bot that has none yet.
- **Standing responsibilities** (propose_responsibility): created paused, with sender, subject topic, question, an API or Ollama bot and a conversation that contains it. The source comes from the connected mail source, and the proposal is refused while none is connected (the normal install has none yet). Turning it on stays a separate owner action.

Only the default bot can propose, and only in an ordinary conversation in any permission mode; other bots, scheduled runs and hooks cannot. Triggers, devices, device access, permissions, connectors, MCP servers, push and other secrets, bot models and the default bot itself cannot be proposed. See the [design note](../notes/default-bot-management-design.md).

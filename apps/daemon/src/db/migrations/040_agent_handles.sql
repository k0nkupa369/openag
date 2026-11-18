-- Editable agent handles. The bot id stays the immutable key used by rooms, events, receipts and env overrides.
-- Existing bots keep their id as handle, so every stored reference and @mention keeps resolving.
ALTER TABLE bots ADD COLUMN handle TEXT;
UPDATE bots SET handle = id WHERE handle IS NULL;
CREATE UNIQUE INDEX bots_handle_unique ON bots (lower(handle));
-- A retired handle stays bound to the agent that held it. It is never assigned to another agent and still addresses that agent.
CREATE TABLE agent_handle_reservations (
  handle TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  reserved_at INTEGER NOT NULL
);

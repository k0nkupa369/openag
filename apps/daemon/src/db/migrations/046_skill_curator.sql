-- Skill curator (release 0.8). skill_usage counts successful skill_load calls per agent and source-qualified identity.
-- skill_archive marks an agent-owned skill archived AT a version: a later save bumps the version and makes the skill
-- active again, so a stale row is ignored. The skill files and their history stay on disk either way.
CREATE TABLE IF NOT EXISTS skill_usage (
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  load_count INTEGER NOT NULL,
  last_loaded_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, skill_id)
);
CREATE TABLE IF NOT EXISTS skill_archive (
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  reason TEXT NOT NULL,
  archived_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, slug)
);

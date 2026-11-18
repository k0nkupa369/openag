-- Released in 0.6.0 as 039_web_push.sql; migrate() renumbers that record so 039_proactive can apply. Idempotent so a
-- renumbered or partially upgraded install never fails here.
-- Web Push subscriptions (web-push-subscriptions.ts). One row per browser push endpoint, owned by a paired device;
-- revoking the device deletes its rows. The endpoint and keys are secrets: never logged or returned whole.
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_device ON web_push_subscriptions(device_id);

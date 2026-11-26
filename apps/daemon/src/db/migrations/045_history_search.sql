-- Full-text index over conversation messages (history.ts). Rows are keyed by event id. Only owner messages and agent
-- replies with text in visible conversations are indexed; hidden `_` rooms, tool results, approvals
-- and runtime diagnostics (`runtimeDiagnostic` bot_output, e.g. "Incomplete: ...") never are.
-- The ledger text was redacted on append, so the index holds only redacted text.
CREATE VIRTUAL TABLE history_fts USING fts5(room_id UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');

CREATE TRIGGER history_fts_insert AFTER INSERT ON events
WHEN new.type IN ('message', 'bot_output')
  AND substr(new.room_id, 1, 1) <> '_'
  AND json_valid(new.payload_json)
  AND json_type(new.payload_json, '$.text') = 'text'
  AND length(trim(json_extract(new.payload_json, '$.text'))) > 0
  AND coalesce(json_extract(new.payload_json, '$.internalConsultation'), 0) = 0
  AND coalesce(json_extract(new.payload_json, '$.runtimeDiagnostic'), 0) = 0
BEGIN
  INSERT INTO history_fts (rowid, room_id, text) VALUES (new.id, new.room_id, json_extract(new.payload_json, '$.text'));
END;

CREATE TRIGGER history_fts_delete AFTER DELETE ON events
BEGIN
  DELETE FROM history_fts WHERE rowid = old.id;
END;

INSERT INTO history_fts (rowid, room_id, text)
SELECT id, room_id, json_extract(payload_json, '$.text') FROM events
WHERE type IN ('message', 'bot_output')
  AND substr(room_id, 1, 1) <> '_'
  AND json_valid(payload_json)
  AND json_type(payload_json, '$.text') = 'text'
  AND length(trim(json_extract(payload_json, '$.text'))) > 0
  AND coalesce(json_extract(payload_json, '$.internalConsultation'), 0) = 0
  AND coalesce(json_extract(payload_json, '$.runtimeDiagnostic'), 0) = 0;

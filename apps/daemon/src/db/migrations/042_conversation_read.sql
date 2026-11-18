CREATE TABLE conversation_read (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL DEFAULT 0
);
INSERT INTO conversation_read(room_id,event_id)
SELECT rooms.id,coalesce(max(events.id),0) FROM rooms LEFT JOIN events ON events.room_id=rooms.id GROUP BY rooms.id;

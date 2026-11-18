import type { Db } from './db/index.js';
import type { Ledger } from './ledger.js';

// Match owner-facing message rows; model-context eligibility is a separate concern.
const visible = `e.type IN ('message','bot_output') AND e.actor NOT IN ('user','owner','daemon','scheduler','slack')
  AND e.actor NOT LIKE 'automation:%'
  AND coalesce(json_extract(e.payload_json,'$.internalConsultation'),0)=0`;

export function conversationUnread(db:Db,roomId:string) {
  const boundary=(db.prepare('SELECT event_id FROM conversation_read WHERE room_id=?').get(roomId) as {event_id:number}|undefined)?.event_id??0;
  const row=db.prepare(`SELECT min(e.id) AS first,max(e.id) AS last FROM events e WHERE e.room_id=? AND e.id>? AND ${visible}`).get(roomId,boundary) as {first:number|null;last:number|null};
  return {readThrough:boundary,firstUnread:row.first,lastUnread:row.last};
}

export function markConversationRead(db:Db,ledger:Ledger,roomId:string,through:number) {
  if(!Number.isSafeInteger(through)||through<=0||!db.prepare(`SELECT 1 FROM events e WHERE e.id=? AND e.room_id=? AND ${visible}`).get(through,roomId)) return false;
  ledger.atomic(()=>{
    const result=db.prepare(`INSERT INTO conversation_read(room_id,event_id) VALUES(?,?)
      ON CONFLICT(room_id) DO UPDATE SET event_id=excluded.event_id WHERE excluded.event_id>event_id`).run(roomId,through);
    if(result.changes)ledger.append(roomId,'daemon','conversation_read',{through});
  });
  return true;
}

import type { Db } from './db/index.js';
import type { LedgerEvent } from './ledger.js';

interface Row { id:number; room_id:string; ts:number; actor:string; type:LedgerEvent['type']; payload_json:string }

/** A display window, independent of model context and retained history. */
export function readTranscript(db:Db, roomId:string, query:{before?:number;after?:number}) {
  return db.transaction(() => {
    const throughId = (db.prepare('SELECT coalesce(max(id),0) id FROM events WHERE room_id=?').get(roomId) as {id:number}).id;
    const forward = query.after !== undefined;
    const rows = db.prepare(`SELECT * FROM events WHERE room_id=? AND id<=? AND id${forward?'>':'<'}? ORDER BY id ${forward?'ASC':'DESC'} LIMIT 501`)
      .all(roomId,throughId,forward?query.after:query.before??throughId+1) as Row[];
    let selected = rows.slice(0,500);
    if (!forward) {
      let messages = 0;
      const end = selected.findIndex(row => (row.type === 'message' || row.type === 'bot_output') && !JSON.parse(row.payload_json)?.internalConsultation && ++messages === 50);
      if (end !== -1) selected = selected.slice(0,end+1);
      selected.reverse();
    }
    const events:LedgerEvent[] = selected.map(row=>({id:row.id,roomId:row.room_id,ts:row.ts,actor:row.actor,type:row.type,payload:JSON.parse(row.payload_json)}));
    const first = events[0]?.id;
    const hasOlder = first !== undefined && !!db.prepare('SELECT 1 FROM events WHERE room_id=? AND id<? LIMIT 1').get(roomId,first);
    const runningTurns = db.prepare("SELECT id,bot_id AS botId FROM turns WHERE room_id=? AND status='running'").all(roomId) as {id:string;botId:string}[];
    const work = db.prepare("SELECT id AS workId,bot_id AS botId,status FROM work WHERE room_id=? AND status IN ('working','needs_input','needs_approval')").all(roomId) as {workId:string;botId:string;status:string}[];
    return {events,before:hasOlder?first!:null,after:forward&&rows.length>500?events.at(-1)!.id:throughId,hasMore:forward&&rows.length>500,state:{throughId,runningTurns,work}};
  })();
}

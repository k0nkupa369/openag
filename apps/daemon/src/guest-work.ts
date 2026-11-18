import type { Db } from './db/index.js';
import { getDefaultBotId } from './defaultbot.js';

export function guestWorkCandidate(db: Db, roomId: string, caller: string, assignee: string): boolean {
  return caller === getDefaultBotId(db) && caller !== assignee && !!db.prepare("SELECT 1 FROM rooms r JOIN room_members m ON m.room_id=r.id AND m.bot_id=? JOIN bots b ON b.id=? WHERE r.id=? AND r.kind='direct' AND r.lead_bot_id=?").get(caller,assignee,roomId,caller);
}

export function guestWork(db: Db, workId: string, roomId: string, botId: string): { permissionParents: import('./permissions.js').PermissionReference[] } | undefined {
  const row = db.prepare("SELECT g.permission_parents_json FROM guest_work_assignments g JOIN work w ON w.id=g.work_id JOIN rooms r ON r.id=w.room_id JOIN bots b ON b.id=w.bot_id WHERE w.id=? AND w.room_id=? AND w.bot_id=? AND w.creation_key IS NOT NULL AND r.kind='direct'").get(workId,roomId,botId) as {permission_parents_json:string}|undefined;
  return row ? { permissionParents: JSON.parse(row.permission_parents_json) } : undefined;
}

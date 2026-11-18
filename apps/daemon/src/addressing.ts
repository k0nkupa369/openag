import { AgentRequestError } from './agent-requests.js';
import type { HandleIndex } from './handles.js';
import type { Room } from "./rooms.js";

// `@name` only counts at the start of the text or after whitespace, so `a@coder.com` never matches.
const MENTION = /(?<![^\s])@([A-Za-z0-9][A-Za-z0-9_-]*)/g;

const mentionNames = (text: string): string[] => [...text.matchAll(MENTION)].map((m) => m[1]!.toLowerCase());

/** Without a handle index, a name addresses a member by its id. Production passes the index so handles resolve to ids. */
function indexFor(room: Pick<Room, 'members'>, handles?: HandleIndex): HandleIndex {
  return handles ?? new Map(room.members.map((id) => [id.toLowerCase(), id]));
}

/** True when the text names a member or @everyone: such a message never goes through the room router. */
export function hasExplicitTarget(text: string, room: Pick<Room, "members">, handles?: HandleIndex): boolean {
  const names = mentionNames(text);
  if (names.includes("everyone")) return true;
  const index = indexFor(room, handles);
  return names.some((n) => { const id = index.get(n); return id !== undefined && room.members.includes(id); });
}

export function resolveTargets(text: string, room: Pick<Room, "members" | "leadBotId">, handles?: HandleIndex): string[] {
  const names = mentionNames(text);
  if (names.includes("everyone")) return [...room.members];
  const index = indexFor(room, handles);
  const targets: string[] = [];
  for (const n of names) {
    const id = index.get(n);
    if (id && room.members.includes(id) && !targets.includes(id)) targets.push(id);
  }
  if (targets.length > 0) return targets;
  return room.leadBotId ? [room.leadBotId] : [];
}

/** Desk-only guest addressing; an explicit unknown handle must not silently route to the lead. Returns bot ids. */
export function directTargets(text: string, room: Pick<Room,'members'|'leadBotId'>, handles: HandleIndex): string[] {
  const names = mentionNames(text);
  if (!names.length || names.includes('everyone')) return resolveTargets(text, room);
  const targets = [...new Set(names.map(name => {
    const id = handles.get(name);
    if (!id) throw new AgentRequestError(`Unknown agent @${name}.`, 400);
    return id;
  }))];
  if (targets.length > 3) throw new AgentRequestError('Address at most three agents in a direct chat.', 400);
  return targets;
}

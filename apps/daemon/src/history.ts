import type { Db } from "./db/index.js";

/** One message that matched a history search. `highlights` are [start, end) offsets of matched words in `snippet`. */
export interface HistoryHit {
  eventId: number;
  roomId: string;
  roomTitle: string;
  actor: string;
  ts: number;
  snippet: string;
  highlights: [number, number][];
}

export interface HistorySearch {
  query: string;
  /** Conversations the caller may see; an empty list matches nothing. Hidden `_` rooms are excluded whatever this holds. */
  rooms: readonly string[];
  /** Only events older than this event id. */
  before?: number;
  limit?: number;
}

export const HISTORY_QUERY_MAX = 300;
export const HISTORY_LIMIT_MAX = 50;
const TERMS_MAX = 8;
const TERM_MAX = 64;
const SNIPPET_MAX = 400;
const OPEN = "";
const CLOSE = "";
// Messages from the last 90 days rank up to 30% higher than an equal older match.
const RECENT_MS = 90 * 24 * 60 * 60 * 1000;
const RECENT_BOOST = 0.3;

/**
 * Turns free text into a safe FTS5 query: every word becomes a quoted phrase (so FTS5 operators and syntax are
 * literal text), a trailing `*` keeps prefix matching, and all words must match. Null when nothing is searchable.
 */
export function parseHistoryQuery(input: string): string | null {
  const terms = input.slice(0, HISTORY_QUERY_MAX).split(/\s+/).flatMap((chunk) => {
    const prefix = chunk.endsWith("*");
    const word = chunk.replaceAll('"', "").replaceAll("*", "").slice(0, TERM_MAX);
    return /[\p{L}\p{N}]/u.test(word) ? [`"${word}"${prefix ? "*" : ""}`] : [];
  });
  return terms.length ? terms.slice(0, TERMS_MAX).join(" ") : null;
}

interface Row { id: number; room_id: string; room_title: string; actor: string; ts: number; snip: string }

/** Lexical search over indexed conversation messages, best match first with a small preference for recent ones. */
export function searchHistory(db: Db, search: HistorySearch): HistoryHit[] {
  const match = parseHistoryQuery(search.query);
  if (!match || search.rooms.length === 0) return [];
  const limit = Math.min(Math.max(search.limit ?? 20, 1), HISTORY_LIMIT_MAX);
  const rows = db.prepare(`
    SELECT f.rowid AS id, e.room_id, r.name AS room_title, e.actor, e.ts,
      snippet(history_fts, 1, '${OPEN}', '${CLOSE}', '…', 24) AS snip
    FROM history_fts f JOIN events e ON e.id = f.rowid JOIN rooms r ON r.id = e.room_id
    WHERE history_fts MATCH @match AND substr(f.room_id, 1, 1) <> '_'
      AND f.room_id IN (SELECT value FROM json_each(@rooms))
      AND (@before IS NULL OR f.rowid < @before)
    ORDER BY bm25(history_fts) * (1.0 + ${RECENT_BOOST} * max(0.0, 1.0 - (@now - e.ts) / ${RECENT_MS}.0)), f.rowid DESC
    LIMIT @limit`).all({
    match,
    rooms: JSON.stringify(search.rooms),
    before: search.before ?? null,
    now: Date.now(),
    limit,
  }) as Row[];
  return rows.map((row) => ({ eventId: row.id, roomId: row.room_id, roomTitle: row.room_title, actor: row.actor, ts: row.ts, ...highlight(row.snip) }));
}

function highlight(marked: string): { snippet: string; highlights: [number, number][] } {
  let snippet = "";
  const highlights: [number, number][] = [];
  let start = -1;
  for (const ch of marked) {
    if (snippet.length >= SNIPPET_MAX) break;
    if (ch === OPEN) start = snippet.length;
    else if (ch === CLOSE) { if (start >= 0 && snippet.length > start) highlights.push([start, snippet.length]); start = -1; }
    else snippet += ch;
  }
  if (start >= 0 && snippet.length > start) highlights.push([start, snippet.length]);
  return { snippet, highlights };
}

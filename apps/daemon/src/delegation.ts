import type { HandleIndex } from "./handles.js";

export const MAX_HOPS = 3;
export const MAX_FANOUT = 3;

export interface Delegation {
  target: string;
  task: string;
}

// A delegation line starts with @name followed by end-of-line, whitespace, ":" or ",".
const START = /^\s*@([A-Za-z0-9_-]+)(?=$|[\s:,])(.*)$/;

/**
 * Parses `@handle task` lines out of a bot's output. `handles` maps a current or retired handle (lowercase) to a stable bot id;
 * the returned target is always that id. Without an index, names address ids. Pure: membership and self checks happen here.
 */
export function parseDelegations(text: string, members: string[], selfId: string, handles: HandleIndex = new Map(members.map((id) => [id.toLowerCase(), id]))): Delegation[] {
  const blocks: { name: string; lines: string[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = START.exec(line);
    if (m) {
      blocks.push({ name: m[1], lines: [m[2].replace(/^\s*[:,]?\s*/, "")] });
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].lines.push(line);
    }
  }

  const out: Delegation[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (out.length >= MAX_FANOUT) break;
    const lower = block.name.toLowerCase();
    if (lower === "everyone") continue;
    const target = handles.get(lower);
    if (!target || target === selfId || !members.includes(target) || seen.has(target)) continue;
    const task = block.lines.join("\n").trim();
    if (!task) continue;
    seen.add(target);
    out.push({ target, task });
  }
  return out;
}

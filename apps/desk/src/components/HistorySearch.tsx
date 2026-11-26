import { useEffect, useState, type ReactNode } from "react";
import { MessageSquareText } from "lucide-react";
import { messageOf, type Api, type HistorySearchResult } from "../api";
import type { BotInfo } from "../types";
import { CommandGroup, CommandItem } from "./ui/command";

type Search = { query: string; results: HistorySearchResult[]; error: string | null; done: boolean };

/** Plain-text snippet with the server's [start, end) ranges wrapped in <mark>; overlapping or out-of-range ranges are skipped. */
function highlighted(snippet: string, ranges: [number, number][]): ReactNode[] {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (start < at || end <= start || end > snippet.length) continue;
    if (start > at) parts.push(snippet.slice(at, start));
    parts.push(<mark key={start} className="rounded-sm bg-primary/15 text-foreground">{snippet.slice(start, end)}</mark>);
    at = end;
  }
  if (at < snippet.length) parts.push(snippet.slice(at));
  return parts;
}

function when(ts: number) {
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

/** Message results for the desk search command, in the server's relevance order (cmdk does not filter them). */
export function HistorySearchGroup({ api, query, bots, onOpen }: { api: Api; query: string; bots: BotInfo[]; onOpen: (result: HistorySearchResult) => void }) {
  const q = query.trim();
  const [search, setSearch] = useState<Search | null>(null);
  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.historySearch({ q }, controller.signal).then(
        ({ results }) => setSearch({ query: q, results, error: null, done: true }),
        (err) => { if (!controller.signal.aborted) setSearch({ query: q, results: [], error: messageOf(err), done: true }); },
      );
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, q]);
  if (!q) return null;
  // Keep the previous results on screen while the next query runs, so typing does not flash an empty list.
  const current = search?.query === q ? search : null;
  const results = current?.results ?? search?.results ?? [];
  const status = current?.error ?? (!current ? "Searching messages…" : current.results.length === 0 ? "No messages match." : null);
  return <CommandGroup heading="Messages" forceMount>
    {status && <div role="status" className="px-2 py-1.5 text-sm text-muted-foreground">{status}</div>}
    {results.map((result) => {
      const speaker = result.actor === "user" ? "You" : bots.find((bot) => bot.id === result.actor)?.name ?? result.actor;
      return <CommandItem key={result.eventId} forceMount value={`message ${result.eventId}`} onSelect={() => onOpen(result)} className="items-start">
        <MessageSquareText className="mt-0.5 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground">{result.roomTitle}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{speaker}</span>
            <span className="ml-auto shrink-0 tabular-nums">{when(result.ts)}</span>
          </span>
          <span className="line-clamp-2 break-words">{highlighted(result.snippet, result.highlights)}</span>
        </span>
      </CommandItem>;
    })}
  </CommandGroup>;
}

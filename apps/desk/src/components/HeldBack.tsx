import { Badge } from "./ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemHeader, ItemTitle } from "./ui/item";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { messageOf, type Api } from "../api";
import type { WakeDecision } from "../types";

const WHY: Record<string, string> = {
  budget: "budget used",
  active_hours: "outside active hours",
  dedupe: "repeat within the dedupe window",
  urgency: "below the urgency threshold",
  invalid: "unreadable output",
};

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Pings the bot wanted to send that the wake filter held back today, with a way to say it got one wrong. */
export function HeldBack({ api }: { api: Api }) {
  const [rows, setRows] = useState<WakeDecision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getWakeDecisions(100).then(
      (r) => !cancelled && setRows(r.decisions),
      (err: unknown) => !cancelled && setError(messageOf(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function flag(id: number) {
    setBusy(id);
    setError(null);
    try {
      await api.sendWakeFeedback(id);
      setRows((prev) => prev?.map((d) => (d.id === id ? { ...d, feedback: "should_have_pinged" } : d)) ?? prev);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  const now = Date.now();
  const held = (rows ?? []).filter((d) => d.verdict === "ping" && d.decision !== "ping" && sameDay(d.ts, now));

  return <div className="flex min-w-0 flex-col gap-4">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {rows === null && !error && <div role="status" aria-label="Loading held-back alerts" className="flex flex-col gap-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
    {rows !== null && held.length === 0 && <Empty><EmptyHeader><EmptyTitle>Nothing held back today</EmptyTitle><EmptyDescription>Alerts held by your notification rules will appear here.</EmptyDescription></EmptyHeader></Empty>}
    {held.length > 0 && <ItemGroup>{held.map(d => <Item key={d.id} variant="outline" className="items-start">
      <ItemHeader className="flex-wrap"><ItemTitle>{d.botId} · {new Date(d.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</ItemTitle><Badge variant="attention">{d.decision === 'digest' ? 'Held for brief' : 'Held back'}</Badge></ItemHeader>
      <ItemContent className="min-w-0 basis-full"><p className="m-0 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{d.reason}</p>{d.suppressedBy && <p className="m-0 text-sm text-muted-foreground">{WHY[d.suppressedBy] ?? d.suppressedBy}</p>}</ItemContent>
      <ItemActions>{d.feedback === "should_have_pinged" ? <Badge variant="success" role="status">Noted</Badge> : <Button type="button" variant="outline" size="sm" disabled={busy === d.id} onClick={() => void flag(d.id)}>Should have pinged</Button>}</ItemActions>
    </Item>)}</ItemGroup>}
  </div>;
}

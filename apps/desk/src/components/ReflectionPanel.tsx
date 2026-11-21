import { Alert, AlertDescription } from "./ui/alert";
import { useUnsavedChanges } from "../unsaved-changes";
import { Switch } from "./ui/switch";
import { useEffect, useRef, useState } from "react";
import { messageOf, type Api } from "../api";
import type { BotInfo, ReflectionDetail, ReflectionRun, ReflectionSettings, ReflectionStatus } from "../types";
import { relativeTime } from "./DevicesPanel";

import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { SelectField, SelectItem } from "./ui/select";
import { defaultLabel } from "../lib/defaultBot";
import { ProactiveCard } from "./ProactiveCard";

import { ChevronRightIcon, RefreshCwIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function RunStatus({ status }: { status: string }) {
  const variant = status === "finished" ? "success" : status === "running" ? "attention" : status === "empty" ? "secondary" : "destructive";
  const label = status === "finished" ? "Completed" : status === "empty" ? "No changes" : status === "running" ? "Running" : status === "invalid" ? "Invalid output" : status === "interrupted" ? "Interrupted" : "Failed";
  return <Badge variant={variant}>{label}</Badge>;
}

function runDate(run: ReflectionRun) {
  return new Date(`${run.localDate.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ReflectionPanel({ api, canManage = false }: { api: Api; canManage?: boolean }) {
  const pending = useRef(false);
  const [setting, setSetting] = useState<ReflectionSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("");
  const [botId, setBotId] = useState("");
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<ReflectionRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<ReflectionRun | null>(null);
  const [detail, setDetail] = useState<ReflectionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (!selected) return;
    let cancelled = false;
    api.getReflectionRun(selected.id).then(value => {
      if (!cancelled) setDetail(value);
    }, err => { if (!cancelled) setDetailError(messageOf(err)); });
    return () => { cancelled = true; };
  }, [api, selected]);

  useUnsavedChanges(!!setting && (enabled !== setting.enabled || time !== setting.time || botId !== (setting.botId ?? "")), busy);

  // Loads the saved setting and runs. Only called once on mount, so unsaved edits are never overwritten.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status: ReflectionStatus = await api.getReflection();
        if (cancelled) return;
        setSetting(status.setting);
        setEnabled(status.setting.enabled);
        setTime(status.setting.time);
        setBotId(status.setting.botId ?? "");
        setRunning(status.running);
        setRuns(status.runs);
      } catch (err) {
        if (!cancelled) setLoadError(messageOf(err));
      }
      api.listBots().then(({ bots: list }) => !cancelled && setBots(list), () => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Refreshes only the run state, never the form fields.
  async function refreshRuns() {
    setRefreshing(true);
    try {
      const status = await api.getReflection();
      setRunning(status.running);
      setRuns(status.runs);
    } catch (err) {
      setError(`Could not refresh runs. ${messageOf(err)}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function save() {
    if (!setting || pending.current) return;
    if (!TIME.test(time)) {
      setNotice(null);
      setError("Time must be HH:MM, 24-hour (for example 02:30).");
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { botId: _old, ...rest } = setting;
      const value: ReflectionSettings = { ...rest, enabled, time, ...(botId ? { botId } : {}) };
      await api.putSetting("reflection", value);
      const fresh = await api.getReflection();
      if (fresh.setting.enabled !== enabled || fresh.setting.time !== time) throw new Error("The server returned different settings. Reload to review them.");
      setSetting(fresh.setting);
      setNotice("Saved.");
    } catch (err) {
      setError(`Operation was not confirmed. Your draft is kept. ${messageOf(err)}`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function runNow() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.runReflection();
      setNotice("Run started. Memories save automatically; skill drafts wait for approval in the bot’s conversation.");
      setRunning(true);
      await refreshRuns();
    } catch (err) {
      setError(`Operation was not confirmed. Your draft is kept. ${messageOf(err)}`);
      await refreshRuns();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!setting && !loadError) return <p className="text-muted-foreground">Loading reflection...</p>;
  if (!setting) {
    return (
      <Alert variant="destructive" className="mt-1.5 text-destructive"><AlertDescription>
        Could not load reflection: {loadError}
      </AlertDescription></Alert>
    );
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
    <ProactiveCard
      title="Nightly reflection"
      description="Each night a bot reviews the day and saves memories automatically. Skill changes wait in the bot’s conversation for approval. Off by default."
      action={<Switch aria-label="Enable nightly reflection" disabled={busy || !canManage} checked={enabled} onCheckedChange={v => { setEnabled(v); setNotice(null); }} />}
    >
      <FieldGroup>
        <FieldGroup className="sm:grid sm:grid-cols-2">
          <Field><FieldLabel htmlFor="reflection-bot">Bot</FieldLabel><SelectField id="reflection-bot" className="w-full min-h-11 max-w-full"value={botId} disabled={busy || !canManage} onValueChange={(value) => { setBotId(value); setNotice(null); }}><SelectItem value="">{defaultLabel(bots)}</SelectItem>{bots.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectField></Field>
          <Field><FieldLabel htmlFor="reflection-time">Time (HH:MM)</FieldLabel><Input id="reflection-time" type="time" value={time} disabled={busy || !canManage} onChange={e => { setTime(e.target.value); setNotice(null); }} /></Field>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void save()} disabled={busy || !canManage}>Save</Button>
          <Button variant="outline" type="button" onClick={() => void runNow()} disabled={busy || running || !canManage}>Run now</Button>
          {running && <span className="text-muted-foreground">A run is in progress.</span>}
          {notice && <span className="mt-0 mb-2 text-muted-foreground [overflow-wrap:anywhere]" role="status">{notice}</span>}
        </div>
        {error && <Alert variant="destructive" className="mt-1.5 text-destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      </FieldGroup>
    </ProactiveCard>
    <ProactiveCard title="Recent runs" description="Review what your agent found during its last 10 reflections."
      action={<Button variant="ghost" size="icon-sm" aria-label="Refresh runs" disabled={busy || refreshing} onClick={() => void refreshRuns()}><RefreshCwIcon /></Button>}>
      {runs.length === 0 ? <Empty><EmptyHeader><EmptyTitle>No runs yet</EmptyTitle><EmptyDescription>Your reflections will appear here after the first run.</EmptyDescription></EmptyHeader></Empty> :
        <Table>
          <TableHeader><TableRow><TableHead>Reflection</TableHead><TableHead>Results</TableHead><TableHead><span className="sr-only">Details</span></TableHead></TableRow></TableHeader>
          <TableBody>{runs.map(run => <TableRow key={run.id}>
            <TableCell><div className="flex flex-col items-start gap-2 py-1">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center"><span>{runDate(run)}</span><RunStatus status={run.status} /></div>
              <span className="text-xs text-muted-foreground">{run.localDate.includes("#manual-") ? "Manual" : "Scheduled"} · {relativeTime(run.startedAt, now)}</span>
            </div></TableCell>
            <TableCell><div className="flex flex-col gap-1">
              {run.memoryProposals + run.skillProposals > 0 ? <><span>{run.memoryProposals} memory {run.memoryProposals === 1 ? "note" : "notes"}</span><span className="text-xs text-muted-foreground">{run.skillProposals} skill {run.skillProposals === 1 ? "proposal" : "proposals"}</span></> : <span className="text-muted-foreground">{run.status === "empty" ? "Nothing new" : run.status === "running" ? "In progress" : "No results"}</span>}
            </div></TableCell>
            <TableCell className="text-right"><Button variant="ghost" size="icon-sm" aria-label={`View reflection for ${runDate(run)}`} onClick={() => setSelected(run)}><ChevronRightIcon /></Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
    </ProactiveCard>
    <Sheet open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      <SheetContent size="wide" className="min-h-0">
        <SheetHeader className="pr-14"><SheetTitle>Reflection details</SheetTitle><SheetDescription>{selected && `${runDate(selected)} · ${selected.localDate.includes("#manual-") ? "Manual run" : "Scheduled run"}`}</SheetDescription></SheetHeader>
        <Separator />
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6 [overflow-wrap:anywhere]">
          {selected && <><div className="flex flex-wrap items-center gap-3"><RunStatus status={selected.status} /><span className="text-sm text-muted-foreground">{new Date(selected.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}{selected.finishedAt !== null && ` · ${Math.max(0, Math.round((selected.finishedAt - selected.startedAt) / 1000))}s`}</span></div>
          <p className="m-0 text-sm text-muted-foreground">Recorded: {selected.memoryProposals} memory {selected.memoryProposals === 1 ? "note" : "notes"} · {selected.skillProposals} skill {selected.skillProposals === 1 ? "proposal" : "proposals"}</p></>}
          {detailError ? <Alert variant="destructive"><AlertDescription>{detailError}</AlertDescription></Alert> : !detail ? <div role="status" aria-label="Loading reflection details" className="flex flex-col gap-3"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-20 w-full" /></div> : <>
            {detail.botId && <p className="m-0 text-sm text-muted-foreground">Agent: {bots.find(bot => bot.id === detail.botId)?.name ?? detail.botId}</p>}
            {detail.proposals === null || detail.proposals.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{selected?.status === "running" ? "Reflection in progress" : detail.proposals === null ? "No retained detail" : "Nothing new to keep"}</EmptyTitle><EmptyDescription>{selected?.status === "running" ? "Close this panel and refresh runs after it finishes." : detail.proposals === null ? "No valid proposal content is available for this run." : "The agent returned no memory notes or skill drafts."}</EmptyDescription></EmptyHeader></Empty> : <>
              <section className="flex flex-col gap-3"><h3 className="m-0 text-sm font-medium">Proposed memory notes</h3>
                {detail.proposals.filter(p => p.kind === "memory_append").map((p, i) => <p key={i} className="m-0 whitespace-pre-wrap rounded-lg border p-4 text-sm leading-relaxed">{p.text}</p>)}
                {!detail.proposals.some(p => p.kind === "memory_append") && <p className="m-0 text-sm text-muted-foreground">No memory notes proposed.</p>}
              </section>
              {detail.proposals.some(p => p.kind === "skill") && <section className="flex flex-col gap-3"><h3 className="m-0 text-sm font-medium">Proposed skills</h3>{detail.proposals.filter(p => p.kind === "skill").map((p, i) => <div key={i} className="flex flex-col gap-2 rounded-lg border p-4"><h4 className="m-0 text-sm font-medium">{p.name}</h4><p className="m-0 text-sm text-muted-foreground">{p.description}</p><p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">{p.body}</p></div>)}</section>}
            </>}
          </>}
        </div>
      </SheetContent>
    </Sheet>
    </div>
  );
}

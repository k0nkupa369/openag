import { useEffect, useRef, useState } from 'react';
import { Search, RefreshCw, Plug, LoaderCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { messageOf, type Api } from '../api';
import type { ProactiveRun, ProactiveService, ProactiveStatus } from '../types';
import { useUnsavedChanges } from '../unsaved-changes';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from './ui/field';
import { Input } from './ui/input';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty';
import { Item, ItemContent, ItemGroup, ItemHeader, ItemTitle } from './ui/item';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { hrefFor } from '../route';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { ProactiveCard } from './ProactiveCard';

const time = (value: number | null) => value ? new Date(value).toLocaleString() : 'Not yet';
const serviceNames: Record<string, string> = {outlook: 'Outlook', gmail: 'Gmail', github: 'GitHub', _composio: 'Composio', composio: 'Composio'};
const serviceName = (id: string) => Object.hasOwn(serviceNames, id) ? serviceNames[id] : id.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
const names: Record<string, string> = { checked: 'Checked', no_new_items: 'No new items', quiet: 'No alert needed', incomplete: 'Incomplete', unavailable: 'Could not check', unsupported: 'No supported check', needs_sign_in: 'Needs sign-in', not_checked: 'Not checked', not_started: 'Not checked', permission_missing: 'Read access missing', rate_limited: 'Rate limited', running: 'Checking', interrupted: 'Interrupted', cancelled: 'Cancelled', ping: 'Alert posted', digest: 'Held for brief', suppressed: 'Held back' };
function stateVariant(state: string): 'success' | 'attention' | 'destructive' | 'secondary' {
  if (['checked', 'no_new_items', 'quiet', 'ping'].includes(state)) return 'success';
  if (['unavailable', 'interrupted', 'permission_missing'].includes(state)) return 'destructive';
  if (['cancelled'].includes(state)) return 'secondary';
  return 'attention';
}

export function ProactiveSources({ api, canManage = false }: { api: Api; canManage?: boolean }) {
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [choices, setChoices] = useState<ProactiveService[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'search' | 'save' | null>(null);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const dirty = !!status && JSON.stringify([...selected].sort()) !== JSON.stringify(status.services.map(service => service.id).sort());
  useUnsavedChanges(dirty, busy);
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    api.getProactive().then(value => { if (active) { setStatus(value); setChoices(value.services); setSelected(value.services.map(service => service.id)); } }, err => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, [api, canManage]);

  async function search() {
    if (pending.current || query.trim().length < 2) return;
    pending.current = true; setBusy(true); setAction('search'); setError(null); setNote(null);
    try {
      const result = await api.searchProactive(query.trim());
      setChoices(previous => [...new Map([...previous, ...result.services].map(service => [service.id, service])).values()]);
      if (!result.services.length) setNote('No matching services found.');
    } catch (err) { setError(messageOf(err)); }
    finally { pending.current = false; setBusy(false); setAction(null); }
  }
  async function save() {
    if (!status || pending.current) return;
    pending.current = true; setBusy(true); setAction('save'); setError(null); setNote(null);
    try { const value = await api.saveProactive(status.revision, selected); setStatus(value); setNote('Saved.'); }
    catch (err) { setError(messageOf(err)); }
    finally { pending.current = false; setBusy(false); setAction(null); }
  }
  if (!canManage) return <ProactiveCard title="Services to check" description="Choose services through Composio. All connected accounts are included."><p className="m-0 text-sm text-muted-foreground">Needs an owner or full-access device.</p></ProactiveCard>;
  return <ProactiveCard title="Services to check" description="Choose services through Composio. All connected accounts are included." action={<Badge variant="secondary">Composio</Badge>} footer={<>
<p className="text-sm text-muted-foreground" aria-live="polite">{selected.length} {selected.length === 1 ? 'service' : 'services'} selected{dirty ? ' · Unsaved changes' : ''}</p><div className="flex flex-wrap items-center gap-3">{note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}<Button type="button" onClick={() => void save()} disabled={!status || !dirty || busy}>{action === 'save' && <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}Save services</Button></div>
    </>}>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!status && !error && <div role="status" aria-label="Loading services" className="flex flex-col gap-3"><Skeleton className="h-11 w-full" /><Skeleton className="h-16 w-full" /></div>}
    <form onSubmit={event => { event.preventDefault(); void search(); }}><FieldGroup className="flex-row flex-wrap items-end gap-2">
      <Field className="min-w-0 flex-1" data-disabled={busy || !status}><FieldLabel htmlFor="proactive-service-search">Find a service</FieldLabel><Input id="proactive-service-search" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} placeholder="Service name" disabled={busy || !status} /></Field>
      <Button type="submit" variant="secondary" disabled={busy || !status || query.trim().length < 2}>{action === 'search' ? <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Search data-icon="inline-start" />}Search</Button>
    </FieldGroup></form>
    {!!choices.length && <FieldSet disabled={busy}><FieldLegend variant="label">Composio services</FieldLegend><FieldGroup>{choices.map(service => <Field key={service.id} orientation="horizontal" data-disabled={busy}>
      <Checkbox id={`proactive-service-${service.id}`} checked={selected.includes(service.id)} onCheckedChange={checked => { setSelected(previous => checked ? [...previous, service.id] : previous.filter(id => id !== service.id)); setNote(null); }} />
      <FieldContent className="min-w-0"><FieldLabel htmlFor={`proactive-service-${service.id}`}>{serviceName(service.id)}</FieldLabel><FieldDescription>{service.check ?? 'No supported check yet'}</FieldDescription></FieldContent>
      {service.connected === false && <Badge variant="attention">Needs connection</Badge>}
    </Field>)}</FieldGroup></FieldSet>}
    {status && !choices.length && <Empty><EmptyHeader><EmptyMedia variant="icon"><Plug /></EmptyMedia><EmptyTitle>No services selected.</EmptyTitle><EmptyDescription>Search for a service to start checking it.</EmptyDescription></EmptyHeader></Empty>}
  </ProactiveCard>;
}

export function ProactiveHistory({ api, canManage = false }: { api: Api; canManage?: boolean }) {
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ProactiveRun | null>(null);
  const [page, setPage] = useState(0);
  const mounted = useRef(true);
  async function refresh() {
    setLoading(true);
    try { const value = await api.getProactive(); if (mounted.current) { setStatus(value); setError(null); setPage(0); } }
    catch (err) { if (mounted.current) setError(messageOf(err)); }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; if (canManage) void refresh(); return () => { mounted.current = false; }; }, [api, canManage]);
  const accounts = status?.accounts ?? [];
  const attention = accounts.filter(account => ['needs_sign_in','permission_missing','unavailable','unsupported','incomplete','rate_limited','interrupted'].includes(account.status));
  const groups = [...new Set(accounts.map(account => account.service))];
  const accountLabel = (run: ProactiveRun) => `${serviceName(run.service)}${run.accountId ? ` · ${accounts.find(account => account.service === run.service && account.accountId === run.accountId)?.alias ?? run.accountId}` : ''}`;
  const runs = status?.runs ?? [];
  const visibleRuns = runs.slice(page * 10, page * 10 + 10);
  if (!canManage) return <ProactiveCard title="Service checks" description="Current account coverage."><p className="m-0 text-sm text-muted-foreground">Check details include mailbox excerpts and need an owner or full-access device.</p></ProactiveCard>;
  return <div className="flex min-w-0 flex-col gap-5">
    <ProactiveCard title="Service checks" description="Current account coverage." action={<Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>{loading ? <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <RefreshCw data-icon="inline-start" />}Refresh</Button>}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!status && !error && <div role="status" aria-label="Loading check history" className="flex flex-col gap-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
      {status && <>
        <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant={status.checking || !status.enabled || !status.services.length ? 'attention' : 'secondary'}>{status.checking ? 'Checking' : !status.services.length ? 'Not configured' : !status.enabled ? 'Paused' : 'Scheduled'}</Badge><p className="m-0 text-sm text-muted-foreground">{status.enabled && status.services.length ? `Next check: ${time(status.nextCheckAt)}` : !status.services.length ? 'No services selected.' : 'Service checking is paused.'}</p></div>
        {!!attention.length && <Alert><AlertDescription>{attention.length} {attention.length === 1 ? 'account needs' : 'accounts need'} attention.</AlertDescription></Alert>}
        {!accounts.length && <Empty><EmptyHeader><EmptyMedia variant="icon"><Plug /></EmptyMedia><EmptyTitle>No accounts checked yet.</EmptyTitle><EmptyDescription>{status.services.length ? 'Account coverage will appear after the first scheduled check.' : 'Choose services in Schedule to start checking.'}</EmptyDescription></EmptyHeader></Empty>}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">{groups.map(service => <section key={service} aria-label={`${serviceName(service)} account coverage`} className="flex min-w-0 flex-col gap-3"><h3 className="m-0 text-sm font-medium">{serviceName(service)}</h3><ItemGroup>{accounts.filter(account => account.service === service).map(account => <Item key={account.accountId} variant="outline" className="items-start">
          <ItemHeader className="flex-wrap items-start"><ItemTitle className="min-w-0 max-w-full line-clamp-none break-all">{account.alias}</ItemTitle><Badge variant={stateVariant(account.status)}>{names[account.status] ?? account.status}</Badge></ItemHeader>
          <ItemContent className="min-w-0 basis-full">
            {account.reason && <p className="m-0 text-sm [overflow-wrap:anywhere]">{account.reason}</p>}
            <dl className="m-0 grid gap-3 text-sm sm:grid-cols-2"><div className="flex flex-col gap-0.5"><dt className="text-muted-foreground">Last successful read</dt><dd className="m-0">{time(account.lastSuccessAt)}</dd></div><div className="flex flex-col gap-0.5"><dt className="text-muted-foreground">Covered through</dt><dd className="m-0">{time(account.coveredUntil)}</dd></div></dl>
            {['needs_sign_in','permission_missing','unavailable'].includes(account.status) && <a href={hrefFor({kind: 'connectors', integrationId: 'connector:composio'})} className="text-sm underline underline-offset-4">Review connection</a>}
          </ItemContent>
        </Item>)}</ItemGroup></section>)}</div>
      </>}
    </ProactiveCard>
    {status && <ProactiveCard title="Recent checks" description="Recorded outcomes across your selected accounts." footer={runs.length > 10 ? <><p className="m-0 text-sm text-muted-foreground" role="status">{page * 10 + 1}–{Math.min(page * 10 + 10, runs.length)} of {runs.length} checks</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft data-icon="inline-start" />Newer</Button><Button variant="outline" size="sm" disabled={(page + 1) * 10 >= runs.length} onClick={() => setPage(value => value + 1)}>Older<ChevronRight data-icon="inline-end" /></Button></div></> : undefined}>
      {!runs.length ? <Empty><EmptyHeader><EmptyTitle>No recent checks</EmptyTitle><EmptyDescription>Recorded checks will appear here after the first run.</EmptyDescription></EmptyHeader></Empty> : <Table>
        <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="hidden sm:table-cell">Result</TableHead><TableHead><span className="sr-only">Details</span></TableHead></TableRow></TableHeader>
        <TableBody>{visibleRuns.map(run => <TableRow key={run.id}>
          <TableCell className="w-full max-w-0 whitespace-normal sm:w-3/5"><div className="flex min-w-0 flex-col items-start gap-1.5 py-1"><span className="[overflow-wrap:anywhere]">{accountLabel(run)}</span><span className="text-xs text-muted-foreground">{time(run.startedAt)}</span><div className="flex flex-wrap items-center gap-2 sm:hidden"><Badge variant={stateVariant(run.status)}>{names[run.status] ?? run.status}</Badge><span className="text-xs text-muted-foreground">{run.items} examined</span></div></div></TableCell>
          <TableCell className="hidden sm:table-cell"><div className="flex flex-col items-start gap-1.5"><Badge variant={stateVariant(run.status)}>{names[run.status] ?? run.status}</Badge><span className="text-xs text-muted-foreground">{run.items} {run.items === 1 ? 'item' : 'items'} examined</span></div></TableCell>
          <TableCell className="w-12 text-right"><Button variant="ghost" size="icon-sm" aria-label={`View check: ${accountLabel(run)}, ${time(run.startedAt)}`} onClick={() => setSelected(run)}><ChevronRight /></Button></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </ProactiveCard>}
    <Sheet open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><SheetContent size="wide" className="min-h-0">
      <SheetHeader className="pr-14"><SheetTitle>Check details</SheetTitle><SheetDescription className="[overflow-wrap:anywhere]">{selected && accountLabel(selected)}</SheetDescription></SheetHeader><Separator />
      {selected && <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-3"><Badge variant={stateVariant(selected.status)}>{names[selected.status] ?? selected.status}</Badge><span className="text-sm text-muted-foreground">{selected.items} new {selected.items === 1 ? 'item' : 'items'} examined</span></div>
        {selected.reason && <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">{selected.reason}</p>}
        <dl className="m-0 grid gap-4 text-sm sm:grid-cols-2"><div className="flex flex-col gap-1"><dt className="text-muted-foreground">Started</dt><dd className="m-0">{time(selected.startedAt)}</dd></div><div className="flex flex-col gap-1"><dt className="text-muted-foreground">Finished</dt><dd className="m-0">{selected.endedAt === null ? 'Not finished' : time(selected.endedAt)}</dd></div>{selected.fromAt !== null && selected.untilAt !== null && <div className="flex flex-col gap-1 sm:col-span-2"><dt className="text-muted-foreground">Requested window</dt><dd className="m-0">{time(selected.fromAt)} – {time(selected.untilAt)}</dd></div>}</dl>
        <Separator />
        <section className="flex flex-col gap-3"><h3 className="m-0 text-sm font-medium">Evidence</h3>{selected.evidence.length ? selected.evidence.map(item => <div key={item.id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-4"><p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p><p className="m-0 break-all text-xs text-muted-foreground">{item.reference || item.id}</p></div>) : <Empty><EmptyHeader><EmptyTitle>No evidence recorded</EmptyTitle><EmptyDescription>This check has no retained item excerpts.</EmptyDescription></EmptyHeader></Empty>}</section>
      </div>}
    </SheetContent></Sheet>
  </div>;
}

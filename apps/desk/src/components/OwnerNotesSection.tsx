import { useEffect, useRef, useState } from "react";
import { messageOf, type Api } from "../api";
import type { OwnerNotes } from "../types";
import { useUnsavedChanges } from "../unsaved-changes";
import { SettingsSection } from "./SettingsLayout";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup } from "./ui/item";
import { Skeleton } from "./ui/skeleton";
import { Spinner } from "./ui/spinner";
import { Textarea } from "./ui/textarea";

/** Each non-empty line of the file is one note; the list shows it without its Markdown bullet. */
const notesOf = (text: string) => text.split("\n").filter(line => line.trim()).map(line => ({ line, label: line.replace(/^\s*[-*]\s+/, "") }));

function withoutLine(text: string, line: string) {
  const lines = text.split("\n");
  const index = lines.indexOf(line);
  if (index >= 0) lines.splice(index, 1);
  return lines.join("\n");
}

export function OwnerNotesSection({ api, canManage }: { api: Api; canManage: boolean }) {
  const [notes, setNotes] = useState<OwnerNotes | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.getOwnerNotes().then(n => { if (!cancelled) setNotes(n); }, err => { if (!cancelled) setError(messageOf(err)); });
    return () => { cancelled = true; };
  }, [api]);

  const dirty = draft !== null && draft !== notes?.text;
  useUnsavedChanges(dirty, busy !== null);

  async function write(key: string, next: (current: string) => Promise<string>, done: string) {
    if (pending.current || !canManage) return;
    pending.current = true; setBusy(key); setError(null); setSaved(null);
    try {
      await api.putOwnerNotes(await next(notes?.text ?? ""));
      setNotes(await api.getOwnerNotes());
      setDraft(null); setSaved(done);
    } catch (err) { setError(messageOf(err)); }
    finally { pending.current = false; setBusy(null); }
  }

  // Removal reads the file again first so a note saved meanwhile (by reflection) is kept.
  const remove = (line: string) => write(line, async () => withoutLine((await api.getOwnerNotes()).text, line), "Note removed.");
  const list = notes ? notesOf(notes.text) : [];

  return <SettingsSection icon="memory" title="Owner notes" description="Facts about you that every agent sees.">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!canManage && <p className="m-0 text-sm text-muted-foreground">Full access is required to change owner notes.</p>}
    {notes === null && !error && <div role="status" aria-label="Loading owner notes" className="flex flex-col gap-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
    {notes && draft === null && (list.length === 0
      ? <Empty className="border border-dashed"><EmptyHeader><EmptyTitle>No owner notes yet</EmptyTitle><EmptyDescription>Nightly reflection adds what agents learn about you, or add notes yourself.</EmptyDescription></EmptyHeader></Empty>
      : <ItemGroup role="list" aria-label="Owner notes">{list.map(({ line, label }, index) => <Item key={`${index}:${line}`} role="listitem" variant="outline" size="sm">
          <ItemContent className="min-w-0"><p className="m-0 text-sm leading-relaxed [overflow-wrap:anywhere]">{label}</p></ItemContent>
          {canManage && <ItemActions><Button type="button" variant="ghost" size="sm" aria-label={`Remove note: ${label}`} disabled={busy !== null} onClick={() => void remove(line)}>{busy === line ? <><Spinner data-icon="inline-start" />Removing…</> : "Remove"}</Button></ItemActions>}
        </Item>)}</ItemGroup>)}
    {notes && draft !== null && <>
      <label className="sr-only" htmlFor="owner-notes-text">Owner notes text</label>
      <Textarea id="owner-notes-text" disabled={busy !== null} className="min-h-48 resize-y font-mono text-[13px] leading-5" rows={10} value={draft} onChange={event => { setDraft(event.target.value); setSaved(null); }} spellCheck={false} />
      <p className="m-0 text-sm text-muted-foreground">One note per line. Notes cannot contain secrets.</p>
    </>}
    {notes && canManage && <div className="flex flex-wrap items-center gap-3">
      {draft === null
        ? <Button type="button" variant="outline" disabled={busy !== null} onClick={() => { setDraft(notes.text); setSaved(null); setError(null); }}>Edit notes</Button>
        : <>
          <Button type="button" disabled={!dirty || busy !== null} onClick={() => void write("edit", async () => draft, "Owner notes saved.")}>{busy === "edit" ? <><Spinner data-icon="inline-start" />Saving…</> : "Save notes"}</Button>
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => { setDraft(null); setError(null); }}>Cancel</Button>
        </>}
      <span className="grow" />
      <span className="font-mono text-xs text-muted-foreground">Prompt head: {notes.headTokens} of {notes.headCap} tokens</span>
    </div>}
    {saved && <p role="status" className="m-0 text-sm text-muted-foreground">{saved}</p>}
  </SettingsSection>;
}

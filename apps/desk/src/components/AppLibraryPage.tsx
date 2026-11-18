import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "./ui/item";
import { Field, FieldLabel } from "./ui/field";
import { IntegrationDetails, IntegrationMark, IntegrationStatus } from "./IntegrationDetails";
import { useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, Server } from "lucide-react";
import { useSessionDraft } from "../session-draft";
import { hrefFor } from "../route";
import { messageOf, type Api } from "../api";
import { useAppLibrary } from "../app-library";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { AddMcpServerButton } from "./McpServerDialog";
import { Input } from "./ui/input";


function InventoryControls({ api, manageLink = false }: { api: Api; manageLink?: boolean }) {
  const inventory = useAppLibrary();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  async function run(kind: "status" | "apps" | "mcp") {
    setBusy(kind); setError(null); setNotice(null);
    try {
      if (kind === "apps") await api.reloadApps();
      if (kind === "mcp") await api.reloadMcp();
      if (!await inventory.refresh()) throw new Error("Current status could not be read. The last snapshot is shown; no operation was retried.");
      setNotice(kind === "status" ? "Inventory refreshed." : kind === "apps" ? "App folders reloaded." : "MCP reconnection checked.");
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(null); }
  }
  return <div className="library-controls">
    <div className="library-actions">
      {manageLink && <Button variant="outline" size="sm" nativeButton={false} render={<a href={hrefFor({kind: "connectors"})} />}>Manage connections{inventory.data && <Badge variant="secondary">{inventory.data.entries.filter(entry => entry.installed && entry.id !== "connector:gmail" && entry.id !== "connector:drive").length}</Badge>}<ArrowUpRight data-icon="inline-end" /></Button>}
      <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void run("status")}><RefreshCw data-icon="inline-start" />{busy === "status" ? "Refreshing…" : "Refresh status"}</Button>
      <Button variant="outline" size="sm" disabled={!!busy || !!inventory.error || !inventory.data?.appsDir} onClick={() => void run("apps")}>{busy === "apps" ? "Reloading…" : "Reload app folders"}</Button>
      <Button variant="outline" size="sm" disabled={!!busy || !!inventory.error || !inventory.data?.configPath} onClick={() => void run("mcp")}>{busy === "mcp" ? "Reconnecting…" : "Reconnect all MCP"}</Button>
    </div>
    {notice && !inventory.error && <p role="status" className="library-meta">{notice}</p>}
    {error && <Alert variant="destructive"><AlertTitle>Could not complete the request</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
  </div>;
}

function LibraryEntries({ api, installedOnly, integrationId }: { api: Api; installedOnly: boolean; integrationId?: string }) {
  const { data, error } = useAppLibrary();
  const [search, setSearch] = useSessionDraft(`integration-${installedOnly ? "manage" : "browse"}-search`);
  const opener = useRef<HTMLElement | null>(null);
  const entries = (data?.entries ?? []).filter(entry => entry.id !== "connector:gmail" && entry.id !== "connector:drive");
  const query = search.trim().toLocaleLowerCase();
  const filtered = entries.filter(entry => (!installedOnly || entry.installed) &&
    `${entry.name} ${entry.description} ${entry.runtimeId}`.toLocaleLowerCase().includes(query));
  const selected = entries.find(entry => entry.id === integrationId);
  const current = selected && (!installedOnly || selected.installed) ? selected : undefined;
  const destination = installedOnly ? "connectors" : "app-library";
  const suffix = installedOnly ? "installed" : "browse";
  return <Dialog open={!!current} onOpenChange={open => { if (!open) window.location.hash = hrefFor({kind: destination}); }}>
    <div className="library-filters">
      <Field><FieldLabel htmlFor={`library-search-${suffix}`}>Search apps and MCP servers</FieldLabel><Input id={`library-search-${suffix}`} placeholder="Search by name or purpose…" value={search} onChange={e => setSearch(e.target.value)} /></Field>
    </div>
    <p className="library-meta" aria-live="polite">{filtered.length} {filtered.length === 1 ? "listing" : "listings"}{installedOnly ? " installed" : " available to browse"} · {data?.machine ?? "Checking machine…"}</p>
    {filtered.length ? <div className="library-groups">{(["Apps", "MCP servers"] as const).map(group => {
      const items = filtered.filter(entry => (entry.runtimeId === "apple-apps" || entry.kind !== "mcp" ? "Apps" : "MCP servers") === group);
      return items.length ? <section key={group} aria-label={group}><h2 className="library-group-title">{group}</h2><ItemGroup className="library-grid">
      {items.map(entry => <Item key={entry.id} variant="outline" size="sm" render={<a href={hrefFor({kind: !installedOnly && entry.installed ? "connectors" : destination, integrationId: entry.id})} onClick={event => { opener.current = event.currentTarget; }} />}>
        <ItemMedia><IntegrationMark entry={entry} /></ItemMedia>
        <ItemContent className="min-w-0"><ItemTitle>{entry.name}</ItemTitle><ItemDescription>{entry.tools.length} {entry.tools.length === 1 ? "tool" : "tools"}</ItemDescription></ItemContent>
        <ItemActions><IntegrationStatus entry={entry} stale={!!error} /></ItemActions>
      </Item>)}
    </ItemGroup></section> : null;
    })}</div> : <Empty><EmptyHeader><EmptyTitle>{search ? "No matching integrations" : "No integrations added yet"}</EmptyTitle><EmptyDescription>{installedOnly ? "Browse the app library for supported examples. Local setup is managed on the OpenAg machine." : "Try another search."}</EmptyDescription></EmptyHeader></Empty>}
    {integrationId && data && !current && <Alert><AlertTitle>{selected ? "Integration not added" : "Integration not found"}</AlertTitle><AlertDescription>{selected ? <>This integration has not been added. <a className="underline" href={hrefFor({kind: "app-library", integrationId: selected.id})}>View setup in App library</a></> : <>This integration is no longer in the current inventory. <a className="underline" href={hrefFor({kind: destination})}>Close details</a></>}</AlertDescription></Alert>}
    {current && <IntegrationDetails key={current.id} api={api} entry={current} machine={data?.machine ?? "OpenAg machine"} inventoryError={!!error} managing={installedOnly} returnFocus={() => opener.current?.isConnected ? opener.current : document.getElementById(`library-search-${suffix}`)} />}
  </Dialog>;
}

function InventoryState() {
  const { data, error, loading } = useAppLibrary();
  return <>{loading && <p className="library-meta" role="status">Checking installed integrations…</p>}{error && <Alert variant="destructive"><AlertTitle>Could not refresh inventory</AlertTitle><AlertDescription>{error}{data ? " Showing the last received snapshot. Refresh status before managing an integration." : " Use Refresh status to try again."}</AlertDescription></Alert>}</>;
}

export function AppLibraryPage({ api, integrationId }: { api: Api; integrationId?: string }) {
  const { data } = useAppLibrary();
  return <section className="page library-page" aria-labelledby="app-library-title">
    <header className="page-head"><div><h1 id="app-library-title">App library</h1><p className="page-intro">Tools and connections for your OpenAg machine.</p></div><span className="library-machine"><Server aria-hidden="true" size={16} />{data?.machine ?? "Checking machine…"}</span></header>
    <InventoryControls api={api} manageLink /><InventoryState />
    {data && <LibraryEntries api={api} installedOnly={false} integrationId={integrationId} />}
  </section>;
}

export function InstalledConnections({ api, integrationId }: { api: Api; integrationId?: string }) {
  const { data } = useAppLibrary();
  return <div className="library-connections">
    <div className="library-connections-head"><p className="library-meta">{data ? `${data.entries.filter(entry => entry.installed && entry.id !== "connector:gmail" && entry.id !== "connector:drive").length} added integrations · ${data.machine}` : "Checking machine…"}</p><a href="#/app-library" className={buttonVariants({ variant: "outline", size: "sm" })}>Browse app library<ArrowUpRight data-icon="inline-end" /></a></div>
    <AddMcpServerButton api={api} />
    <InventoryControls api={api} /><InventoryState />{data && <LibraryEntries api={api} installedOnly integrationId={integrationId} />}
  </div>;
}

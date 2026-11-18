import { useEffect, useMemo, useState } from 'react';
import { hrefFor } from '../route';
import type { Api } from '../api';
import type { AgentRequest, BotInfo, LedgerEvent } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { RequestDetails } from './RequestDetails';
import { ActivityTrace, isActivity } from './ActivityTrace';
import { Bot, LoaderCircle } from 'lucide-react';
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceIcon, TraceLine, TraceTitle } from './ui/trace';

/** Settled requests shown before "Show earlier"; outstanding requests are never hidden. */
export const SETTLED_REQUEST_LIMIT = 5;
/** Characters of a settled request's result shown before "Show full answer". */
export const SETTLED_RESULT_CHARS = 600;
const SETTLED = new Set(['completed','failed','cancelled','expired','interrupted']);
export function isSettledRequest(r:AgentRequest){return SETTLED.has(r.status)&&!r.pendingInteractionIds.length&&r.delivery!=='pending';}

export function WorkingIndicator({ids,bots}:{ids:readonly string[];bots:readonly BotInfo[]}) {
  const names = new Intl.ListFormat('en', {style:'long',type:'conjunction'}).format(ids.map(id=>bots.find(bot=>bot.id===id)?.name??id));
  return <TraceLine role="status"><TraceIcon><LoaderCircle className="animate-spin motion-reduce:animate-none" /></TraceIcon><TraceTitle>{names} {ids.length===1?'is':'are'} working…</TraceTitle></TraceLine>;
}

export function AgentRequestsPanel({api,roomId,events,bots,workingBotIds=[],waitingBotIds=[],canManage=false}:{canManage?:boolean;api:Api;roomId:string;events:readonly LedgerEvent[];bots:readonly BotInfo[];workingBotIds?:readonly string[];waitingBotIds?:readonly string[]}) {
  const [stored,setStored]=useState<AgentRequest[]>([]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null),[showAll,setShowAll]=useState(false),[expanded,setExpanded]=useState<ReadonlySet<string>>(new Set());
  useEffect(()=>{let active=true;void api.agentRequests(roomId).then(r=>{if(active)setStored(r.requests);}).catch(()=>{if(active)setError('Could not load agent requests.');});return()=>{active=false;};},[api,roomId]);
  const requests=useMemo(()=>{
    const rows=new Map(stored.map(r=>[r.id,r]));
    for(const event of events)if(event.type==='agent_request'){const r=event.payload as AgentRequest;if(!rows.has(r.id)||rows.get(r.id)!.revision<r.revision)rows.set(r.id,r);}
    const ordered=[...rows.values()].sort((a,b)=>a.createdAt-b.createdAt);
    return ordered.filter(r=>!(r.status==='completed'&&r.delivery==='delivered'&&!r.pendingInteractionIds.length));
  },[stored,events]);
  async function cancel(id:string){setBusy(id);setError(null);try{const {request}=await api.cancelAgentRequest(roomId,id);setStored(rows=>[...rows.filter(r=>r.id!==id),request]);}catch{setError('Could not cancel the agent request.');}finally{setBusy(null);}}
  const activeRequests=requests.filter(r=>r.status==='running'&&!r.pendingInteractionIds.length&&!waitingBotIds.includes(r.recipientId));
  const workingIds=[...new Set([...workingBotIds,...activeRequests.map(r=>r.recipientId)])];
  if(!requests.length&&!error&&!workingIds.length)return null;
  const details=(rows:readonly AgentRequest[])=><Trace>{rows.map(r=>{
      const active=r.status==='accepted'||r.status==='running';
      const variant=r.status==='cancelled'?'secondary':r.status==='failed'||r.status==='expired'||(r.delivery==='failed'&&r.status!=='interrupted')?'destructive':r.status==='completed'?'success':'attention';
      const label=r.pendingInteractionIds.length?'Needs input':r.status==='completed'?(r.delivery==='pending'?'Findings ready':r.delivery==='failed'?'Answer not delivered':'Answered'):r.status==='accepted'?'Queued':r.status==='running'?'Working':r.status[0].toUpperCase()+r.status.slice(1);
      const activity=events.filter(event=>event.roomId===roomId&&isActivity(event)&&(event.payload as {turnId?:string}|null)?.turnId===r.id);
      return <TraceCollapsible key={r.id} defaultOpen={r.status==='completed'&&r.delivery==='pending'}>
        <TraceCollapsibleTrigger><TraceLine status={r.status==='failed'||r.status==='expired'?'error':active?'running':undefined}>
          <TraceIcon><Bot /></TraceIcon><TraceTitle>{bots.find(b=>b.id===r.recipientId)?.name??r.recipientId}</TraceTitle><Badge variant={variant} role="status">{label}</Badge>
        </TraceLine></TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="flex flex-col gap-3">
          {r.result&&(()=>{const clip=isSettledRequest(r)&&r.result.length>SETTLED_RESULT_CHARS&&!expanded.has(r.id);return <div className="flex flex-col items-start gap-1">
            <p className="whitespace-pre-wrap break-words text-sm">{clip?`${r.result.slice(0,SETTLED_RESULT_CHARS).trimEnd()}…`:r.result}</p>
            {clip&&<Button variant="link" size="sm" className="h-auto px-0" onClick={()=>setExpanded(ids=>new Set(ids).add(r.id))}>Show full answer</Button>}
          </div>;})()}
          {!!activity.length&&<ActivityTrace events={activity} bots={bots} api={api} canManage={canManage}/>}
          <div className="flex flex-wrap items-center gap-2">
            {(active||(r.kind==='consultation'&&r.delivery==='pending'&&!['cancelled','expired','interrupted'].includes(r.status)))&&<Button variant="ghost" size="sm" disabled={busy===r.id} onClick={()=>void cancel(r.id)}>Cancel</Button>}
            {canManage&&!!r.pendingInteractionIds.length&&<Button variant="ghost" size="sm" render={<a href={hrefFor({kind:"room",roomId})}/>}>Open Conversation</Button>}
            {canManage&&<RequestDetails api={api} turnId={r.id} originRoomId={roomId}/>}
          </div>
        </TraceCollapsibleContent>
      </TraceCollapsible>;})}</Trace>;
  return <div className="flex flex-col gap-2" aria-label="Agent requests">
    {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!!workingIds.length&&(activeRequests.length?<Trace><TraceCollapsible>
      <TraceCollapsibleTrigger><WorkingIndicator ids={workingIds} bots={bots}/></TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{details(activeRequests)}</TraceCollapsibleContent>
    </TraceCollapsible></Trace>:<Trace><WorkingIndicator ids={workingIds} bots={bots}/></Trace>)}
    {(()=>{
      const rest=requests.filter(r=>!activeRequests.includes(r));
      const settled=rest.filter(isSettledRequest);
      const hidden=showAll?0:Math.max(0,settled.length-SETTLED_REQUEST_LIMIT);
      const hiddenIds=new Set(settled.slice(0,hidden).map(r=>r.id));
      return <>
        {hidden>0&&<Button variant="ghost" size="sm" className="self-start" onClick={()=>setShowAll(true)}>Show {hidden} earlier {hidden===1?'request':'requests'}</Button>}
        {details(rest.filter(r=>!hiddenIds.has(r.id)))}
      </>;
    })()}
  </div>;
}

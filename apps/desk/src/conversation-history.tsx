import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messageOf, type Api } from './api';
import { mergeEvents } from './ledger';
import { useStream } from './stream';
import type { ConversationState, LedgerEvent, TranscriptPage } from './types';

export type ReadingPosition = {messageId:string;offset:number}|{latest:true};
interface History {
  events:LedgerEvent[]; activityRowIds:Record<number,string>; before:number|null; cursor:number; ready:boolean;
  state:ConversationState; position?:ReadingPosition;
}
const Cache = createContext<Map<string,{history:History;bytes:number}>|null>(null);

/** In-memory only; changing the authenticated API replaces the entire cache. */
export function ConversationCacheProvider({api,children}:{api:Api;children:ReactNode}) {
  const cache = useMemo(()=>new Map<string,{history:History;bytes:number}>(),[api]);
  return <Cache.Provider value={cache}>{children}</Cache.Provider>;
}

function updateState(state:ConversationState, event:LedgerEvent):ConversationState {
  if (event.id<=state.throughId) return state;
  const p = (event.payload ?? {}) as {turnId?:string;workId?:string;status?:string};
  let {runningTurns,work} = state;
  if (event.type==='turn_started' && p.turnId) runningTurns=[...runningTurns.filter(t=>t.id!==p.turnId),{id:p.turnId,botId:event.actor}];
  if (event.type==='turn_finished' && p.turnId) runningTurns=runningTurns.filter(t=>t.id!==p.turnId);
  if (event.type==='work_updated' && p.workId) {
    work=work.filter(w=>w.workId!==p.workId);
    if (p.status && ['working','needs_input','needs_approval'].includes(p.status)) work=[...work,{workId:p.workId,botId:event.actor,status:p.status}];
  }
  return {throughId:event.id,runningTurns,work};
}

/** Context above a search hit so the reader sees what led to it. */
const ANCHOR_OFFSET=96;

/**
 * One owner for recent history, older pages, and gap-safe reconnect synchronization.
 * With `messageId` the first read is the page ending at that event, followed by every later event, so the
 * window stays contiguous for live updates; the cache is bypassed and the reader lands on the message.
 */
export function useLedger(api:Api,roomId:string,messageId?:number) {
  const cache = useContext(Cache);
  const {subscribe} = useStream();
  const [history] = useState<History>(()=>{
    const saved=messageId===undefined?cache?.get(roomId)?.history:undefined;
    return saved??{events:[],activityRowIds:{},before:null,cursor:0,ready:false,state:{throughId:0,runningTurns:[],work:[]},
      ...(messageId!==undefined?{position:{messageId:`event-${messageId}`,offset:ANCHOR_OFFSET}}:{})};
  });
  const [snapshot,setSnapshot] = useState(()=>({...history}));
  const [error,setError] = useState<string|null>(null);
  const [loading,setLoading] = useState(!history.ready);
  const [syncing,setSyncing] = useState(true);
  const [loadingOlder,setLoadingOlder] = useState(false);
  const [controls] = useState(()=>({retry:()=>{},more:()=>{}}));
  const retry=useCallback(()=>controls.retry(),[controls]);
  const more=useCallback(()=>controls.more(),[controls]);
  const remember=useCallback((position:ReadingPosition)=>{history.position=position;},[history]);
  const [initialPosition] = useState(history.position);

  useEffect(()=>{
    cache?.delete(roomId);
    let cancelled=false,fetching=false,queued=false,older=false;
    let pending:LedgerEvent[]=[];
    const publish=()=>{if(!cancelled)setSnapshot({...history});};
    const apply=(events:LedgerEvent[])=>{
      history.events=mergeEvents(history.events,events);
      for(const event of [...events].sort((a,b)=>a.id-b.id)) history.state=updateState(history.state,event);
    };
    const accept=(page:TranscriptPage)=>{
      history.state=page.state;
      apply(page.events);
      // Events received during the request may be newer than its snapshot.
      apply(pending);pending=[];
    };
    const sync=async()=>{
      if(fetching){queued=true;return;}
      fetching=true;
      if(!cancelled)setSyncing(true);
      try{
        do{
          queued=false;
          let page:TranscriptPage;
          const incoming:LedgerEvent[]=[];
          const initial=!history.ready;
          let cursor=history.cursor,earlier:number|null=null,first=initial;
          if(initial&&messageId!==undefined){
            const opening=await api.transcript(roomId,{before:messageId+1});
            if(cancelled)return;
            incoming.push(...opening.events);
            earlier=opening.before;cursor=messageId;first=false;
          }
          do{
            page=await api.transcript(roomId,first?{}:{after:cursor});
            first=false;
            if(cancelled)return;
            incoming.push(...page.events);
            cursor=page.after;
          }while(page.hasMore&&!cancelled);
          // A reconnect batch is one history update, not a replay of live output.
          accept({...page,events:incoming});
          if(initial) history.before=messageId!==undefined?earlier:page.before;
          history.cursor=cursor;
          history.ready=true;
          publish();
        }while(queued&&!cancelled);
        if(!cancelled)setError(null);
      }catch(err){if(!cancelled)setError(messageOf(err));}
      finally{fetching=false;if(!cancelled){setLoading(false);setSyncing(false);if(queued)void sync();}}
    };
    const loadOlder=async()=>{
      if(older||history.before===null)return;
      older=true;setLoadingOlder(true);
      try{
        const page=await api.transcript(roomId,{before:history.before});
        if(cancelled)return;
        // Older history must not overwrite current execution state.
        history.events=mergeEvents(history.events,page.events);
        history.before=page.before;
        publish();setError(null);
      }catch(err){if(!cancelled)setError(messageOf(err));}
      finally{older=false;if(!cancelled)setLoadingOlder(false);}
    };
    controls.retry=()=>void sync();controls.more=()=>void loadOlder();
    const off=subscribe({onOpen:()=>void sync(),onEvent:event=>{
      if(cancelled||event.roomId!==roomId)return;
      if(fetching||!history.ready)pending.push(event);
      if(history.ready){apply([event]);publish();}
    }});
    void sync();
    return ()=>{
      cancelled=true;off();controls.retry=()=>{};controls.more=()=>{};
      if(!cache||!history.ready)return;
      const bytes=JSON.stringify(history).length*2;
      cache.delete(roomId);
      if(bytes<=10*1024*1024)cache.set(roomId,{history,bytes});
      let size=[...cache.values()].reduce((sum,item)=>sum+item.bytes,0);
      while(cache.size>5||size>10*1024*1024){const key=cache.keys().next().value!;size-=cache.get(key)!.bytes;cache.delete(key);}
    };
  },[api,roomId,messageId,subscribe,cache,history,controls]);
  return {...snapshot,error,loading,syncing,loadingOlder,retry,more,initialPosition,remember};
}

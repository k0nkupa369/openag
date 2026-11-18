import { useCallback, useEffect, useRef, useState } from "react";
import { messageOf, type Api } from "./api";
import { mergeApprovals } from "./approvals-state";
import type { Route } from "./route";
import { useStream } from "./stream";
import type {  Approval, BotInfo, Decision, LedgerEvent, Room } from "./types";

export { useLedger } from "./conversation-history";

export function useRoom(api: Api, roomId: string | null) {
  const { subscribe } = useStream();
  const retryRef = useRef<() => void>(() => {});
  const retry = useCallback(() => retryRef.current(), []);
  const [state, setState] = useState<{ requestedRoomId: string | null; room: Room | null; bots: BotInfo[]; error: string | null; loading: boolean }>({
    requestedRoomId: roomId, room: null, bots: [], error: null, loading: roomId !== null,
  });
  useEffect(() => {
    let cancelled = false;
    let version = 0;
    setState({ requestedRoomId: roomId, room: null, bots: [], error: null, loading: roomId !== null });
    if (roomId === null) return;
    const load = async () => {
      const request = ++version;
      try {
        const res = await api.getRoom(roomId);
        if (!cancelled && request === version) setState({ requestedRoomId: roomId, room: res.room, bots: res.bots, error: null, loading: false });
      } catch (err) {
        if (!cancelled && request === version) setState((prev) => ({ ...prev, error: messageOf(err), loading: false }));
      }
    };
    retryRef.current = () => void load();
    void load();
    const off = subscribe({ onOpen: () => void load(), onEvent: event => { if (event.type === "config" && event.payload && typeof event.payload === "object" && "action" in event.payload && (event.payload.action === "bot_settings" || event.payload.action === "bot_model" || event.payload.action === "bot_handle_changed" || event.payload.action === "room_updated" || event.payload.action === "room_router_changed")) void load(); } });
    return () => { cancelled = true; retryRef.current = () => {}; off(); };
  }, [api, roomId, subscribe]);
  if (state.requestedRoomId !== roomId) return { room: null, bots: [], error: null, loading: roomId !== null, retry };
  const { requestedRoomId: _requested, ...result } = state;
  return { ...result, retry };
}

export function useRooms(api: Api, route?: Route): Room[] {
  const [rooms, setRooms] = useState<Room[]>([]);
  const { subscribe } = useStream();
  useEffect(() => {
    let cancelled = false;
    let loading=false,queued=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{
      if(loading){queued=true;return;}
      loading=true;
      try{const res=await api.listRooms();if(!cancelled)setRooms(res.rooms);}
      catch{ /* The active room reports load failures. Keep the last known navigation. */ }
      finally{loading=false;if(queued&&!cancelled){queued=false;void load();}}
    };
    const schedule=()=>{if(timer===undefined)timer=setTimeout(()=>{timer=undefined;void load();},100);};
    void load();
    const off = subscribe({
      onOpen: schedule,
      onEvent: (event) => { if (["config","message","bot_output","conversation_read"].includes(event.type)) schedule(); },
    });
    return () => { cancelled = true; clearTimeout(timer); off(); };
  }, [api, route, subscribe]);
  return rooms;
}

export const APPROVAL_EVENTS = new Set<LedgerEvent['type']>(['approval_requested','approval_decided']);

export function useApprovals(api: Api) {
  const { subscribe } = useStream();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const version = useRef(0);
  const active = useRef(true);
  const deciding = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    if (!active.current) return;
    const request = ++version.current;
    try {
      const res = await api.listPending();
      if (request !== version.current) return;
      setApprovals((prev) => mergeApprovals(prev, res.approvals));
      setError(null);
    } catch (err) {
      if (request === version.current) setError(messageOf(err));
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    active.current = true;
    setLoading(true);
    void refresh();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const schedule=()=>{if(timer===undefined)timer=setTimeout(()=>{timer=undefined;void refresh();},300);};
    const off=subscribe({onOpen:schedule,onEvent:event=>{if(APPROVAL_EVENTS.has(event.type))schedule();}});
    return () => { active.current = false; clearTimeout(timer); ++version.current; off(); };
  }, [refresh, subscribe]);
  const decide = useCallback(async (id: string, decision: Decision) => {
    if (deciding.current.has(id)) throw new Error("This decision is already being submitted. Please wait.");
    deciding.current.add(id);
    try { await api.decide(id, decision); }
    finally { await refresh(); deciding.current.delete(id); }
  }, [api, refresh]);
  return { approvals,  error, loading, refresh, decide };
}

/** Keep the agent list available outside a room; reuse the shared stream on reconnect. */
export function useBots(api: Api, route: Route): BotInfo[] {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const { subscribe } = useStream();
  useEffect(() => {
    let cancelled = false;
    let version = 0;
    const load = () => { const request = ++version; return api.listBots().then((res) => { if (!cancelled && request === version) setBots(res.bots); }, () => {}); };
    void load();
    const off = subscribe({ onOpen: () => void load(), onEvent: event => { if (event.type === "config" && event.payload && typeof event.payload === "object" && "action" in event.payload && (["bot_settings", "bot_model", "bot_created", "bot_handle_changed"].includes(String(event.payload.action)))) void load(); } });
    return () => { cancelled = true; off(); };
  }, [api, route, subscribe]);
  return bots;
}

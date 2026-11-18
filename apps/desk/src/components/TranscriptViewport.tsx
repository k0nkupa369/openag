import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ReadingPosition } from '../conversation-history';
import { MessageScrollerViewport, useMessageScroller } from './ui/message-scroller';

/** Save a reader anchor; the shared scroller still owns following and prepending. */
export function TranscriptViewport({children,initialPosition,onPosition,onAtLatest,unreadStart,onSeenUnread}:{children:ReactNode;initialPosition?:ReadingPosition;onPosition?:(position:ReadingPosition)=>void;onAtLatest?:()=>void;unreadStart?:number|null;onSeenUnread?:(id:number)=>void}) {
  const viewport=useRef<HTMLDivElement>(null);
  const {scrollToMessage,scrollToEnd}=useMessageScroller();
  const [restored,setRestored]=useState(!initialPosition);
  const landed=useRef(!initialPosition);
  const remember=()=>{
    const el=viewport.current;
    if(!el||!landed.current)return;
    if(!document.hidden&&unreadStart){
      const row=el.querySelector<HTMLElement>(`[data-message-id="event-${unreadStart}"] [role="article"]`), bounds=el.getBoundingClientRect(), visible=row?.getBoundingClientRect();
      if(visible&&visible.bottom>bounds.top&&visible.top<bounds.bottom)onSeenUnread?.(unreadStart);
    }
    if(el.scrollHeight-el.scrollTop-el.clientHeight<=8){onPosition?.({latest:true});if(!document.hidden)onAtLatest?.();return;}
    const top=el.getBoundingClientRect().top;
    const row=[...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(row=>row.getBoundingClientRect().bottom>top);
    if(row)onPosition?.({messageId:row.dataset.messageId!,offset:row.getBoundingClientRect().top-top});
  };
  useLayoutEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      if(initialPosition && 'messageId' in initialPosition) {
        const content=viewport.current?.querySelector<HTMLElement>('[data-slot="message-scroller-content"]');
        const padding=content?parseFloat(getComputedStyle(content).paddingTop)||0:0;
        if(!scrollToMessage(initialPosition.messageId,{align:'start',scrollMargin:initialPosition.offset-padding,behavior:'instant'}))scrollToEnd({behavior:'instant'});
      }else if(initialPosition)scrollToEnd({behavior:'instant'});
      landed.current=true;setRestored(true);
    });
    return ()=>{cancelAnimationFrame(frame);remember();};
  },[]);
  useEffect(()=>{const frame=requestAnimationFrame(remember);document.addEventListener('visibilitychange',remember);return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',remember);};},[children,onAtLatest,unreadStart,onSeenUnread]);
  return <MessageScrollerViewport ref={viewport} role="log" aria-live="polite" aria-label="Room events" tabIndex={0} onScroll={remember} style={restored?undefined:{visibility:'hidden'}}>{children}</MessageScrollerViewport>;
}

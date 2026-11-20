import type { ReadingPosition } from "../conversation-history";
import { TranscriptViewport } from "./TranscriptViewport";
import { copyText } from "../lib/clipboard";
import { MessageQuote, storedMessageReply } from "./MessageQuote";
import { RequestUsage } from "./RequestUsage";
import { McpInteractionCard } from "./McpInteractionCard";
import { useProfile } from "../profile";
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { activityItems } from "../activity";
import { AvatarPreview } from "./AvatarPreview";
import { BotAvatar } from "./BotAvatar";
import { useHideTechnicalActivity } from "../chat-display";
import { WorkCard } from "./WorkView";
import { SavedResultButton } from "./ResultsPanel";
import type { Api } from "../api";
import { AttachmentChip } from "./AttachmentChip";
import { hrefFor } from "../route";
import { isProminent, summarizeEvent } from "../ledger";
import type { Approval, BotInfo, Decision, LedgerEvent, Room, WorkItem, WorkQuestion } from "../types";
import { ApprovalCard } from "./ApprovalCard";
import { runningBots } from "./RoomRail";
import { avatarColors, avatarFor } from "./avatar-catalogue";
import { ActivityTrace, isActivity } from "./ActivityTrace";
import { Bubble, BubbleContent } from "./ui/bubble";
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "./ui/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider } from "./ui/message-scroller";
import { Skeleton } from "./ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Trace } from "./ui/trace";
import { AgentRequestsPanel, WorkingIndicator } from "./AgentRequestsPanel";
import { Check, Copy, Reply } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { MessageText } from "./MessageText";
import { Badge } from "./ui/badge";
import { Marker, MarkerContent } from "./ui/marker";



export function Feed({ questions = [], onDismissQuestion, dismissingQuestionId, roomId, api, canManage = false, events, works = [], rooms = [], onOpenWork, bots = [], approvals = [], onDecide, loading = false, error = null, requests, onReply, runningBotIds, before, loadingOlder, onOlder, initialPosition, onPosition, onAtLatest, firstUnread, unreadStart, onSeenUnread, activityRowIds }: {
  questions?:readonly WorkQuestion[];
  onDismissQuestion?:(question:WorkQuestion)=>Promise<void>;
  dismissingQuestionId?:string;
  activityRowIds?:Record<number,string>;
  runningBotIds?:readonly string[];
  before?:number|null;
  loadingOlder?:boolean;
  onOlder?:()=>void;
  initialPosition?:ReadingPosition;
  onPosition?:(position:ReadingPosition)=>void;
  onAtLatest?:()=>void;
  firstUnread?:number|null;
  unreadStart?:number|null;
  onSeenUnread?:(id:number)=>void;
  roomId?:string;
  requests?:ReactNode;
  onReply?: (message:LedgerEvent)=>void;
  api?: Api;
  canManage?:boolean;
  works?: readonly WorkItem[];
  rooms?: readonly Room[];
  onOpenWork?: (id:string)=>void;
  events: readonly LedgerEvent[];
  bots?: readonly BotInfo[];
  approvals?: readonly Approval[];
  onDecide?: (id: string, decision: Decision) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}) {
  const { profile } = useProfile();
  const hasEarlierControl=useRef(false);
  const localActivityIds=useRef<Record<number,string>>({});
  if(before != null)hasEarlierControl.current=true;
  const hideTechnicalActivity = useHideTechnicalActivity();
  const activity = useMemo(() => hideTechnicalActivity ? [] : activityItems(events), [events, hideTechnicalActivity]);
  const interactions = new Map<string, LedgerEvent>();
  for (const event of events) {
    const payload = event.payload as { interactionId?: string } | null;
    if (event.type === "mcp_interaction_updated" && typeof payload?.interactionId === "string") interactions.set(payload.interactionId, event);
  }
  const waiting = new Set(approvals.map((approval) => approval.botId));
  const thinking = (runningBotIds ?? runningBots(events)).filter((id) => !waiting.has(id));
  const rows: { id: string; activity?: LedgerEvent[]; event?: LedgerEvent }[] = [];
  for (const event of events) {
    if(event.type==='message'&&(event.payload as {internalConsultation?:boolean}|null)?.internalConsultation)continue;
    const interaction = event.payload as { interactionId?: string; status?: string } | null;
    if (!requests && api && canManage && event.type === "mcp_interaction_updated" && typeof interaction?.interactionId === "string" && interaction.status === "open" && interactions.get(interaction.interactionId) === event) {
      rows.push({ id: `interaction-${interaction.interactionId}`, event });
      continue;
    }
    if (isActivity(event)) {
      if (hideTechnicalActivity) continue;
      const last = rows.at(-1);
      if (last?.activity) last.activity.push(event);
      else rows.push({ id: `activity-${event.id}`, activity: [event] });
    } else if (isProminent(event.type) || event.type === "approval_requested") {
      const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
      if (event.type === "approval_requested" && requests) continue;
      if (event.type === "approval_requested" && !approvals.some((a) => a.id === payload.approvalId)) continue;
      rows.push({ id: `event-${event.id}`, event });
    }
  }
  // Keep an existing run's identity when either end grows, including across revisits.
  const activityIds=activityRowIds??localActivityIds.current;
  const usedActivityIds=new Set<string>();
  for(const row of rows)if(row.activity){
    row.id=row.activity.map(event=>activityIds[event.id]).find(id=>id&&!usedActivityIds.has(id))??row.id;
    if(usedActivityIds.has(row.id))row.id=`${row.id}-${row.activity.at(-1)!.id}`;
    usedActivityIds.add(row.id);
    for(const event of row.activity)activityIds[event.id]=row.id;
  }
  const firstUnreadShown=firstUnread==null?undefined:rows.find(row=>row.event&&row.event.id>=firstUnread)?.event?.id;
  if (loading && events.length === 0) return <div className="flex min-h-0 flex-1 flex-col gap-3 p-8" aria-label="Loading conversation"><Skeleton className="h-5 w-40" /><Skeleton className="h-16 w-full" /></div>;
  return <MessageScrollerProvider autoScroll defaultScrollPosition={initialPosition && 'messageId' in initialPosition ? 'start' : 'end'}>
    <MessageScroller className="min-h-0 flex-1 in-data-[slot=classic-shell]:h-[max(240px,calc(100dvh-360px))] in-data-[slot=classic-shell]:flex-none">
      {hasEarlierControl.current && <Marker variant="border" className="shrink-0 justify-center pt-1"><Button variant="ghost" size="sm" disabled={loadingOlder || before == null} onClick={onOlder}>{loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}</Button></Marker>}
      <TranscriptViewport initialPosition={initialPosition} onPosition={onPosition} onAtLatest={onAtLatest} unreadStart={unreadStart} onSeenUnread={onSeenUnread}>
        <MessageScrollerContent className="mx-auto w-full max-w-[840px] p-8 max-[767px]:px-4 max-[767px]:py-5">
          {rows.length === 0 && before == null && !error && <Empty><EmptyHeader><EmptyTitle>Start a conversation</EmptyTitle><EmptyDescription>Your messages and agent activity will appear here.</EmptyDescription></EmptyHeader></Empty>}
          {rows.map((row) => <MessageScrollerItem key={row.id} messageId={row.id}>
            {firstUnreadShown != null && row.event?.id===firstUnreadShown && <Marker variant="separator"><MarkerContent><Badge variant="attention">New messages</Badge></MarkerContent></Marker>}
            {row.activity ? <ActivityTrace api={api} canManage={canManage} events={row.activity} items={activity} bots={bots} /> : row.event && (() => {
              const event = row.event;
              const bot = event.actor === "user" ? undefined : bots.find((item) => item.id === event.actor);
              const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
              const systemMessage = event.type === "message" && ((event.actor === "primary" && (payload.wake === true || payload.brief === true || !!payload.forkSource)) || (event.actor.startsWith("automation:") && (typeof payload.automationId === "string" || !!payload.forkSource)));
              const avatarBot = systemMessage ? bots.find(item => item.id === rooms.find(room => room.id === event.roomId)?.leadBotId) : bot;
              const avatarName = avatarBot?.id ?? event.actor;
              const pending = event.type === "approval_requested" ? approvals.find((a) => a.id === payload.approvalId) : undefined;
              const reply = storedMessageReply(payload.reply);
              const question=questions.find(item=>item.id===payload.questionId&&item.status==="open");
              const replyable = (event.type === "message" || event.type === "bot_output") && typeof payload.text === "string" && (!!payload.text.trim() || Array.isArray(payload.attachments) && payload.attachments.length > 0);
              const formatted = event.actor !== "user" && (event.type === "bot_output" || event.type === "message");
              const messageWorks = onOpenWork && event.type === 'message' ? works.filter(work=>work.roomId===event.roomId&&work.requestId===event.id) : [];
              const align = event.actor === "user" ? "end" : "start";
              return <Message align={align} role="article" aria-label={`${event.actor === "user" ? profile.name : bot?.name ?? event.actor} message`}>
                {formatted && <MessageAvatar className="self-end mb-7 max-md:mb-11 pointer-coarse:mb-11"><BotAvatar name={avatarName} avatar={avatarBot?.avatar} size={32} still /></MessageAvatar>}
                <MessageContent className={align === "end" ? "items-end" : undefined}>
                  {formatted && <MessageHeader>{bot?.name ?? event.actor}</MessageHeader>}
                  {api && event.type === "mcp_interaction_updated" && typeof payload.interactionId === "string" ? <McpInteractionCard api={api} id={payload.interactionId} onChange={() => {}} /> : event.type === "avatar_preview" ? <AvatarPreview definition={payload.definition} previewId={typeof payload.previewId === "string" ? payload.previewId : undefined} /> : event.type === "avatar_library_updated" ? <p className="text-sm">Added {typeof payload.name === "string" ? payload.name : "avatar"} to the avatar library.</p> : api && event.type === "result_saved" && typeof payload.resultId === "string" && typeof payload.version === "number" && typeof payload.name === "string" ? <SavedResultButton api={api} id={payload.resultId} version={payload.version} name={payload.name}/> : pending && onDecide ? <ApprovalCard approval={pending} onDecide={onDecide} inline botName={bot?.name} />
                    : event.type === "message" && !reply && typeof payload.text === "string" && !payload.text.trim() && Array.isArray(payload.attachments) && payload.attachments.length > 0 ? null
                    : <Bubble align={align} variant={event.type === "error" ? "destructive" : formatted ? "tinted" : "muted"}
                      style={formatted && event.type !== "error" ? { "--primary": avatarColors[avatarBot?.avatar?.color ?? avatarFor(avatarName).color] } as CSSProperties : undefined}>
                      <BubbleContent className={formatted ? undefined : "whitespace-pre-wrap"}>{reply && <div className="mb-2"><MessageQuote reply={reply} bots={bots} /></div>}{formatted ? <MessageText text={summarizeEvent(event)} /> : summarizeEvent(event)}</BubbleContent>
                    </Bubble>}
                  {api&&event.type==='message'&&payload.brief===true&&Array.isArray(payload.resultIds)&&payload.resultIds.filter((id:unknown):id is string=>typeof id==='string').map((id:string)=><SavedResultButton key={id} api={api} id={id} version={1} name="Investigation findings and unsent reply"/>)}
                  {api&&event.type==='message'&&payload.wake===true&&typeof payload.resultId==='string'&&<SavedResultButton api={api} id={payload.resultId} version={1} name="Investigation findings and unsent reply"/>}
                  {api && event.type === "message" && Array.isArray(payload.attachments) && payload.attachments.length > 0 && <div className="flex flex-wrap gap-2">{payload.attachments.map((file: unknown) => {
                    if (!file || typeof file !== "object") return null;
                    const f = file as Record<string, unknown>;
                    return typeof f.id === "string" && typeof f.name === "string" && typeof f.mimeType === "string" && typeof f.bytes === "number" ? <AttachmentChip key={f.id} api={api} roomId={event.roomId} attachment={{ id: f.id, name: f.name, mimeType: f.mimeType, bytes: f.bytes }} /> : null;
                  })}</div>}
                  {Array.isArray(payload.attachmentReferences) && payload.attachmentReferences.every(name => typeof name === "string") && typeof (payload.forkSource as {roomId?:unknown}|undefined)?.roomId === "string" && <p className="text-xs text-muted-foreground">Original attachments: {payload.attachmentReferences.join(", ")} · <a className="underline" href={hrefFor({kind:"room",roomId:(payload.forkSource as {roomId:string}).roomId})}>Open original conversation</a></p>}
                  {onOpenWork && messageWorks.length > 0 && <div className="flex min-w-0 flex-col gap-3">{messageWorks.map(work=><WorkCard key={work.id} item={work} bots={bots} rooms={rooms} onSelect={onOpenWork} compact/>)}</div>}
                  <MessageFooter>{api && canManage && event.type === "bot_output" && typeof payload.turnId === "string" && <RequestUsage api={api} turnId={payload.turnId} />}{(event.type === "message" || event.type === "bot_output") && typeof payload.text === "string" && payload.text && <MessageCopyButton text={payload.text} />}{onReply && replyable && <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-compact" aria-label="Reply to message" onClick={() => onReply(event)} />}><Reply /></TooltipTrigger><TooltipContent>Reply</TooltipContent></Tooltip>}{canManage&&question&&onDismissQuestion&&<Button variant="ghost" size="sm" disabled={!!dismissingQuestionId} onClick={()=>void onDismissQuestion(question)}>{dismissingQuestionId===question.id?"Dismissing…":"Dismiss"}</Button>}<time dateTime={new Date(event.ts).toISOString()}>{new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></MessageFooter>
                </MessageContent>
              </Message>;
            })()}
          </MessageScrollerItem>)}
          {requests && <MessageScrollerItem messageId="conversation-requests">{requests}</MessageScrollerItem>}
          <MessageScrollerItem messageId="working-status">
            {api&&roomId?<AgentRequestsPanel key={roomId} api={api} roomId={roomId} events={events} bots={bots} canManage={canManage} workingBotIds={thinking} waitingBotIds={[...waiting]}/>:!!thinking.length&&<Trace><WorkingIndicator ids={thinking} bots={bots}/></Trace>}
          </MessageScrollerItem>
        </MessageScrollerContent>
      </TranscriptViewport>
      <MessageScrollerButton aria-label="Jump to latest message" />
    </MessageScroller>
  </MessageScrollerProvider>;
}


export function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    setError(false);
    try { await copyText(text); setCopied(true); }
    catch { setCopied(false); setError(true); }
  }
  return <>
    <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-compact" aria-label={copied ? "Copied" : "Copy message"} onClick={() => void copy()} />}>
      {copied ? <Check /> : <Copy />}
    </TooltipTrigger><TooltipContent>{copied ? "Copied" : "Copy message"}</TooltipContent></Tooltip>
    <span role="status" className={error ? undefined : "sr-only"}>{error ? "Could not copy. Select the message text to copy it." : copied ? "Copied" : ""}</span>
  </>;
}

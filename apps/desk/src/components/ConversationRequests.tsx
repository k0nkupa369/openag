import type {Api} from '../api';
import type {Approval,BotInfo,ConversationRequest,Decision,WorkQuestion} from '../types';
import {ApprovalCard} from './ApprovalCard';
import {McpInteractionCard} from './McpInteractionCard';
import {Button} from './ui/button';
import {Alert,AlertDescription} from './ui/alert';
import {Message,MessageAvatar,MessageContent,MessageFooter,MessageHeader} from './ui/message';
import {Bubble,BubbleContent} from './ui/bubble';
import {Badge} from './ui/badge';
import {BotAvatar} from './BotAvatar';

// A management proposal belongs to the daemon; its card names the bot that proposed it.
const proposerOf=(a:Approval)=>a.source==='management-proposal'&&typeof a.payload==='object'&&a.payload!==null&&typeof (a.payload as {proposedBy?:unknown}).proposedBy==='string'?(a.payload as {proposedBy:string}).proposedBy:a.botId;

export function ConversationRequests({onDismiss,dismissingId,api,requests,approvals,bots,onDecide,onReply,visibleQuestions,refresh,error,more,canManage=false}: {onDismiss?:(question:WorkQuestion)=>Promise<void>;dismissingId?:string;api:Api;requests:ConversationRequest[];approvals:Approval[];bots:BotInfo[];onDecide:(id:string,decision:Decision)=>Promise<void>;onReply:(question:WorkQuestion)=>void;visibleQuestions:ReadonlySet<string>;refresh:()=>void;error?:string;more?:()=>void;canManage?:boolean}){
  return <>
    {error&&<Alert variant="destructive"><AlertDescription>Conversation requests: {error} <Button variant="outline" onClick={refresh}>Retry</Button></AlertDescription></Alert>}
    {approvals.map(approval=><Message key={approval.id} align="start"><MessageContent><ApprovalCard approval={approval} api={api} onDecide={onDecide} inline canDecide={canManage} botName={bots.find(bot=>bot.id===proposerOf(approval))?.name}/></MessageContent></Message>)}
    {requests.filter(request=>request.kind!=='provider'||canManage).map(request=>request.kind==='provider'?<Message key={request.id} align="start"><MessageContent><McpInteractionCard api={api} id={request.id} onChange={refresh}/></MessageContent></Message>:request.question&&!visibleQuestions.has(request.id)?<Message key={request.id} align="start" className="mb-4 last:mb-0">
      <MessageAvatar className="self-start mt-6"><BotAvatar name={request.question.botId} avatar={bots.find(bot=>bot.id===request.question!.botId)?.avatar} size={32} still/></MessageAvatar>
      <MessageContent>
        <MessageHeader className="flex-wrap gap-2">{bots.find(bot=>bot.id===request.question!.botId)?.name??request.question.botId}<Badge variant="attention">Unanswered question</Badge></MessageHeader>
        <Bubble variant="outline"><BubbleContent className="whitespace-pre-wrap">{request.question.prompt??request.question.context}</BubbleContent></Bubble>
        <MessageFooter className="gap-2"><time dateTime={new Date(request.at).toISOString()}>{new Date(request.at).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>{canManage&&<><Button variant="ghost" size="sm" onClick={()=>onReply(request.question!)}>Reply</Button>{onDismiss&&<Button variant="ghost" size="sm" disabled={!!dismissingId} onClick={()=>void onDismiss(request.question!)}>{dismissingId===request.id?"Dismissing…":"Dismiss"}</Button>}</>}</MessageFooter>
      </MessageContent>
    </Message>:null)}
    {more&&<Button variant="ghost" onClick={more}>Earlier pending requests</Button>}
  </>;
}

// Standalone gateway/runner and mounted chat acceptance. Disposable data; no external provider.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startFixture} from './bot-models-fixture.mjs';
import {createMcpInteractions} from '../apps/daemon/dist/mcp/interactions.js';
import {getRoom,getBot,createBot,addMember} from '../apps/daemon/dist/rooms.js';
import {createQuestions} from '../apps/daemon/dist/questions.js';
import {requestInputTool} from '../apps/daemon/dist/tools/input.js';
import {toExecutors} from '../apps/daemon/dist/tools/registry.js';
const rootPath=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'openag-bot-models-')),token=randomUUID();
let broker,f;const seen=[];
const options={tools:toExecutors([requestInputTool]),mcpInteractions(db,ledger){return broker=createMcpInteractions(db,ledger,{waitMs:10000});},async runTurn(ctx){
 seen.push({bot:ctx.bot.id,room:ctx.room.id,prompt:ctx.prompt,message:ctx.message.payload,state:ctx.state});
 if(ctx.message.payload.text==='ASK')await ctx.callTool('request_input',{prompt:'Which local option?'});
 else ctx.ledger.append(ctx.room.id,ctx.bot.id,'bot_output',{turnId:ctx.turnId,text:'Received the message.'});
}};
f=await startFixture(dir,token,0,options);
const req=(path,method='GET',body,auth=token)=>fetch(f.url+path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function json(path,method='GET',body){const r=await req(path,method,body);assert.ok(r.ok,path+' '+r.status);return r.json();}
const settle=()=>f.runner.drain();
const requests=(room='main',before)=>json('/rooms/'+room+'/requests'+(before?'?before='+encodeURIComponent(before):''));
const post=(text,replyToQuestion,room='main')=>json('/rooms/'+room+'/messages','POST',{text,...(replyToQuestion?{replyToQuestion}:{})});
const reply=q=>({id:q.id,revision:q.revision});
let questions=createQuestions(f.db,f.ledger);
function oldQuestion(bot='boss',room='main'){
 const message=f.ledger.append(room,'user','message',{text:'Historical request'}),id=randomUUID();
 f.db.prepare("INSERT INTO turns(id,room_id,bot_id,status,state_json,created_at,updated_at) VALUES(?,?,?,'running',?,?,?)").run(id,room,bot,JSON.stringify({messageId:message.id}),Date.now(),Date.now());
 const q=questions.request(null,id,'Earlier question from '+bot+' '+id);f.db.prepare("UPDATE turns SET status='finished' WHERE id=?").run(id);return q;
}
let dom,vite,reactRoot,off;
try{
 await post('ASK');await settle();let page=await requests();assert.equal(page.requests.length,1);const q=page.requests[0].question;
 assert.equal((await json('/rooms/main/events')).events.filter(e=>e.type==='message'&&e.payload.questionId===q.id).length,1,'Question is a bot chat message');
 const limited=(await json('/devices','POST',{name:'Limited fixture'})).token;
 assert.equal((await req('/rooms/main/messages','POST',{text:'A',replyToQuestion:reply(q)},limited)).status,403);
 const dismissible=oldQuestion(),dismissPath='/rooms/main/questions/'+dismissible.id+'/dismiss';
 assert.equal((await req(dismissPath,'POST',{revision:dismissible.revision},limited)).status,403);
 assert.equal((await req(dismissPath.replace('/main/','/second/'),'POST',{revision:dismissible.revision})).status,404);
 assert.equal((await req(dismissPath,'POST',{revision:999})).status,409);
 assert.equal((await req(dismissPath,'POST',{revision:dismissible.revision,answer:'not an answer'})).status,400);
 const beforeDismiss={seen:seen.length,turns:f.db.prepare('SELECT count(*) n FROM turns').get().n};
 const dismissed=await json(dismissPath,'POST',{revision:dismissible.revision});assert.equal(dismissed.question.status,'cancelled');assert.equal(dismissed.question.answer,null);
 assert.equal(seen.length,beforeDismiss.seen);assert.equal(f.db.prepare('SELECT count(*) n FROM turns').get().n,beforeDismiss.turns,'Dismiss must not start an agent turn');
 assert.ok(!(await requests()).requests.some(r=>r.id===dismissible.id),'Dismiss removes only the open reminder');
 assert.ok((await json('/rooms/main/events')).events.some(e=>e.type==='message'&&e.payload.questionId===dismissible.id),'Original question remains in history');
 assert.ok((await json('/rooms/main/events')).events.some(e=>e.type==='config'&&e.payload.action==='question_dismissed'&&e.payload.questionId===dismissible.id));
 assert.equal((await req('/rooms/main/messages','POST',{text:'Too late',replyToQuestion:reply(dismissible)})).status,409);
 assert.equal((await req(dismissPath,'POST',{revision:dismissible.revision})).status,409,'A stale duplicate cannot change the closed question');
 console.log('PASS Dismiss authority, room/revision guards, retained history, no answer/turn and stale-answer refusal.');
 assert.equal((await req('/rooms/second/messages','POST',{text:'A',replyToQuestion:reply(q)})).status,404);
 assert.equal((await req('/rooms/main/messages','POST',{text:'A',replyToQuestion:{...reply(q),revision:99}})).status,409);
 const before=seen.length;await post('Unrelated new message');await settle();assert.equal((await requests()).requests[0].question.status,'open');assert.equal(seen.length,before+1);
 const results=await Promise.all([req('/rooms/main/messages','POST',{text:'A',replyToQuestion:reply(q)}),req('/rooms/main/messages','POST',{text:'A',replyToQuestion:reply(q)})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,202]);await settle();assert.equal(seen.filter(c=>c.message.questionId===q.id).length,1,JSON.stringify({seen:seen.map(c=>({bot:c.bot,questionId:c.message.questionId})),errors:f.ledger.list('main').filter(e=>e.type==='error').map(e=>e.payload)}));assert.ok(seen.at(-1).prompt.includes('Question: Which local option?\nAnswer: A'));
 const upload=await fetch(f.url+'/rooms/main/uploads',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'text/plain','x-file-name':'late.txt'},body:'Late attachment'});assert.equal(upload.status,201);const file=(await upload.json()).attachment;
 assert.equal((await req('/rooms/main/messages','POST',{text:'A',replyToQuestion:reply(q),attachments:[file.id]})).status,409,'Same answer with a new attachment must not silently succeed');assert.equal(f.db.prepare('SELECT message_id FROM uploads WHERE id=?').get(file.id).message_id,null);
 assert.equal((await requests()).requests.length,0);assert.equal((await json('/rooms/main/events')).events.find(e=>e.actor==='user'&&e.payload.questionId===q.id).payload.text,'A','Chat shows the answer, not internal continuation text');
 const later=f.ledger.append('main','user','message',{text:'Later follow-up'});const history=f.ledger.conversationHistory({roomId:'main',botId:'boss',messageId:later.id});assert.ok(history.messages.some(e=>e.actor==='user'&&e.payload.text.includes('Question: Which local option?\nAnswer: A')),'Later model history retains the question-answer relation');assert.equal(f.ledger.get((await requests()).requests[0]?.question?.messageId??later.id).payload.text,'Later follow-up');
 for(const path of ['/attention','/attention/summary','/work/missing/recovery'])assert.equal((await req(path)).status,404);
 assert.equal((await req('/work/missing/recovery','POST',{})).status,404);
 createBot(f.db,{id:'alternate',runtime:'api',model:'openai/gpt-5'});addMember(f.db,'main','alternate');
 const first=oldQuestion(),second=oldQuestion('alternate');await f.runner.withIdleBot('boss',async()=>{});
 await post('Answer the second only',reply(second));await settle();assert.equal(seen.at(-1).bot,'alternate');assert.equal((await requests()).requests[0].id,first.id);
 const legacy=oldQuestion();f.db.prepare("DELETE FROM events WHERE type='message' AND json_extract(payload_json,'$.questionId')=?").run(legacy.id);
 f.runner.recover();await settle();assert.equal((await json('/rooms/main/events')).events.filter(e=>e.type==='message'&&e.payload.questionId===legacy.id).length,1);f.runner.recover();await settle();assert.equal((await json('/rooms/main/events')).events.filter(e=>e.type==='message'&&e.payload.questionId===legacy.id).length,1,'Legacy question publishes once');
 // Actual restart retains open requests without synthesising interruption questions.
 const retained=(await requests()).requests.map(r=>r.id).sort();await f.close();f=await startFixture(dir,token,0,options);questions=createQuestions(f.db,f.ledger);assert.deepEqual((await requests()).requests.map(r=>r.id).sort(),retained);
 for(let i=0;i<32;i++)oldQuestion();let cursor,ids=[];do{const p=await requests('main',cursor);ids.push(...p.requests.map(r=>r.id));cursor=p.nextCursor;}while(cursor);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,34);assert.equal((await requests('second')).requests.length,0);
 const attached=oldQuestion();const attachmentAnswer={text:'Attached answer',replyToQuestion:reply(attached),attachments:[file.id]};assert.equal((await req('/rooms/main/messages','POST',attachmentAnswer)).status,202);await settle();const callsBeforeRetry=seen.length;assert.equal((await req('/rooms/main/messages','POST',attachmentAnswer)).status,200,'An identical attached answer can be retried after a lost response');await settle();assert.equal(seen.length,callsBeforeRetry);
 // Legacy Work reports retain a concrete question once, without turning interruptions into prompts.
 const workMessage=f.ledger.append('main','user','message',{text:'Legacy Work request'}),legacyWork=f.runner.work.begin({roomId:'main',botId:'boss',messageId:workMessage.id});
 f.runner.work.report(legacyWork.workId,{needsInput:true,nextStep:'Which legacy file?'});f.runner.work.updateRun(legacyWork.runId,'interrupted','Historical interruption');
 f.runner.recover();await settle();const legacyRequest=(await requests()).requests.find(r=>r.question?.workId===legacyWork.workId);assert.ok(legacyRequest);assert.equal(legacyRequest.question.context,'Which legacy file?');
 f.runner.recover();await settle();assert.equal((await json('/rooms/main/events')).events.filter(e=>e.type==='message'&&e.payload.questionId===legacyRequest.id).length,1);
 await json('/rooms/main/questions/'+legacyRequest.id+'/dismiss','POST',{revision:legacyRequest.question.revision});f.runner.recover();await settle();assert.equal((await json('/questions/'+legacyRequest.id)).question.status,'cancelled');assert.equal(f.runner.work.get(legacyWork.workId).status,'needs_input','Dismiss does not mark paused Work complete');assert.ok(!(await requests()).requests.some(r=>r.id===legacyRequest.id),'Recovery does not reopen a dismissed question');
 // Provider prompts use the same room-scoped read, retain exact owner response and do not replay.
 const turn=randomUUID();f.db.prepare("INSERT INTO turns(id,room_id,bot_id,status,state_json,created_at,updated_at) VALUES(?,'main','boss','running','{}',?,?)").run(turn,Date.now(),Date.now());
 const controller=new AbortController(),scope={serverId:'fixture',toolName:'READ',context:{dataDir:dir,roomId:'main',botId:'boss',turnId:turn,toolCallId:'provider-call'},valid:()=>true};
 const pending=broker.request(scope,{mode:'form',message:'Allow this provider read?',requestedSchema:{type:'object',properties:{decision:{type:'string',enum:['allow_once','deny']}},required:['decision']}},controller.signal);
 const provider=(await requests()).requests.find(r=>r.kind==='provider');assert.ok(provider);assert.ok(!(await requests('second')).requests.some(r=>r.id===provider.id));const detail=await json('/mcp/interactions/'+provider.id);
 assert.equal((await req('/mcp/interactions/'+provider.id+'/response','POST',{revision:detail.interaction.revision,action:'accept',content:{decision:'allow_once'}},limited)).status,403);
 await json('/mcp/interactions/'+provider.id+'/response','POST',{revision:detail.interaction.revision,action:'accept',content:{decision:'allow_once'}});assert.deepEqual(await pending,{action:'accept',content:{decision:'allow_once'}});f.db.prepare("UPDATE turns SET status='finished' WHERE id=?").run(turn);
 console.log('PASS chat questions, exact/duplicate/stale/limited/cross-room replies, plain messages, restart/history, pagination and provider input.');
 // Mount the actual RoomView with its composer and gateway; the older question stays reachable outside loaded history.
 const require=createRequire(rootPath+'apps/desk/package.json'),{JSDOM}=require('jsdom');dom=new JSDOM('<div id="root"></div>',{url:f.url+'/#/room/main',pretendToBeVisual:true});
 for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','localStorage','sessionStorage'])globalThis[key]=dom.window[key];
 for(const key of ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=dom.window[key].bind(dom.window);
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};globalThis.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 dom.window.matchMedia=globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLElement.prototype.scrollTo=function(){};
 let socket;globalThis.WebSocket=class{constructor(){socket=this;queueMicrotask(()=>this.onopen?.());}close(){}};
 const {createServer}=await import(require.resolve('vite'));vite=await createServer({configFile:false,root:rootPath+'apps/desk',resolve:{alias:{'@':rootPath+'apps/desk/src'}},server:{middlewareMode:true,hmr:false},appType:'custom'});
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{fireEvent}=require('@testing-library/react');
 const {RoomView}=await vite.ssrLoadModule('/src/components/RoomView.tsx'),{StreamProvider}=await vite.ssrLoadModule('/src/stream.tsx'),{ProfileProvider}=await vite.ssrLoadModule('/src/profile.tsx'),{SidebarProvider}=await vite.ssrLoadModule('/src/components/ui/sidebar.tsx'),{createApi}=await vite.ssrLoadModule('/src/api.ts');
 const api=createApi(token,()=>{},(path,init)=>fetch(f.url+path,init)),bots=(await json('/bots')).bots,rooms=(await json('/rooms')).rooms;
 off=f.ledger.subscribe('*',event=>socket?.onmessage?.({data:JSON.stringify(event)}));reactRoot=createRoot(document.getElementById('root'));
 const until=async predicate=>{const end=Date.now()+6000;while(!predicate()){assert.ok(Date.now()<end,'Mounted conversation convergence: '+document.body.textContent);await act(async()=>new Promise(r=>setTimeout(r,20)));}};
 const mount=(canManage=true,client=api)=>act(async()=>reactRoot.render(React.createElement(StreamProvider,{token,onAuthFailure(){}},React.createElement(ProfileProvider,{api:client},React.createElement(SidebarProvider,null,React.createElement(RoomView,{key:String(canManage),api:client,roomId:'main',room:getRoom(f.db,'main'),bots,allBots:bots,rooms,error:null,approvals:[],onDecide(){throw Error('No action approval created');},canManage}))))));
 await mount();
 const replyButton=q=>[...document.querySelectorAll('button')].find(b=>(b.textContent==='Reply'||b.getAttribute('aria-label')==='Reply to message')&&b.closest('[data-slot="message"]')?.textContent.includes(q.prompt));
 const firstMounted=(await requests()).requests.find(request=>request.question?.prompt).question;
 await until(()=>replyButton(firstMounted));await act(async()=>replyButton(firstMounted).click());await until(()=>document.body.textContent.includes('Replying to:'));
 const replyArea=document.querySelector('textarea');
 await act(async()=>fireEvent.blur(replyArea));
 const replyToolbar=document.querySelector('[aria-label="Attach files"]').closest('[data-slot="input-group-addon"]');
 assert.equal(replyArea.value,'','Exercise an empty reply draft');
 assert.equal(replyToolbar.dataset.align,'block-end','An empty unfocused question reply must keep its controls in one footer row');
 assert.ok(!replyToolbar.classList.contains('contents'),'Reply controls must retain their flex container');
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='New message').click());assert.ok(!document.body.textContent.includes('Replying to:'));
 const area=document.querySelector('textarea');await act(async()=>fireEvent.change(area,{target:{value:'A new ordinary message'}}));assert.equal(area.value,'A new ordinary message');
 // A later question must neither capture an unrelated draft nor replace an explicit target.
 let newestQuestion;await act(async()=>{newestQuestion=oldQuestion();});await until(()=>replyButton(newestQuestion));assert.ok(!document.body.textContent.includes('Replying to:'));assert.equal(area.value,'A new ordinary message');
 await act(async()=>replyButton(newestQuestion).click());
 await until(()=>document.body.textContent.includes('Replying to:'));
 const targetText=[...document.querySelectorAll('[role="status"]')].find(e=>e.textContent.startsWith('Replying to:')).textContent;
 let newestAlternate;await act(async()=>{newestAlternate=oldQuestion('alternate');});await until(()=>replyButton(newestAlternate));assert.equal([...document.querySelectorAll('[role="status"]')].find(e=>e.textContent.startsWith('Replying to:')).textContent,targetText);
 await act(async()=>replyButton(newestAlternate).click());await until(()=>document.querySelector('[aria-label="Model settings for alternate"]'));await act(async()=>fireEvent.change(area,{target:{value:'@boss This still answers alternate'}}));assert.ok(document.querySelector('[aria-label="Model settings for alternate"]'),'Reply target owns model controls even when answer mentions the lead');
 const answersBefore=seen.filter(c=>c.message.questionId).length;
 await act(async()=>fireEvent.submit(area.closest('form')));await until(()=>area.value==='');await settle();assert.equal(seen.filter(c=>c.message.questionId).length,answersBefore+1,'Composer submits one explicit continuation');assert.equal(seen.at(-1).bot,'alternate');
 // A failed in-flight answer retains its target despite clicks on another Reply.
 const originalSend=api.sendMessage;let rejectSend;api.sendMessage=()=>new Promise((resolve,reject)=>{rejectSend=reject;});
 await act(async()=>replyButton(newestQuestion).click());await until(()=>document.body.textContent.includes('Replying to:'));await act(async()=>fireEvent.change(area,{target:{value:'Retain target on failure'}}));const heldTarget=[...document.querySelectorAll('[role="status"]')].find(e=>e.textContent.startsWith('Replying to:')).textContent;
 // The transcript now opens a recent window; load the original off-page question before clicking it.
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Load earlier messages').click());await until(()=>replyButton(first));
 const loadedIds=new Set((await requests()).requests.map(r=>r.id));const offPage=questions.get(f.db.prepare("SELECT id FROM work_questions WHERE status='open'").all().find(r=>!loadedIds.has(r.id)).id);const originalGetQuestion=api.getQuestion;let finishLookup;api.getQuestion=()=>new Promise(resolve=>{finishLookup=resolve;});await act(async()=>replyButton(offPage).click());await until(()=>finishLookup);
 await act(async()=>fireEvent.submit(area.closest('form')));await until(()=>rejectSend);await act(async()=>{document.querySelector('[aria-label="Reply to message"]').click();replyButton(first).click();});assert.equal([...document.querySelectorAll('[role="status"]')].find(e=>e.textContent.startsWith('Replying to:')).textContent,heldTarget);
 await act(async()=>rejectSend(Error('Controlled send failure')));await until(()=>document.body.textContent.includes('Controlled send failure'));assert.equal(area.value,'Retain target on failure');assert.equal([...document.querySelectorAll('[role="status"]')].find(e=>e.textContent.startsWith('Replying to:')).textContent,heldTarget);api.sendMessage=originalSend;await act(async()=>finishLookup({question:offPage}));assert.equal([...document.querySelectorAll('[role="status"]')].find(e=>e.textContent.startsWith('Replying to:')).textContent,heldTarget,'A pre-send lookup cannot retarget the failed answer');api.getQuestion=originalGetQuestion;
 // Expiry on another device preserves the composed text on a rejected answer.
 await act(async()=>replyButton(newestQuestion).click());await act(async()=>fireEvent.change(area,{target:{value:'Keep this stale answer'}}));
 await act(async()=>{f.db.prepare("UPDATE work_questions SET status='cancelled' WHERE status='open'").run();});
 await act(async()=>fireEvent.submit(area.closest('form')));await until(()=>document.body.textContent.includes('changed or was closed'));assert.equal(area.value,'Keep this stale answer');
 let dismissDraft;await act(async()=>{dismissDraft=oldQuestion();});await until(()=>replyButton(dismissDraft));
 await act(async()=>replyButton(dismissDraft).click());await act(async()=>fireEvent.change(area,{target:{value:'Keep my draft when dismissed'}}));
 const dismissButton=()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Dismiss'&&button.closest('[data-slot="message"]')?.textContent.includes(dismissDraft.prompt));
 await until(()=>dismissButton());const originalDismiss=api.dismissQuestion;api.dismissQuestion=async()=>{throw Error('Controlled dismiss failure');};
 await act(async()=>dismissButton().click());await until(()=>document.body.textContent.includes('Controlled dismiss failure'));assert.equal(area.value,'Keep my draft when dismissed');assert.ok(document.body.textContent.includes('Replying to:'));
 api.dismissQuestion=originalDismiss;const seenBeforeDismiss=seen.length;await act(async()=>dismissButton().click());await until(()=>!dismissButton()&&!document.body.textContent.includes('Replying to:'));
 assert.equal(area.value,'Keep my draft when dismissed');assert.equal(seen.length,seenBeforeDismiss);assert.equal((await json('/questions/'+dismissDraft.id)).question.status,'cancelled');
 assert.ok(document.body.textContent.includes(dismissDraft.prompt),'Dismissing a visible question retains its original message');
 console.log('PASS mounted Dismiss: exact question, failure feedback, retained draft/history, cleared reply target and no continuation.');
 assert.ok(!document.body.textContent.includes('Send answer & continue'));assert.ok(!document.body.textContent.includes('Mark as reviewed'));assert.ok(!document.body.textContent.includes('Needs you'));
 await act(async()=>{oldQuestion();});const limitedApi=createApi(limited,()=>{},(path,init)=>fetch(f.url+path,init));await mount(false,limitedApi);await until(()=>document.querySelector('[aria-label="Reply to message"]'));assert.ok(!document.body.textContent.includes('Replying to:'));assert.ok(![...document.querySelectorAll('button')].some(button=>button.textContent==='Dismiss'));
 const limitedArea=document.querySelector('textarea');await act(async()=>fireEvent.change(limitedArea,{target:{value:'Limited ordinary message'}}));await act(async()=>fireEvent.submit(limitedArea.closest('form')));await until(()=>limitedArea.value==='');await settle();assert.ok(!seen.at(-1).message.questionId,'A pending question cannot capture Limited-device ordinary messages');
 console.log('PASS mounted chat: question messages/Reply, composer target/New message, stable targets, explicit send, stale draft retention and no Needs you forms.');
}catch(error){console.error(error.stack);throw error;}finally{
 if(reactRoot){const require=createRequire(rootPath+'apps/desk/package.json');await require('react').act(async()=>reactRoot.unmount());}off?.();await vite?.close();dom?.window.close();broker?.close();await f?.close();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}

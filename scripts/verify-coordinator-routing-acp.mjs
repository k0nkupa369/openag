// Bounded real-adapter routing observations using disposable agents and a local gateway.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
if(!process.argv.includes('--real'))throw Error('Use --real to run disposable subscription-adapter routing evaluation.');
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'apps/daemon/package.json'),load=n=>import(root+'apps/daemon/dist/'+n+'.js');
const {serve}=require('@hono/node-server'),{openDb}=await load('db/index'),{createLedger}=await load('ledger'),{createApprovals}=await load('approvals'),{createAuth}=await load('auth'),{createPermissions}=await load('permissions'),{createBot,getBot,createRoom,addMember,getRoom}=await load('rooms'),{setSetting}=await load('settings'),{createRunner}=await load('runtimes/runner'),{createGateway}=await load('gateway'),{createAcpRuntime}=await load('runtimes/acp'),{createMcpAccess}=await load('mcpserver'),{createAgentTools}=await load('tools/agents'),{createWorkTool}=await load('tools/work'),{toExecutors}=await load('tools/registry');
const cases=[
 {name:'greeting',text:'Hi!',expected:'self'},
 {name:'same-session-refresh',text:'Report the marker in your current instructions, then call agent_list and report the coder role.',expected:'refresh',same:true},
 {name:'review-code',text:'Please get an independent review of this payment code, focusing on validation and concurrency. async function refund(order, amount) { if (amount > order.total) throw Error("too much"); await gateway.refund(order.id, amount); order.refunded += amount; await db.save(order); } Report the defects and what evidence is missing.',expected:'consult:coder'},
 {name:'research-question',text:'Please get an independent comparison of these complete excerpts and say which is stronger, including what is missing. Report A, a signed budget dated 1 March, sets the annual operating budget at $20,000. Report B, an unsigned manager email dated 15 April, says the operating budget is now $30,000 but cites no approval. Do not assume facts beyond those excerpts.',expected:'consult:researcher'},
 {name:'design-review',text:'Get an independent review of this screen design: a mobile checkout has a 9px submit button.',expected:'consult:designer'},
 {name:'explicit-self',text:'You do it yourself: explain why 2 plus 2 is 4.',expected:'self'},
 {name:'named-specialist',text:'Ask @coder to review this snippet: return 1 + 1.',expected:'consult:coder'},
 {name:'ongoing-code',text:'We need a persistent CSV export feature implemented with acceptance criteria. Please propose tracked Work for this.',expected:'work:coder'},
 {name:'ongoing-design',text:'We need the onboarding flow redesigned, including screens and a handoff. Please propose tracked Work for this.',expected:'work:designer'},
 {name:'no-suitable',text:'Tune the intonation on my physical grand piano. No agent has that specialty. Explain what you can do.',expected:'no-suitable'},
 {name:'missing-description',text:'I need a specialist in marine engine repair. If no agent describes that role, tell me; do not infer a specialty from a name.',expected:'no-suitable'},
 {name:'busy-specialist',text:'Get the coding specialist to review a tiny code sample: return 42. If that specialist is busy, explain and offer to do it yourself.',expected:'busy',busy:true},
];
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const adapters=['claude','codex'].filter(a=>!arg('--adapter')||arg('--adapter')===a),selected=cases.filter(c=>!arg('--case')||arg('--case')===c.name||(arg('--case')==='same-session-refresh'&&c.name==='greeting'));
if(!adapters.length||!selected.length)throw Error('Unknown adapter or case.');
const out=mkdtempSync(join(tmpdir(),'openag-coordinator-eval-')),results=[];let unsafeNative=false;console.log('Evaluation evidence: '+out);
for(const adapter of adapters){
 const dir=join(out,adapter),db=openDb(dir),ledger=createLedger(db),approvals=createApprovals(db,ledger),permissions=createPermissions(db,ledger,dir,approvals),token=randomUUID(),auth=createAuth({db,ownerToken:token});
 if(!permissions.active())permissions.adopt('read-only',permissions.adoption().reviewVersion,'owner');
 const boss=createBot(db,{id:'coordinator',runtime:'acp',config:{adapter}});setSetting(db,'defaultBot',{botId:boss.id});
 for(const [id,description] of [['coder','Software engineering, code implementation and code review'],['researcher','Research, fact checking and comparison of evidence'],['designer','Product and user interface design and design review'],['mystery','']])createBot(db,{id,runtime:'api',config:{description}});
 const defs=[...createAgentTools(),createWorkTool(db)];let runner,base;
 const access=createMcpAccess({dataDir:dir,runner:{activeTurn:(...a)=>runner.activeTurn(...a)},tools:()=>defs}),acp=createAcpRuntime({dataDir:dir,mcp:{access,baseUrl:()=>base,tools:new Set(defs.map(d=>d.name))}});
 const fake={async runTurn(ctx){ctx.ledger.append(ctx.room.id,ctx.bot.id,'bot_output',{turnId:ctx.turnId,text:'Synthetic specialist findings: review completed; the supplied sample needs attention.'});}};
 runner=createRunner({db,ledger,approvals,permissions,dataDir:dir,runtimes:{acp,api:fake},tools:toExecutors(defs)});const jobs=[];
 const app=createGateway({db,ledger,approvals,permissions,auth,dataDir:dir,agentRequests:runner.agentRequests,work:runner.work,dispatch:a=>{const p=runner.dispatch(a);jobs.push(p);return p;}});
 const server=serve({hostname:'127.0.0.1',port:0,fetch:req=>new URL(req.url).pathname==='/mcp'?access.handle(req):app.fetch(req)});if(!server.listening)await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const request=(path,body)=>fetch(base+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  const choice=await acp.discover(boss,adapter);assert.ok(choice.model);const b=getBot(db,'coordinator');db.prepare('UPDATE bots SET config_json=? WHERE id=?').run(JSON.stringify({...b.config,modelConfig:{model:choice.model}}),'coordinator');let room,priorSession;
  for(const [index,c] of selected.entries()){
   if(!c.same){const id=`eval-${adapter}-${index}`;createRoom(db,{id,name:'Evaluation',leadBotId:boss.id,kind:'direct'});addMember(db,id,boss.id);room=getRoom(db,id);}
   if(c.same){const current=getBot(db,boss.id);db.prepare('UPDATE bots SET config_json=? WHERE id=?').run(JSON.stringify({...current.config,instructions:'When asked, report the marker PROMPT_REFRESH_731.'}),boss.id);}
   let releaseBusy,busyJob;if(c.busy){busyJob=runner.withIdleBot('coder',()=>new Promise(resolve=>{releaseBusy=resolve;}));while(!releaseBusy)await new Promise(r=>setTimeout(r,10));}
   const before=ledger.list(room.id,{limit:1000}).at(-1)?.id??0;
   const unsubscribe=ledger.subscribe(room.id,event=>{if(event.type==='tool_call'&&/^Start subagent /i.test(String(event.payload?.title??''))){unsafeNative=true;runner.shutdown();}});
   const rejectTimer=setInterval(()=>{for(const a of approvals.listPending())try{approvals.resolve(a.id,{kind:'ignore'},a.reviewVersion);}catch{}},50);
   try{
    const response=await request(`/rooms/${room.id}/messages`,{text:c.text});assert.equal(response.status,202);
    let timer;try{await Promise.race([(async()=>{await Promise.all(jobs.splice(0));await runner.idle();})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Adapter deadline; no retry.')),180000);})]);}finally{clearTimeout(timer);}
    const events=ledger.list(room.id,{limit:1000}).filter(e=>e.id>before);const requests=db.prepare('SELECT recipient_id FROM agent_requests WHERE origin_room_id=? AND origin_message_id IN (SELECT id FROM events WHERE id>? AND room_id=?)').all(room.id,before,room.id);
    const reviews=events.filter(e=>e.type==='approval_requested'||e.type==='approval');const texts=events.filter(e=>e.type==='bot_output').map(e=>e.payload.text??'').join('\n');const tools=events.filter(e=>e.type==='tool_call').map(e=>e.payload);
    unsafeNative=tools.some(x=>/^Start subagent /i.test(String(x.title??'')));
    const workProposal=tools.some(x=>String(x.tool??x.toolName??'').includes('create_work'))||reviews.length>0;
    const outcome=requests.length?'consult:'+requests[0].recipient_id:workProposal?'work':'self';
    const turn=db.prepare("SELECT state_json FROM turns WHERE room_id=? AND bot_id='coordinator' ORDER BY created_at ASC,rowid ASC").all(room.id).at(-1);const session=turn?JSON.parse(turn.state_json).acpSessionId:undefined;
    const pass=c.expected==='refresh'?outcome==='self'&&texts.includes('PROMPT_REFRESH_731')&&JSON.stringify(tools).includes('agent_list'):c.expected==='self'||c.name==='no-suitable'?outcome==='self':c.expected==='no-suitable'?outcome==='self'&&/no (available |suitable )?(agent|specialist|existing)|(?:do not|don.t|does not|doesn.t) have (?:a )?(?:suitable )?(?:agent|specialist)|not (have|find|listed)|none|not described|lack/i.test(texts):c.expected==='busy'?outcome==='self'&&/busy|unavailable/i.test(texts)&&/I (can|could)|myself|handle it/i.test(texts):c.expected.startsWith('work:')?outcome==='work'&&JSON.stringify(tools).includes(c.expected.split(':')[1]):outcome===c.expected;
    const row={adapter,case:c.name,expected:c.expected,outcome,passed:pass&&!unsafeNative,nativeSubagent:unsafeNative,reusedSession:c.same?session===priorSession:undefined,tools,text:texts.slice(0,1500)};results.push(row);writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));console.log(`${row.passed?'PASS':'FAIL'} ${adapter} ${c.name}: ${outcome}${c.same?' reused='+row.reusedSession:''}`);priorSession=session;if(unsafeNative)throw Error('STOP: native subagent event observed.');if(c.same&&!texts.includes('PROMPT_REFRESH_731'))throw Error('STOP: refreshed prompt was not observed in the reused session.');
   }catch(error){results.push({adapter,case:c.name,expected:c.expected,error:String(error)});writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));console.log('ERROR '+adapter+' '+c.name+': '+String(error));break;}
   finally{unsubscribe();clearInterval(rejectTimer);releaseBusy?.();await busyJob;}
  }
 }finally{runner.shutdown();await acp.close();await runner.idle();runner.work.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}
 if(unsafeNative)break;
}
writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));console.log('Results: '+join(out,'results.json'));if(results.length!==selected.length*adapters.length||results.some(r=>!r.passed||r.reusedSession===false))process.exitCode=1;

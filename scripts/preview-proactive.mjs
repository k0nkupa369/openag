// Disposable built-desk design preview. Real settings/storage; synthetic source metadata, no provider or model calls.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
for(const name of Object.keys(process.env))if(!['PATH','HOME','LANG','TMPDIR'].includes(name))delete process.env[name];
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'apps/daemon/package.json');
const load=name=>import(root+'apps/daemon/dist/'+name+'.js');
const {serve}=require('@hono/node-server');
const {openDb}=await load('db/index'),{createLedger}=await load('ledger'),{createAuth}=await load('auth');
const {createBot,createRoom,addMember}=await load('rooms'),{createApprovals}=await load('approvals');
const {createGateway,attachStream}=await load('gateway'),{createPermissions}=await load('permissions');
const {setSetting}=await load('settings'),{createWakeFilter}=await load('wake'),{createProactive}=await load('proactive');
const dir=mkdtempSync(join(tmpdir(),'openag-proactive-design-')),db=openDb(dir),ledger=createLedger(db),auth=createAuth({db,ownerToken:randomUUID()}),approvals=createApprovals(db,ledger),permissions=createPermissions(db,ledger,dir,approvals);
createBot(db,{id:'bot',name:'Bot',runtime:'api'});createRoom(db,{id:'main',leadBotId:'bot'});addMember(db,'main','bot');createRoom(db,{id:'updates',name:'Project updates',leadBotId:'bot'});addMember(db,'updates','bot');
setSetting(db,'defaultBot',{botId:'bot'});setSetting(db,'heartbeat',{enabled:true,everyMinutes:60});
const services=['outlook','gmail','github','asana'];
const runner={async runReadCheck(_room,_bot,_message,check){if(!check.execute)throw Error('Models are disabled in the design preview');await check.execute({callTool:async()=>({ok:true,result:{structuredContent:{successful:true,data:{toolkit_connection_statuses:services.map(toolkit=>({toolkit,has_active_connection:true}))}}}})});return {completed:true,turnId:null};}};
const wake=createWakeFilter({db,ledger,tz:'Pacific/Auckland'}),proactive=createProactive({db,ledger,runner,wake,tz:'Pacific/Auckland',connected:()=>true});
const now=Date.now();
for(const service of services)db.prepare('INSERT INTO proactive_services VALUES (?,?)').run(service,now);
function seed(state){
  setSetting(db,'heartbeat',{enabled:true,everyMinutes:60});
  db.prepare('DELETE FROM proactive_accounts').run();db.prepare('DELETE FROM proactive_runs').run();
  db.prepare('UPDATE proactive_config SET services_json=?,revision=revision+1,next_due_at=?').run(JSON.stringify(state==='empty'?[]:['outlook','gmail',...(state==='unsupported'?['asana']:[])]),now+3_600_000);
  if(state==='empty')return;
  for(const [service,id,alias] of [['outlook','work','Work'],['outlook','personal','Personal'],['gmail','mail','Main account'],...(state==='unsupported'?[['asana','tasks','Projects']]:[])]){
    const status=service==='asana'?'unsupported':state==='outage'?'unavailable':state==='mixed'&&id==='personal'?'needs_sign_in':state==='incomplete'?'incomplete':'checked';
    const reason={needs_sign_in:'Connection needs sign-in',unavailable:'Composio could not reach this account',unsupported:'No supported check yet',incomplete:'More items remain; checking continues next time'}[status]??null;
    db.prepare('INSERT INTO proactive_accounts (service,account_id,alias,last_attempt_at,last_success_at,covered_until,status,reason) VALUES (?,?,?,?,?,?,?,?)').run(service,id,alias,now-300_000,status==='unsupported'?null:now-900_000,status==='unsupported'?null:now-900_000,status,reason);
    db.prepare('INSERT INTO proactive_runs (revision,service,account_id,started_at,ended_at,status,reason,items,from_at,until_at,evidence_json) SELECT revision,?,?,?,?,?,?,?,?,?,? FROM proactive_config').run(service,id,now-300_000,now-299_000,status==='checked'?'quiet':status,reason??'No updates need your attention',status==='checked'?2:0,now-3_900_000,now-300_000,JSON.stringify(status==='checked'?[{id:'sample',text:'Project update: the review is ready for tomorrow.',reference:'Sample source excerpt',version:'1'}]:[]));
  }
}
seed('mixed');
const device=auth.createDevice('Disposable design preview','owner','full');
const app=createGateway({db,ledger,auth,approvals,permissions,proactive,dataDir:dir,deskDir:root+'apps/desk/dist',dispatch(){throw Error('Chat is disabled in the design preview');}});
const server=serve({hostname:'127.0.0.1',port:0,fetch:request=>{
  const url=new URL(request.url);
  if(url.pathname==='/preview'){
    seed(['healthy','mixed','outage','unsupported','incomplete','empty'].includes(url.searchParams.get('state'))?url.searchParams.get('state'):'mixed');
    const destination=url.searchParams.get('destination');if(destination)setSetting(db,'deliveryRoom',{roomId:destination==='default'?null:destination==='missing'?'missing-room':'main'});
    const theme=url.searchParams.get('theme')==='dark'?'dark':'light',tab=url.searchParams.get('tab')==='history'?'history':'schedule';
    return new Response('<!doctype html><script>localStorage.setItem("openag-token",'+JSON.stringify(device.token)+');localStorage.setItem("openag.theme",'+JSON.stringify(theme)+');location.replace("/#/settings/proactive/'+tab+'")</script>',{headers:{'content-type':'text/html','cache-control':'no-store'}});
  }
  return app.fetch(request);
}});
const detach=attachStream(server,ledger,auth);
if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
console.log('Disposable proactive design: http://127.0.0.1:'+server.address().port+'/preview');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{proactive.close();detach();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});

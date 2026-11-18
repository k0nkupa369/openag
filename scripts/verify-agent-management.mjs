// Standalone real runner/gateway configuration checks; temporary data, synthetic providers, no unit runner.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startFixture} from './bot-models-fixture.mjs';
const load=p=>import(new URL('../apps/daemon/dist/'+p+'.js',import.meta.url));
const {createAgentTools}=await load('tools/agents'),{toExecutors}=await load('tools/registry'),{createAgentManagement}=await load('agent-management'),{createSkillCatalogue}=await load('skills'),{getBot,getRoom,createRoom,addMember}=await load('rooms'),{createPermissions}=await load('permissions'),{MCP_TOOL_NAMES}=await load('mcpserver');
const dir=mkdtempSync(join(tmpdir(),'openag-bot-models-'));let f,management,command,result;
try{
 f=await startFixture(dir,'synthetic-management-owner',0,{tools:toExecutors(createAgentTools()),manageAgent:(actor,op,args)=>management(actor,op,args),runTurn:async ctx=>{result=await ctx.callTool(command.name,command.args);}});
 const permissions=createPermissions(f.db,f.ledger,dir,f.approvals);if(!permissions.active())permissions.adopt('workspace-write',permissions.adoption().reviewVersion,'owner');
 const select=mode=>{const current=permissions.ensure('boss','main');if(current.preset!==mode)permissions.select('boss','main',mode,'owner',current.revision);};
 select('full-access');
 const shared=join(dir,'library');mkdirSync(join(shared,'example'),{recursive:true});writeFileSync(join(shared,'example','SKILL.md'),'---\nname: example\ndescription: Synthetic workflow\n---\nReturn a concise result.\n');
 const skills=createSkillCatalogue(f.db,dir,shared);skills.setEnabled(true);let invalidated=0,failRefresh=false;
 management=createAgentManagement({db:f.db,ledger:f.ledger,models:f.botModels,skills,withIdleBot:f.runner.withIdleBot,env:f.env,changed:async()=>{invalidated++;if(failRefresh)throw Error('Controlled session refresh failure');}});
 async function call(name,args={},meta){command={name,args};const message=f.ledger.append('main','user','message',{text:'Management acceptance'});await f.runner.run(getRoom(f.db,'main'),getBot(f.db,'boss'),message,undefined,meta);return result;}
 for(const tool of createAgentTools())assert.ok(MCP_TOOL_NAMES.includes(tool.name),tool.name+' is offered to ACP');
 const choices=await call('agent_models',{target:'openai'});assert.equal(choices.ok,true,JSON.stringify(choices));assert.ok(choices.result.requestId);
 const input={requestId:choices.result.requestId,name:'New colleague',target:'openai',model:choices.result.model,snapshotId:choices.result.snapshotId,reasoning:{}};
 const first=await call('agent_create',input);assert.equal(first.ok,true,JSON.stringify(first));const id=first.result.bot.id;
 const again=await call('agent_create',input);assert.equal(again.result.bot.id,id);assert.equal(again.result.created,false);
 assert.equal((await call('agent_create',{...input,name:'Different'})).ok,false);
 assert.equal(f.db.prepare('SELECT count(*) n FROM room_members WHERE bot_id=?').get(id).n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM turns WHERE bot_id=?').get(id).n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM work').get().n,0);
 assert.equal((await call('agent_settings_set',{agentId:id,settings:{name:'Colleague',instructions:'Use concise evidence.'}})).ok,true);
 assert.equal(getBot(f.db,id).config.instructions,'Use concise evidence.');
 assert.equal((await call('agent_handle_set',{agentId:id,handle:'analyst'})).ok,true);assert.equal(getBot(f.db,id).handle,'analyst');
 const invalidHandle=await call('agent_handle_set',{agentId:id,handle:'oag_'+'a'.repeat(43)});assert.equal(invalidHandle.ok,false);assert.equal(invalidHandle.executionOutcome,'not-run');
 const model=await call('agent_models',{agentId:'@analyst',target:'openai'});assert.equal(model.ok,true);
 assert.equal((await call('agent_model_set',{agentId:'@analyst',configuration:{revision:model.result.revision,snapshotId:model.result.snapshotId,model:model.result.model,reasoning:{}}})).ok,true);
 const packageId=skills.list(id,true).find(s=>s.source==='shared').id;
 assert.equal((await call('agent_skills_assign',{agentId:'analyst',skillIds:[packageId]})).ok,true);
 const assigned=await call('agent_skills_assign',{agentId:id,skillIds:[]});assert.equal(assigned.ok,true);assert.deepEqual(assigned.result.skills.map(s=>s.id),[packageId]);
 const busy=await call('agent_settings_set',{agentId:'boss',settings:{name:'Busy self'}});assert.equal(busy.ok,false);assert.equal(busy.executionOutcome,'not-run');
 failRefresh=true;const refreshFailed=await call('agent_settings_set',{agentId:id,settings:{description:'Saved before refresh failed'}});assert.equal(getBot(f.db,id).config.description,'Saved before refresh failed');assert.equal(refreshFailed.executionOutcome,'unknown','post-write failure must not claim no write');failRefresh=false;
 select('read-only');assert.equal((await call('agent_settings_set',{agentId:id,settings:{name:'Denied'}})).ok,false);
 select('full-access');assert.equal((await call('agent_settings_set',{agentId:id,settings:{name:'Denied'}},{unattended:true})).ok,false);
 assert.equal((await call('agent_settings_set',{agentId:id,settings:{permissions:'danger-full-access'}})).ok,false);
 const events=f.ledger.list('_system').filter(e=>e.type==='config'&&['bot_created','bot_settings','bot_handle_changed','bot_model','skill_assignments_changed'].includes(e.payload.action));
 assert.ok(events.some(e=>e.payload.action==='bot_created'&&e.actor==='boss'));assert.ok(events.every(e=>e.actor==='boss'),'management audit identifies the real caller');assert.ok(invalidated>=4);
 createRoom(f.db,{id:'new-conversation',leadBotId:id});addMember(f.db,'new-conversation',id);
 assert.equal(permissions.ensure(id,'new-conversation').filesystemMode,'workspace-write','creation does not copy Full access from creator');
 console.log('PASS agent-management: shared registry/MCP, cached choices, duplicate-safe creation, settings/handles/models/skills, actor audit, no membership/turn/Work, busy/permission/background/secret refusals.');
}finally{await f?.close();rmSync(dir,{recursive:true,force:true});}

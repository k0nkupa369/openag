import { randomUUID } from 'node:crypto';
import type { Db } from './db/index.js';
import type { Ledger } from './ledger.js';
import { ModelError, type BotModels } from './botmodels.js';
import { SkillError, type SkillCatalogue } from './skills.js';
import { createDeskBot } from './botcreation.js';
import { getBot } from './rooms.js';
import { handleIndex, setBotHandle, HandleError } from './handles.js';
import { saveBotSettings, BotSettingsError } from './botsettings.js';
import { ActionFailure } from './action-receipts.js';

export function createAgentManagement(deps:{db:Db;ledger:Ledger;models:BotModels;skills:SkillCatalogue;withIdleBot<T>(id:string,fn:()=>Promise<T>):Promise<T>;env?:NodeJS.ProcessEnv;changed():Promise<void>}) {
  const target=(address:string)=>{const id=handleIndex(deps.db).get(address.replace(/^@/,'').toLowerCase())??address;const bot=getBot(deps.db,id);if(!bot)throw new ActionFailure('Agent not found.','not-run');return bot;};
  return async(actor:string,operation:string,args:Record<string,any>,assertPermission:()=>void=()=>{})=>{
    let committed=false;
    try {
    assertPermission();
    if(operation==='agent_models'){
      if(args.agentId)return deps.models.discover(target(args.agentId).id,{target:args.target,model:args.model});
      const requestId=randomUUID();return {requestId,...await deps.models.discoverCreation({requestId,target:args.target,model:args.model})};
    }
    if(operation==='agent_create')return createDeskBot(deps.db,deps.ledger,deps.models,args,deps.env??process.env,actor);
    const bot=target(args.agentId);
    if(operation==='agent_model_set')return await deps.models.save(bot.id,args.configuration,actor,assertPermission);
    const result=await deps.withIdleBot(bot.id,async()=>{
      assertPermission();
      if(operation==='agent_settings_set')return saveBotSettings(deps.db,deps.ledger,bot.id,args.settings,actor);
      if(operation==='agent_handle_set')return setBotHandle(deps.db,deps.ledger,bot.id,args.handle,actor);
      if(operation==='agent_skills_assign'){
        deps.ledger.atomic(()=>{deps.skills.assign(bot.id,args.skillIds,true);deps.ledger.append('_system',actor,'config',{action:'skill_assignments_changed',botId:bot.id,count:args.skillIds.length});});
        return {botId:bot.id,skills:deps.skills.list(bot.id).filter(skill=>skill.source==='shared')};
      }
      throw new ActionFailure('Unsupported agent operation.','not-run');
    });
    committed=true;
    await deps.changed();return result;
    }catch(error){if(!committed&&(error instanceof ModelError||error instanceof HandleError||error instanceof BotSettingsError||error instanceof SkillError))throw new ActionFailure(error.message,'not-run');throw error;}
  };
}

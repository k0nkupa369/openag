import { ActionFailure } from '../action-receipts.js';
import { AgentRequestError, consultationInput } from '../agent-requests.js';
import { z } from 'zod';
import type { ToolDef } from './registry.js';

const agentId=z.string().min(1).max(80);
const reasoning=z.record(z.string(),z.union([z.string().max(80),z.boolean(),z.number().int()]));
const configuration=z.object({revision:z.string(),snapshotId:z.string(),model:z.string().min(1).max(200),reasoning}).strict();
const management=(name:string,description:string,input:z.ZodType,read=false):ToolDef=>({
  name,description,input,class:read?'read':'act-local',effectScope:()=>read?{kind:'read'}:{kind:'opaque'},
  permission:ctx=>ctx.permission?.mode==='danger-full-access'?{approval:'allow'}:{approval:'deny',message:'Full access is required to manage agents.'},
  offlineSafe:false,editable:false,
  async execute(ctx,args){ctx.assertPermission?.();if(!ctx.manageAgent)throw new ActionFailure('Agent management is unavailable.','not-run');return ctx.manageAgent(name,args);},
});

export function createAgentTools(): ToolDef[] {
  const send=(name:string):ToolDef=>({name,effectScope:()=>({kind:'read'}),class:'act-local',permission:()=>({approval:'allow'}),offlineSafe:false,editable:false,
    description:'Send a bounded request to an existing agent by @handle from agent_list (a retired handle still reaches it). Returns admission immediately. A busy recipient queues it for its next turn. Continue your work; each reply arrives independently in this conversation. Include objective, decisions, constraints, evidence and expected result in selected context; private history and memory are not shared. Set replyToRequestId for an explicit follow-up to your earlier request. No Work is created; do not also delegate this request in prose.',input:consultationInput,
    async execute(ctx,args){if(!ctx.consultAgent)throw new ActionFailure('Agent messaging is unavailable.','not-run');try{return ctx.consultAgent(args);}catch(error){if(error instanceof AgentRequestError)throw new ActionFailure(error.message,'not-run');throw error;}},
  });
  return [
    {name:'agent_request_cancel',effectScope:()=>({kind:'read'}),class:'act-local',permission:()=>({approval:'allow'}),offlineSafe:true,editable:false,
      description:'Cancel your queued or active agent requests in this conversation. Omit requestId to stop all. This does not undo actions or clear Unknown receipts.',input:z.object({requestId:z.string().uuid().optional()}).strict(),
      async execute(ctx,args){if(!ctx.cancelAgentRequests)throw new ActionFailure('Agent cancellation is unavailable.','not-run');return ctx.cancelAgentRequests(args.requestId);}},
    {name:'agent_list',effectScope:()=>({kind:'read'}),class:'read',permission:()=>({approval:'allow'}),offlineSafe:true,
      description:'List existing agents by permanent identity, current handle, name, role description and runtime/busy state. Discovery grants no action permission.',input:z.object({}).strict(),
      async execute(ctx){if(!ctx.agentList)throw Error('Agent discovery is unavailable.');return ctx.agentList();}},
    send('agent_send'),send('agent_consult'),
    management('agent_models','Read cached model choices for creation or for an existing agent. For creation, retain returned requestId and snapshotId for agent_create; for an existing agent, retain revision and snapshotId for agent_model_set. Does not refresh or contact providers.',z.object({agentId:agentId.optional(),target:z.string().min(1).max(100),model:z.string().max(200).optional()}).strict(),true),
    management('agent_create','Create an agent using choices from agent_models. Reuse the same requestId after an uncertain response. Creation grants no new permissions, room membership, turn or Work.',z.object({requestId:z.string().uuid(),name:z.string().max(40),description:z.string().max(200).optional(),instructions:z.string().max(8000).optional(),target:z.string().max(100),model:z.string().max(200),snapshotId:z.string(),reasoning}).strict()),
    management('agent_settings_set','Change an idle agent name, description or instructions. Existing permissions stay unchanged.',z.object({agentId,settings:z.object({name:z.string().max(40).optional(),description:z.string().max(200).optional(),instructions:z.string().max(8000).optional()}).strict()}).strict()),
    management('agent_handle_set','Change an idle agent public handle. Identity, history, permissions and old aliases remain attached to the same agent.',z.object({agentId,handle:z.string().min(1).max(48)}).strict()),
    management('agent_model_set','Change an idle agent model using revision and cached snapshot from agent_models. Administrator overrides remain authoritative.',z.object({agentId,configuration}).strict()),
    management('agent_skills_assign','Add discovered shared skills to an idle agent without removing its assignments. Inspect skill_list with includeAvailable=true first. Does not grant tool permissions.',z.object({agentId,skillIds:z.array(z.string().max(263)).max(200)}).strict()),
  ];
}

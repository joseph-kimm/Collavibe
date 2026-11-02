import { z } from "zod";
import { collaborationScope, newRecord, readRecords, reviseRecord, saveRecord, type Actor } from "./collaboration-records.js";
import { publicUrl } from "./portfolios.js";
import { WorkspaceError } from "./workspace-model.js";

export const intakeFields = z.object({ background:z.string().trim().max(2000).default(""),experience:z.enum(["new","some","experienced"]).default("new"),interests:z.string().trim().min(1).max(2000),goals:z.string().trim().min(1).max(2000),support:z.string().trim().max(2000).default(""),exampleUrl:publicUrl.default(""),organizerConsent:z.literal(true),expectedVersion:z.number().int().positive().optional() });

export async function courseAccount(actor:Actor) {
  // Reuse the ordinary account/team authorization path but return only course
  // orientation metadata, not invite codes, repository details, or teammate data.
  const {getDashboard}=await import("./store.js");const {cloudDashboard,isSupabaseConfigured}=await import("./supabase.js");
  const dashboard=isSupabaseConfigured()?await cloudDashboard({...actor,email:actor.email||"",createdAt:actor.createdAt||new Date().toISOString()}):await getDashboard(actor.id);
  return {name:actor.name,teams:dashboard.teams.map(team=>({id:team.id,name:team.name,organizer:team.ownerUserId===actor.id}))};
}

export async function ownIntake(actor:Actor,teamId:string) {
  await collaborationScope(actor,teamId);
  return (await readRecords(teamId,null,"intake")).find(row=>row.authorId===actor.id&&!row.deletedAt&&!row.payload.removed)||null;
}

export async function saveIntake(actor:Actor,teamId:string,raw:unknown) {
  const input=intakeFields.parse(raw);await collaborationScope(actor,teamId);
  const current=(await readRecords(teamId,null,"intake")).find(row=>row.authorId===actor.id);
  if(current&&!current.payload.removed&&input.expectedVersion!==current.version)throw new WorkspaceError("Your intake response changed. Reload before saving.",409);
  if(current?.payload.removed&&input.expectedVersion!==undefined)throw new WorkspaceError("Your intake response was removed. Reload before saving.",409);
  if(!current&&input.expectedVersion)throw new WorkspaceError("Intake response not found.",404);
  const {expectedVersion,...fields}=input;
  const row=current?reviseRecord(current,{...fields,courseId:"vibecode-101"}):newRecord(actor,teamId,null,"intake",{...fields,courseId:"vibecode-101"});
  if(!current)row.id=`intake_${teamId}_${actor.id}`;
  return saveRecord(actor,row,current?.version||null);
}

export async function organizerIntakes(actor:Actor,teamId:string) {
  if(!(await collaborationScope(actor,teamId)).owner)throw new WorkspaceError("Only this team's organizer can read learners' intake responses.",403);
  return (await readRecords(teamId,null,"intake")).filter(row=>!row.deletedAt&&!row.payload.removed);
}

export async function removeIntake(actor:Actor,teamId:string,expectedVersion:number) {
  const current=await ownIntake(actor,teamId);
  if(!current)throw new WorkspaceError("Intake response not found.",404);
  if(current.version!==expectedVersion)throw new WorkspaceError("Your response changed. Reload before removing it.",409);
  return saveRecord(actor,reviseRecord(current,{removed:true,courseId:"vibecode-101"}),current.version);
}

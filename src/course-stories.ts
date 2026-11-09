import { createHash } from "node:crypto";
import { z } from "zod";
import { collaborationScope, findRecord, newRecord, readRecords, reviseRecord, saveRecord, type Actor, type CollaborationRecord } from "./collaboration-records.js";
import { publicText, publicUrl } from "./portfolios.js";
import { WorkspaceError } from "./workspace-model.js";

const fields=z.object({title:z.string().trim().min(3).max(200),body:z.string().trim().min(20).max(15000),demoUrl:publicUrl.default(""),portfolioId:z.string().regex(/^portfolio_[a-f0-9-]{36}$/).or(z.literal("")).default("")});
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isStory = (row: CollaborationRecord) => row.kind === "post" && row.payload.courseEntry === undefined;
function projectStory(row:CollaborationRecord) {
  return {id:row.id,title:publicText(row.payload.title,200),body:publicText(row.payload.body,15000),demoUrl:String(row.payload.demoUrl||""),portfolioId:String(row.payload.portfolioId||""),authorName:publicText(row.authorName,120)};
}
async function scoped(actor:Actor,teamId:string,id:string) {
  const scope=await collaborationScope(actor,teamId);
  const row=await findRecord(id);
  if(!row||!isStory(row)||row.teamId!==teamId||row.deletedAt)throw new WorkspaceError("Course story not found.",404);
  return {scope,row};
}
async function checkPortfolio(teamId:string,id:string) {
  if(!id)return;
  const portfolio=await findRecord(id);
  if(!portfolio||portfolio.kind!=="portfolio"||portfolio.teamId!==teamId||portfolio.payload.published!==true||portfolio.deletedAt)throw new WorkspaceError("Choose a currently shared portfolio from this course team.",400);
}
export async function listCourseStories(actor:Actor,teamId:string) {
  const scope=await collaborationScope(actor,teamId);
  return (await readRecords(teamId,null,"post",null)).filter(row=>isStory(row)&&!row.deletedAt&&(row.authorId===actor.id||scope.owner));
}
export async function saveCourseStory(actor:Actor,teamId:string,raw:unknown,id?:string) {
  const input=fields.extend({expectedVersion:z.number().int().positive().optional()}).parse(raw);
  await collaborationScope(actor,teamId);await checkPortfolio(teamId,input.portfolioId);
  const current=id?(await scoped(actor,teamId,id)).row:undefined;
  if(current&&current.authorId!==actor.id)throw new WorkspaceError("Only the author can edit this story.",403);
  if(current&&current.version!==input.expectedVersion)throw new WorkspaceError("The story changed. Reload before saving.",409);
  const {expectedVersion,...content}=input;
  // Changed text returns to draft; publication is always a deliberate action.
  const payload={...content,published:false,humanWritten:true,courseId:"vibecode-101"};
  return saveRecord(actor,current?reviseRecord(current,payload):newRecord(actor,teamId,null,"post",payload),current?.version||null);
}
export async function previewCourseStory(actor:Actor,teamId:string,id:string) {
  const {row}=await scoped(actor,teamId,id);
  if(row.authorId!==actor.id)throw new WorkspaceError("Only the author can prepare this story for publication.",403);
  await checkPortfolio(teamId,String(row.payload.portfolioId||""));
  const snapshot=projectStory(row);
  return {snapshot,version:row.version,previewHash:hash({snapshot,version:row.version})};
}
export async function publishCourseStory(actor:Actor,teamId:string,id:string,raw:unknown) {
  const input=z.object({previewHash:z.string().regex(/^[a-f0-9]{64}$/),expectedVersion:z.number().int().positive(),publicConsent:z.literal(true)}).parse(raw);
  const preview=await previewCourseStory(actor,teamId,id);
  if(input.previewHash!==preview.previewHash||input.expectedVersion!==preview.version)throw new WorkspaceError("This story changed after preview. Review it again before publishing.",409);
  const {row}=await scoped(actor,teamId,id);
  return saveRecord(actor,reviseRecord(row,{...row.payload,published:true,snapshot:preview.snapshot,publishedAt:new Date().toISOString(),publicConsent:true}),input.expectedVersion);
}
export async function unpublishCourseStory(actor:Actor,teamId:string,id:string,expectedVersion:number) {
  const {row,scope}=await scoped(actor,teamId,id);
  if(row.authorId!==actor.id&&!scope.owner)throw new WorkspaceError("Only the author or organizer can unpublish this story.",403);
  if(row.version!==expectedVersion)throw new WorkspaceError("The story changed. Reload before unpublishing.",409);
  return saveRecord(actor,reviseRecord(row,{...row.payload,published:false}),row.version);
}
export async function publicCourseStories() {
  const rows=(await readRecords(undefined,null,"post",null)).filter(row=>isStory(row)&&row.payload.published===true&&!row.deletedAt).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,200);
  const result=[];
  for(const row of rows){const snapshot={...(row.payload.snapshot as ReturnType<typeof projectStory>),publishedAt:row.payload.publishedAt};
    if(snapshot.portfolioId){const portfolio=await findRecord(snapshot.portfolioId);if(!portfolio||portfolio.teamId!==row.teamId||portfolio.payload.published!==true||portfolio.deletedAt)snapshot.portfolioId="";}
    result.push(snapshot);
  }
  return result;
}

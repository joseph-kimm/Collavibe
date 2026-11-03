import {z} from "zod";
import {course} from "./course-content.js";
import {collaborationScope,newRecord,readRecords,reviseRecord,saveRecord,type Actor} from "./collaboration-records.js";
import {publicUrl} from "./portfolios.js";
import {WorkspaceError} from "./workspace-model.js";
const fields=z.object({workSummary:z.string().trim().max(8000).default(""),reflection:z.string().trim().max(4000).default(""),aiUse:z.string().trim().max(2000).default(""),artifacts:z.array(z.object({label:z.string().trim().min(1).max(120),url:publicUrl.refine(Boolean,"Add an HTTPS link.")})).max(8).default([]),checkedCriteria:z.array(z.string().max(100)).max(20).default([]),action:z.enum(["draft","submit"]).default("draft"),expectedVersion:z.number().int().positive().optional()});
function assignment(id:string){const found=course.assignments.find(row=>row.id===id);if(!found)throw new WorkspaceError("Assignment not found.",404);return found;}
export async function ownSubmissions(actor:Actor,teamId:string){await collaborationScope(actor,teamId);return (await readRecords(teamId,null,"course_submission")).filter(row=>row.authorId===actor.id&&!row.deletedAt);}
export async function saveSubmission(actor:Actor,teamId:string,assignmentId:string,raw:unknown){
  const brief=assignment(assignmentId),input=fields.parse(raw);await collaborationScope(actor,teamId);
  if(input.checkedCriteria.some(id=>!brief.criteria.some(row=>row.id===id)))throw new WorkspaceError("An evidence check does not belong to this assignment.",400);
  if(input.action==="submit"&&(input.workSummary.length<40||input.reflection.length<20||input.aiUse.length<10))throw new WorkspaceError("Before submitting, describe your work/evidence, your own reasoning, and the AI help you used. A working link is optional when you provide reproducible local evidence.",400);
  const current=(await ownSubmissions(actor,teamId)).find(row=>row.payload.assignmentId===assignmentId);
  if((current?.version??undefined)!==input.expectedVersion)throw new WorkspaceError("This submission changed. Reload before saving.",409);
  const {action,expectedVersion,...content}=input;
  const payload={...content,assignmentId,courseId:course.id,status:action==="submit"?"submitted":"draft",submittedAt:action==="submit"?new Date().toISOString():null,review:null,feedbackHistory:current?.payload.feedbackHistory||[]};
  const row=current?reviseRecord(current,payload):newRecord(actor,teamId,null,"course_submission",payload);if(!current)row.id=`course_submission_${teamId}_${assignmentId}_${actor.id}`;
  return saveRecord(actor,row,current?.version||null);
}
export async function organizerSubmissions(actor:Actor,teamId:string){if(!(await collaborationScope(actor,teamId)).owner)throw new WorkspaceError("Only the organizer can read submitted work.",403);return (await readRecords(teamId,null,"course_submission")).filter(row=>!row.deletedAt&&row.payload.status==="submitted");}
export async function reviewSubmission(actor:Actor,teamId:string,id:string,raw:unknown){
  const input=z.object({expectedVersion:z.number().int().positive(),status:z.enum(["revise","ready"]),feedback:z.string().trim().min(12).max(4000)}).parse(raw);
  const row=(await organizerSubmissions(actor,teamId)).find(row=>row.id===id);if(!row)throw new WorkspaceError("Submitted work not found. Drafts are private to the learner.",404);
  if(row.version!==input.expectedVersion)throw new WorkspaceError("This work changed. Reload before reviewing.",409);
  const review={status:input.status,feedback:input.feedback,reviewerName:actor.name,reviewedAt:new Date().toISOString()};
  const history=Array.isArray(row.payload.feedbackHistory)?row.payload.feedbackHistory:[];
  return saveRecord(actor,reviseRecord(row,{...row.payload,review,feedbackHistory:[...history,review].slice(-20)}),row.version);
}

import {z} from "zod";
import {course} from "./course-content.js";
import {collaborationScope,newRecord,readRecords,reviseRecord,saveRecord,type Actor} from "./collaboration-records.js";
import {WorkspaceError} from "./workspace-model.js";

export const scheduleFields=z.object({dates:z.array(z.iso.date()).refine(dates=>dates.length===0||dates.length===5,"Enter all five dates, or clear the schedule."),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),timeZone:z.string().max(80).refine(zone=>{try{new Intl.DateTimeFormat("en",{timeZone:zone});return true;}catch{return false;}},"Use an IANA timezone, such as America/New_York."),location:z.string().trim().max(300).default(""),expectedVersion:z.number().int().positive().optional()});
export type CourseSchedule=z.infer<typeof scheduleFields>;
function parts(date:Date,zone:string){const values=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);return Object.fromEntries(values.map(row=>[row.type,row.value]));}
export function datePlusDays(value:string,days:number){const date=new Date(value+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function zonedInstant(date:string,time:string,zone:string){
  const target=Date.parse(date+"T"+time+":00Z");let timestamp=target;
  for(let attempt=0;attempt<4;attempt++){const p=parts(new Date(timestamp),zone);const shown=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);const delta=target-shown;if(!delta)break;timestamp+=delta;}
  const result=new Date(timestamp),p=parts(result,zone);
  if(`${p.year}-${p.month}-${p.day}`!==date||`${p.hour}:${p.minute}`!==time)throw new WorkspaceError("A class time does not exist in this timezone because of a clock change. Choose another time.",400);
  return result;
}
export function buildCourseCalendar(settings:Pick<CourseSchedule,"dates"|"startTime"|"timeZone"|"location">){
  if(settings.dates.length&&settings.dates.some((date,index)=>index>0&&date<=settings.dates[index-1]))throw new WorkspaceError("Class dates must be distinct and in order.",400);
  const sessions=course.sessions.map((session,index)=>{const start=settings.dates[index]?zonedInstant(settings.dates[index],settings.startTime,settings.timeZone):null;return {number:session.number,title:session.title,start:start?.toISOString()||null,end:start?new Date(start.getTime()+120*60000).toISOString():null,relative:`Session ${session.number}`,location:settings.location};});
  const assignments=course.assignments.map(assignment=>{
    let deadline:Date|null=null;
    if(settings.dates.length){if(assignment.id==="final-project")deadline=new Date(Date.parse(sessions[4].end!)+72*3600000);else if(assignment.id==="group-plan")deadline=new Date(sessions[3].start!);else deadline=zonedInstant(datePlusDays(settings.dates[assignment.dueSession-1],-1),"18:00",settings.timeZone);}
    return {id:assignment.id,title:assignment.title,due:deadline?.toISOString()||null,relative:assignment.id==="final-project"?"72 hours after Session 5 ends":assignment.id==="group-plan"?"At Session 4's start":`6 pm the day before Session ${assignment.dueSession}`};
  });
  return {timeZone:settings.timeZone,scheduled:settings.dates.length===5,sessions,assignments,candidateDue:sessions[4].start?new Date(Date.parse(sessions[4].start)-24*3600000).toISOString():null};
}
export async function getCourseSchedule(actor:Actor,teamId:string){const scope=await collaborationScope(actor,teamId);const row=(await readRecords(teamId,null,"course_settings")).find(row=>!row.deletedAt);const fields=row?row.payload as CourseSchedule:{dates:[],startTime:"18:00",timeZone:"America/New_York",location:""};return {settings:{...fields,version:row?.version||null},calendar:buildCourseCalendar(fields),organizer:scope.owner};}
export async function saveCourseSchedule(actor:Actor,teamId:string,raw:unknown){
  if(!(await collaborationScope(actor,teamId)).owner)throw new WorkspaceError("Only the course organizer can change this schedule.",403);
  const input=scheduleFields.parse(raw);buildCourseCalendar(input);
  const current=(await readRecords(teamId,null,"course_settings")).find(row=>!row.deletedAt);
  if((current?.version??undefined)!==input.expectedVersion)throw new WorkspaceError("This schedule changed. Reload before saving.",409);
  const {expectedVersion,...fields}=input;const row=current?reviseRecord(current,fields):newRecord(actor,teamId,null,"course_settings",fields);if(!current)row.id="course_settings_"+teamId;
  await saveRecord(actor,row,current?.version||null);return getCourseSchedule(actor,teamId);
}
const icsText=(value:string)=>value.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");
const stamp=(value:string)=>value.replace(/[-:]/g,"").replace(/\.\d{3}/,"");
function foldIcsLine(line:string){const chunks:string[]=[];let current="";for(const character of line){if(Buffer.byteLength(current+character,"utf8")>75){chunks.push(current);current=" ";}current+=character;}chunks.push(current);return chunks.join("\r\n");}
export function courseCalendarIcs(teamId:string,calendar:ReturnType<typeof buildCourseCalendar>){
  if(!calendar.scheduled)throw new WorkspaceError("The organizer must set the class dates before exporting a calendar.",409);
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Collavibe//Vibecode 101//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  const add=(id:string,title:string,start:string,end:string,description:string)=>lines.push("BEGIN:VEVENT",`UID:${teamId}-${id}@collavibe`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${icsText(title)}`,`DESCRIPTION:${icsText(description)}`,"END:VEVENT");
  for(const session of calendar.sessions)add("session-"+session.number,`Vibecode 101: ${session.title}`,session.start!,session.end!,session.location||"Location to be confirmed with the organizer.");
  for(const assignment of calendar.assignments)add("due-"+assignment.id,`Due: ${assignment.title}`,assignment.due!,new Date(Date.parse(assignment.due!)+300000).toISOString(),"Private course submission. Ask the organizer about an extension if needed.");
  add("candidate","Final project: demo-ready candidate",calendar.candidateDue!,new Date(Date.parse(calendar.candidateDue!)+300000).toISOString(),"Bring a running main journey and a backup demonstration to Session 5.");
  return lines.concat("END:VCALENDAR","").map(foldIcsLine).join("\r\n");
}

// Cloud database + real HTTP/MCP integration through a loopback server.
// All fixture identities and records belong to this run, never a real team.
import {randomUUID} from "node:crypto";
import {readFile,writeFile,unlink} from "node:fs/promises";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {getSupabaseAdmin,throwSupabaseError as check} from "../src/supabase.js";
const db=getSupabaseAdmin(),base=process.env.COLLAVIBE_SMOKE_URL||"http://127.0.0.1:4431";
if(!["localhost","127.0.0.1"].includes(new URL(base).hostname))throw new Error("Run this integration test against a loopback server only.");
const fixturePath=process.env.COLLAVIBE_QA_FIXTURE||"/tmp/collavibe-nov02-qa.json";
if(!/^\/tmp\/collavibe-[\w-]+\.json$/.test(fixturePath))throw new Error("Use a named /tmp/collavibe-*.json fixture file.");
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
type Account={id:string;name:string;email:string;password:string;cookie:string};
type Fixture={run:string;team:any;project:any;accounts:Account[];sessionId?:string;meetingId?:string;portfolioId?:string};
async function cleanup(f:Fixture){
  const team=await db.from("teams").select("name").eq("id",f.team.id).maybeSingle();check(team.error);
  assert(!team.data||team.data.name===`November 2 QA ${f.run}`,"Refusing to remove a team outside this fixture.");
  check((await db.from("collaboration_records").delete().eq("team_id",f.team.id)).error);
  for(const table of ["collaboration_sessions","features","team_projects"])check((await db.from(table).delete().eq("project_id",f.project.id)).error);
  check((await db.from("projects").delete().eq("id",f.project.id)).error);check((await db.from("team_members").delete().eq("team_id",f.team.id)).error);check((await db.from("teams").delete().eq("id",f.team.id)).error);
  for(const account of f.accounts){const user=await db.auth.admin.getUserById(account.id);assert(!user.data.user||user.data.user.email===account.email&&account.email.includes(f.run),"Fixture account identity mismatch.");check((await db.auth.admin.deleteUser(account.id)).error);}
  await unlink(fixturePath);console.log("Disposable collaboration QA records and credentials removed.");
}
if(process.argv.includes("--cleanup")){await cleanup(JSON.parse(await readFile(fixturePath,"utf8")));process.exit(0);}
async function request(cookie:string,path:string,method="GET",body?:unknown){return fetch(base+path,{method,headers:{cookie,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function json(response:Response){const value=await response.json();assert(response.ok,`HTTP ${response.status}: ${value.error||"request failed"}`);return value;}
const run=randomUUID().slice(0,8),accounts:Account[]=[];
for(const label of ["owner","learner","visitor"]){const email=`collavibe-nov02-${run}-${label}@example.com`,password="QA-"+randomUUID();const result=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:`QA ${label}`}});check(result.error);const response=await request("","/api/auth/login","POST",{email,password});const value=await json(response);accounts.push({id:value.user.id,name:value.user.name,email,password,cookie:response.headers.get("set-cookie")!.split(";")[0]});}
const [owner,learner,visitor]=accounts;
const team=(await json(await request(owner.cookie,"/api/teams","POST",{name:`November 2 QA ${run}`}))).team;
await json(await request(learner.cookie,"/api/teams/join","POST",{joinCode:team.joinCode}));
const project=(await json(await request(owner.cookie,`/api/teams/${team.id}/projects`,"POST",{name:"Collaborative field notes",repositoryUrl:`https://github.com/collavibe-qa/${run}`}))).project;
const fixture:Fixture={run,team,project,accounts};await writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
const root=`/api/teams/${team.id}/projects/${project.id}`,courseRoot=`/api/course/teams/${team.id}`;
const connection=await json(await request(owner.cookie,`/api/teams/${team.id}/agent-connections`,"POST",{label:"Disposable collaboration QA",days:1}));
const mcp=new Client({name:"collavibe-nov02-qa",version:"1"});
try{
  await mcp.connect(new StreamableHTTPClientTransport(new URL(base+"/mcp"),{requestInit:{headers:{authorization:"Bearer "+connection.token}}}));
  async function tool(name:string,args:Record<string,unknown>){const result=await mcp.callTool({name,arguments:args});assert(!result.isError,`${name} failed: ${JSON.stringify(result.content)}`);return result.structuredContent as any;}
  const tools=await mcp.listTools();for(const name of ["get_collaboration_plan","propose_project_tickets","get_brainstorm_context","save_brainstorm_summary"])assert(tools.tools.some(tool=>tool.name===name),"Missing hosted tool "+name);
  assert(!tools.tools.some(tool=>/publish|approve|intake|write_reflection/.test(tool.name)),"Unexpected agent authority.");
  const git={branch:"feature/field-notes",head:"a".repeat(40),dirty:false,workingFiles:[],branches:[],recentCommits:[],trackedFiles:["README.md"]};
  const session=(await tool("start_collaboration_session",{project:{key:project.root,name:project.name,git},intent:"Build a small place to collect field observations."})).started.session;fixture.sessionId=session.id;
  await tool("choose_work_item",{sessionId:session.id,newFeature:{title:"Observation form",description:"A small form with an empty state and input validation.",checklist:["Test an empty observation"]}});
  await tool("sync_collaboration_session",{sessionId:session.id,summary:"Added the observation form and tested an empty response.",workCompleted:["Built the form"],decisions:["Keep private notes team-only"],blockers:[],nextSteps:["Ask a partner to test the empty state"],changedFiles:[],endGit:git,featureStatus:"review"});
  const learning=root+`/sessions/${session.id}/learning`;
  const note=(await json(await request(learner.cookie,learning+"/reflection","PUT",{text:"I realized the empty state needs to explain what to do next.",publicConsent:false}))).record;
  await json(await request(owner.cookie,learning+"/replies","POST",{parentId:note.id,text:"What would a first-time user need to see?"}));
  const meeting=(await json(await request(owner.cookie,root+"/meetings","POST",{title:"Observation form planning",transcript:"Speaker A: We should test the empty state. Speaker B: Let's ask a partner to try it.",speakers:{A:"Organizer",B:"Learner"},speakersReviewed:true,consentConfirmed:true}))).meeting;fixture.meetingId=meeting.id;
  await tool("get_brainstorm_context",{projectId:project.id,meetingId:meeting.id});
  await tool("save_brainstorm_summary",{projectId:project.id,meetingId:meeting.id,expectedVersion:meeting.version,summary:"Draft: test empty-state instructions with a partner before extending the form."});
  await tool("propose_project_tickets",{projectId:project.id,requestId:`qa-${run}-next`,proposals:[{title:"Test the empty-state instructions",sourceKind:"meeting",sourceId:meeting.id}]});
  const tickets=(await tool("get_collaboration_plan",{projectId:project.id})).tickets;assert(tickets[0].payload.status==="proposed"&&!tickets[0].payload.assigneeId,"Agent proposal became assigned work.");
  await json(await request(learner.cookie,courseRoot+"/intake","PUT",{interests:"PRIVATE_QA_INTAKE",goals:"Build an app for local observations",organizerConsent:true}));
  assert((await request(learner.cookie,courseRoot+"/intakes")).status===403,"Learner could read cohort intake.");
  const scheduleFields={dates:["2027-02-16","2027-02-23","2027-03-02","2027-03-09","2027-03-16"],startTime:"18:00",timeZone:"America/New_York",location:"Disposable course QA room"};
  assert((await request(learner.cookie,courseRoot+"/schedule","PUT",scheduleFields)).status===403,"Learner could change the cohort schedule.");
  const schedule=await json(await request(owner.cookie,courseRoot+"/schedule","PUT",scheduleFields));assert(schedule.calendar.scheduled,"Cohort dates did not persist.");
  const calendar=await request(learner.cookie,courseRoot+"/calendar.ics");assert(calendar.ok&&(await calendar.text()).includes("BEGIN:VCALENDAR"),"Calendar export failed.");
  const evidence={workSummary:"I built a small checklist and tested normal, empty, and phone-width cases.",reflection:"A partner could not find the add action, so I changed its label.",aiUse:"The agent implemented the form; I chose the task and ran the checks."};
  let submission=(await json(await request(learner.cookie,courseRoot+"/assignments/first-build","PUT",{...evidence,action:"draft"}))).submission;
  assert((await json(await request(owner.cookie,courseRoot+"/reviews"))).submissions.length===0,"Private learner draft leaked to the organizer.");
  submission=(await json(await request(learner.cookie,courseRoot+"/assignments/first-build","PUT",{...evidence,action:"submit",expectedVersion:submission.version}))).submission;
  assert((await request(visitor.cookie,courseRoot+"/reviews")).status===403,"Visitor could read course work.");
  await json(await request(owner.cookie,courseRoot+"/reviews/"+submission.id,"POST",{expectedVersion:submission.version,status:"revise",feedback:"Please include the observed empty-input result, then explain what you changed."}));
  const savedWork=await json(await request(learner.cookie,courseRoot+"/submissions"));assert(savedWork.submissions[0].payload.review.status==="revise","Human feedback did not reach the learner.");
  const fields={title:"Field notes: our process",description:"A reviewed record of how we designed and tested an observation form.",sessionIds:[session.id],includeReflections:true};
  const preview=await json(await request(owner.cookie,root+"/portfolios/preview","POST",fields));
  const portfolio=await json(await request(owner.cookie,root+"/portfolios","POST",{...fields,previewHash:preview.previewHash,consentConfirmed:true}));fixture.portfolioId=portfolio.id;
  const publicPath="/api/public/portfolios/"+portfolio.id;const publicData=JSON.stringify(await json(await request("",publicPath)));
  assert(!publicData.includes("PRIVATE_QA_INTAKE")&&!publicData.includes(note.payload.text)&&!publicData.includes(meeting.payload.transcript),"Private material leaked into portfolio.");
  await json(await request(visitor.cookie,publicPath+"/feedback","POST",{text:"Could you explain the empty-state test?",sessionId:session.id,publicConsent:true}));
  const story=(await json(await request(learner.cookie,courseRoot+"/stories","POST",{title:"Testing the first observation",body:"We asked a partner to use the form and learned that the empty state needed a clear next action.",portfolioId:portfolio.id}))).story;
  const postPreview=await json(await request(learner.cookie,courseRoot+`/stories/${story.id}/preview`,"POST",{}));
  await json(await request(learner.cookie,courseRoot+`/stories/${story.id}/publish`,"POST",{previewHash:postPreview.previewHash,expectedVersion:postPreview.version,publicConsent:true}));
  assert((await request(visitor.cookie,root+"/meetings")).status===403,"Outsider could read meetings.");
  const direct=await db.from("collaboration_records").select("id,version").eq("team_id",team.id);check(direct.error);assert(direct.data!.length>=7,"Cloud records were not persisted.");
  await writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
  console.log(JSON.stringify({passed:true,hostedMcpTools:tools.tools.length,persistedRecords:direct.data!.length,privateIntakeProtected:true,agentProposalsRequireReview:true,browserFixture:fixturePath}));
}finally{await mcp.close();}

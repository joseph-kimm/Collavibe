import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getSupabaseAdmin, cloudCreateTeam, cloudJoinTeam, throwSupabaseError } from "../src/supabase.js";
import { cloudAddProject } from "../src/cloud-workspace.js";
import { startHostedSession, chooseHostedWorkItem, syncHostedSession } from "../src/hosted.js";
import { writeReflection } from "../src/session-learning.js";
import { previewPortfolio, publishPortfolio, portfolioFeedback, publicPortfolio } from "../src/portfolios.js";
import { saveCourseStory, previewCourseStory, publishCourseStory, publicCourseStories } from "../src/course-stories.js";
import { saveLearnerPortfolio, previewLearnerPortfolio, publishLearnerPortfolio, publicLearnerPortfolio } from "../src/course-community.js";
import { postPublicDiscussion, publicForum } from "../src/public-forum.js";
import { findRecord, reviseRecord, saveRecord } from "../src/collaboration-records.js";
import type { Actor } from "../src/collaboration-records.js";

const definitions = [
  { key:"rain-check", team:"Weather Window", project:"Rain Check", people:["Maya Chen","Sam Patel","Alex Rivera"],
    description:"A fictional planner that combines a weather forecast and air-quality data to help someone choose a time for an outdoor activity.",
    features:["Combine forecast and air quality","Explain missing data","Save a planning preference"],
    decisions:["Compare both sources for the same place and hour.","Keep a useful forecast visible if air-quality data is unavailable.","Store the preferred activity locally with a clear reset option."],
    questions:["How would you show a forecast when the air-quality API is down?","Should a weather app remember the last place I searched?","What belongs in the explanation beside a recommendation?"],
    bodies:["In this synthetic example, one request succeeds and the other times out. The demo team chose to keep the forecast visible, label air quality as unavailable, and offer a retry. What would make that partial result understandable?",
      "Our fictional prototype could remember a location, but a shared laptop changes the privacy trade-off. We are considering a visible recent-location control with a clear button. How would you explain that choice to a first-time user?",
      "The sample design uses weather and air quality together. A single score hides why an hour was chosen. We are comparing a short explanation with showing the underlying numbers. What information would you put first?"],
    replies:["Show when each source was last updated. Otherwise a stale value can look current.","We would keep the retry beside the unavailable source so it is clear what will reload.","A sentence explaining the missing input would help someone interpret the recommendation."],
    storyTitles:["Keeping the useful half of an API response","A recommendation needs an explanation"],
    stories:["This is a synthetic design story written to demonstrate Collavibe. Rain Check is a fictional app combining a weather forecast with air-quality data.\n\nThe first sample design treated the two requests as one operation. If either failed, the whole page became an error. In the revised scenario, each source has its own loading, success, and failure states. A visitor can still read the forecast while the page explains that air-quality data is unavailable.\n\nThe linked portfolio shows three simulated handoffs. They connect the data combination, partial-failure behavior, and saved preferences. No real user study or deployed Rain Check app is being claimed.",
      "Synthetic demo story. The Rain Check team considered compressing its inputs into a single recommendation. The design discussion exposed a problem: a confident label can hide missing information.\n\nTheir sample revision places a short explanation beside the proposed time and lets the reader inspect the separate inputs. A missing source produces an incomplete recommendation with a reason.\n\nThe fictional team's next step is to compare whether people can explain the choice after reading the screen. This is a proposed evaluation in the demo scenario, not a report of real participant findings."] },
  { key:"quiet-corner",team:"Study Together",project:"Quiet Corner",people:["Noor Ali","Jamie Brooks","Leo Park"],
    description:"A fictional study-space finder that helps a group compare seating, opening hours, accessibility notes, and noise preferences.",
    features:["Compare study spaces","Show accessible route notes","Handle changing opening hours"],
    decisions:["Keep noise preference separate from factual opening hours.","Let a note say unknown rather than infer accessibility.","Show the source and date of an opening-hours entry."],
    questions:["How do you show an accessibility detail that has not been checked?","Map first or list first for finding a study space?","What should happen when opening hours are out of date?"],
    bodies:["This fictional study-space directory includes entries with incomplete accessibility notes. We want unknown to be visible and avoid treating an empty field as a positive answer. How would you phrase the missing information?",
      "For the demo, a list makes hours and seating easier to compare, while a map helps with distance. We are considering a list by default and a map toggle. What task would help us test the order?",
      "In the synthetic project, a location's hours can change. We added a date beside the source and an explicit unknown state. Should an old entry remain searchable if its age is obvious?"],
    replies:["Keep unknown separate from unavailable. Those two states lead to different decisions.","I would show a way to contact the location beside the dated source.","Give the reader a comparison task. The best default may depend on whether they already know the neighborhood."],
    storyTitles:["Why an unknown field deserves its own state","Making a list easier to compare"],
    stories:["Synthetic demo story. Quiet Corner is a fictional study-space finder. Its sample data includes venues with different opening hours and incomplete accessibility notes.\n\nThe team initially used a blank cell for every missing value. In their simulated review, that made it impossible to tell whether a detail was absent, irrelevant, or simply unchecked. They changed the design to make those states explicit.\n\nThe linked project history shows how the group divided the comparison view, route notes, and opening-hours work. The handoffs and reflections are illustrative material, not records of a real student team.",
      "This is an authored synthetic example for the public blog. Quiet Corner's fictional team tried to fit every venue detail into one card. That made the list dense and the most useful comparisons difficult to spot.\n\nTheir sample redesign brings opening hours, seating, and noise preference into the same order for every venue. Additional notes remain available below. The group would next ask a reader to choose a place under a specific time constraint.\n\nThat proposed task connects the interface decision to evidence they would need. No completed usability test is implied."] },
  { key:"pantry-path",team:"Neighborhood Table",project:"Pantry Path",people:["Elena Cruz","Omar Hassan","Priya Shah"],
    description:"A fictional community pantry directory that explains opening times, eligibility notes, and what visitors should confirm before travelling.",
    features:["Browse pantry information","Explain eligibility and source dates","Build an accessible mobile view"],
    decisions:["Use plain-language descriptions with source links.","Label example information as fictional and keep eligibility details qualified.","Make contact and opening-time information readable on a narrow screen."],
    questions:["How much information belongs in the first view of a directory?","How do you make a filter understandable on a phone?","What is a useful handoff when a data source still needs checking?"],
    bodies:["The fictional Pantry Path directory has many fields, but a person deciding whether to travel may need only a few immediately. Our sample first view shows hours, location, and a contact route. What would you put next?",
      "This demo explores a mobile filter with clear labels and a visible reset action. We want the selected filters to remain obvious when the results change. How would you help someone understand an empty result?",
      "Our synthetic handoff marks a source-verification task as unfinished. It records which fields need checking and avoids marking the entire feature done. What detail would help the next teammate continue?"],
    replies:["An empty result should show the filters that caused it and offer an easy reset.","A handoff can name the unresolved question and explain how the next person could verify it.","Separate opening times from eligibility. Readers may need to check both before making a trip."],
    storyTitles:["A useful directory starts with a clear next step","Writing a handoff while a question is still open"],
    stories:["Synthetic demo story. Pantry Path is a fictional community directory, and none of its example entries should be used as real service information.\n\nThe sample team organized its first screen around a visitor's next decision. Opening times, location, and a contact route come before longer descriptive text. The group also recorded which source details would need verification before any real launch.\n\nThe public portfolio demonstrates how those choices can be carried through features, handoffs, and reflections. It is an example of the Collavibe workflow, not a claim that a pantry service has been deployed.",
      "This is a fictional account created to demonstrate a public project blog. One Pantry Path task had working layout behavior but unresolved source questions. A vague handoff saying 'finished' would have hidden that distinction.\n\nThe sample handoff instead identifies the completed interface work, the fields awaiting verification, and a next step for another contributor. It leaves the feature in review.\n\nVisitors can follow the linked portfolio to see the simulated history and leave their own feedback after signing in. All demo participants and progress records are synthetic."] }
];
const discussionReplies = [
  [
    ["Show the forecast timestamp beside it. A partial result can still be useful if its age is clear.", "Keep the air-quality retry separate so the working forecast does not disappear again.", "We would also suspend any combined recommendation until both inputs are available."],
    ["I would make remembering a place an explicit choice, especially on a shared computer.", "A visible recent-location list is easier to understand than silently restoring the last search.", "Let someone clear the saved location without deleting unrelated preferences."],
    ["Lead with the reason for the suggested time, then expose the numbers that support it.", "Show the units and timestamps. Otherwise two values may appear comparable when they are not.", "A missing source should change the wording of the recommendation, not just add a small warning."]
  ],
  [
    ["Use 'not yet checked' and provide a contact route. An empty cell is too ambiguous.", "Keep 'step-free access unavailable' separate from 'we do not know'.", "Add the date and source of each confirmed note so a reader knows what they are relying on."],
    ["Try a task with two constraints, such as a nearby place open after six with quiet seating.", "A list can compare those constraints quickly. The map becomes useful after narrowing the choices.", "Remember the selected view, but keep both controls easy to reach on a phone."],
    ["Keep the listing, but distinguish reported hours from recently confirmed hours.", "Place a contact link beside the stale value so there is an obvious next step.", "Avoid sorting an uncertain opening time as if it were definitely open."]
  ],
  [
    ["Put the next action beside the essential details, such as checking hours with the location.", "Eligibility and opening times answer different questions. Give each a clear label.", "Keep the longer description available without pushing the contact route below several screens."],
    ["Show the active filters above the results and explain when they produce no matches.", "A clear-all action helps, but also let someone remove just one filter.", "Keep the result count visible after the filter panel closes."],
    ["Name the exact fields that still need checking and link the intended source.", "Say which interface checks are complete so the next person does not repeat all the work.", "Record the unresolved question and the decision that depends on it, then leave the feature in review."]
  ]
];
const manifestPath=".collavibe/public-demo-manifest.json";
await mkdir(".collavibe",{recursive:true});
let state: Record<string,any> = {};
try { state=JSON.parse(await readFile(manifestPath,"utf8")); } catch(error:any) { if(error.code!=="ENOENT") throw error; }
async function once<T>(key:string, action:()=>Promise<T>):Promise<T> {
  if(Object.hasOwn(state,key))return state[key];
  const value=await action();state[key]=value;
  await writeFile(manifestPath,JSON.stringify(state,null,2),{mode:0o600});
  return value;
}
const db=getSupabaseAdmin();
const teams:any[]=[];
for(const d of definitions) {
  const people:Actor[]=[];
  for(let i=0;i<d.people.length;i++) {
    people.push(await once(d.key+":person:"+i,async()=>{
      const email=`collavibe-public-demo-${d.key}-${i}@example.com`;
      const created=await db.auth.admin.createUser({email,password:randomUUID()+randomUUID(),email_confirm:true,user_metadata:{name:d.people[i]+" (demo)",synthetic_demo:true}});
      throwSupabaseError(created.error);
      return {id:created.data.user!.id,name:d.people[i]+" (demo)",email};
    }));
  }
  const team=await once(d.key+":team",()=>cloudCreateTeam({userId:people[0].id,name:d.team+" (demo)"}));
  for(const person of people.slice(1))await once(d.key+":join:"+person.id,()=>cloudJoinTeam({userId:person.id,joinCode:team.joinCode}));
  // Reserved .invalid domain identifies this as a synthetic repository, not a real hosted app.
  const project=await once(d.key+":project",()=>cloudAddProject(people[0].id,team.id,{name:d.project+" (demo)",repositoryUrl:`https://example.invalid/collavibe-demo/${d.key}`}));
  const sessionIds:string[]=[],featureIds:string[]=[];
  for(let i=0;i<3;i++){
    const actor={userId:people[i].id,teamId:team.id,name:people[i].name,tokenId:"synthetic-demo-seed"};
    const git={root:project.root,remote:project.root,branch:"demo/"+d.key+"-"+i,head:"0".repeat(40),dirty:false,workingFiles:[],branches:[],recentCommits:[],trackedFiles:[],capturedAt:new Date().toISOString()};
    const started=await once(d.key+":session:"+i,()=>startHostedSession({actor,project:{key:project.root,name:project.name,git},intent:"Synthetic demo session: "+d.features[i]}));
    const sessionId=started.session.id;
    const chosen=await once(d.key+":feature:"+i,()=>chooseHostedWorkItem({actor,sessionId,newFeature:{title:d.features[i],description:"Synthetic example feature. "+d.decisions[i],checklist:["Explain the intended behavior","Consider the empty and failure states","Leave the next contributor a clear question"]}}));
    await once(d.key+":sync:"+i,()=>syncHostedSession({actor,sessionId,summary:"Synthetic handoff: "+d.features[i],workCompleted:["Illustrative design step: "+d.decisions[i]],decisions:[d.decisions[i]],blockers:i===2?["Demo scenario: needs a real user review before release."]:[],nextSteps:["Proposed next step: ask a teammate to review the explanation and edge cases."],changedFiles:[],endGit:git,featureStatus:i===2?"blocked":"review"}));
    await once(d.key+":reflection:"+i,()=>writeReflection(people[i],team.id,project.id,sessionId,{text:"Synthetic demo reflection. "+d.decisions[i]+" The next check in this fictional scenario would be whether another person can explain the result and its limits.",publicConsent:true}));
    sessionIds.push(sessionId);featureIds.push(chosen.feature.id);
  }
  const fields={title:d.project+" — demo project",description:"SYNTHETIC DEMO. The people, team, project history, reflections, and reported work on this page are fictional examples. "+d.description+" No real implementation, commit history, or user evaluation is claimed.",sessionIds,featureIds,includeReflections:true};
  const portfolio=await once(d.key+":portfolio",async()=>{const preview=await previewPortfolio(people[0],team.id,project.id,fields);return publishPortfolio(people[0],team.id,project.id,{...fields,previewHash:preview.previewHash,consentConfirmed:true});});
  const learner=await once(d.key+":learner",async()=>{
    await saveLearnerPortfolio(people[1],team.id,{title:d.people[1]+"'s demo learning portfolio",introduction:"Synthetic learner portfolio. All four projects and reflections are illustrative examples.",projects:["first-build","two-api","reliable-data","final-project"].map((assignmentId,i)=>({assignmentId,title:["A small checklist","Two sources, one view","Reliable results",d.project][i]+" (demo)",problem:"Fictional exercise: help someone compare information and decide what to do next.",tools:"Illustrative HTML, CSS, JavaScript, and a coding agent.",decision:d.decisions[i%3],evidence:"Synthetic evidence plan: check normal, empty, missing-data, and narrow-screen cases. These are proposed checks, not real results."}))});
    const preview=await previewLearnerPortfolio(people[1],team.id);
    return publishLearnerPortfolio(people[1],team.id,{expectedVersion:preview.version,previewHash:preview.previewHash,consent:true});
  });
  const stories=[];
  for(let i=0;i<2;i++){
    const draft=await once(d.key+":story-draft:"+i,()=>saveCourseStory(people[i],team.id,{title:"[Demo] "+d.storyTitles[i],body:d.stories[i],portfolioId:portfolio.id,demoUrl:"https://collavibe.vercel.app/course/portfolio/"+learner!.publicId}));
    const story=await once(d.key+":story:"+i,async()=>{const preview=await previewCourseStory(people[i],team.id,draft.id);return publishCourseStory(people[i],team.id,draft.id,{expectedVersion:preview.version,previewHash:preview.previewHash,publicConsent:true});});
    stories.push(story.id);
  }
  const threads=[];
  for(let i=0;i<3;i++)threads.push(await once(d.key+":thread:"+i,()=>postPublicDiscussion(people[i],{teamId:team.id,title:"[Demo] "+d.questions[i],body:d.bodies[i],category:["update","question","comparison"][i],groupName:d.team+" (demo)",evidenceUrl:"https://collavibe.vercel.app/p/"+portfolio.id,publicConsent:true})));
  teams.push({definition:d,people,team,project,portfolio,learner,stories,threads,sessionIds});
}
for(let i=0;i<teams.length;i++){
  const target=teams[i],other=teams[(i+1)%teams.length];
  for(let t=0;t<target.threads.length;t++)for(let r=0;r<3;r++){
    const body="Synthetic demo reply. "+discussionReplies[i][t][r];
    const id=await once(target.definition.key+":reply:"+t+":"+r,()=>postPublicDiscussion(other.people[r],{teamId:other.team.id,body,publicConsent:true},target.threads[t]));
    const row=await findRecord(id);
    if(!row || row.authorId!==other.people[r].id || row.payload.courseEntry!=="public-discussion-reply")throw Error("Demo reply identity mismatch");
    if(row.payload.body!==body)await saveRecord(other.people[r],reviseRecord(row,{...row.payload,body}),row.version);
  }
  for(let r=0;r<3;r++)await once(target.definition.key+":feedback:"+r,()=>portfolioFeedback(other.people[r],target.portfolio.id,{text:"Synthetic demo feedback. "+target.definition.replies[r],sessionId:target.sessionIds[r],publicConsent:true}));
}
const catalog=teams.map(t=>({name:t.definition.project,team:t.definition.team,description:t.definition.description,people:t.definition.people,portfolio:"/p/"+t.portfolio.id,learnerPortfolio:"/course/portfolio/"+t.learner.publicId,stories:t.stories.map((id:string)=>"/blog#"+id),threads:t.threads.map((id:string)=>"/forum#"+id)}));
await writeFile("public/examples.json",JSON.stringify({synthetic:true,projects:catalog},null,2));
const posts=await publicForum(),stories=await publicCourseStories();
for(const t of teams){
  for(const id of t.threads){const post=posts.find(p=>p.id===id);if(!post||post.replies.length<3)throw Error("Missing demo discussion or replies");}
  for(const id of t.stories)if(!stories.some(s=>s.id===id))throw Error("Missing public story");
  if((await publicPortfolio(t.portfolio.id)).snapshot.sessions.length!==3)throw Error("Incomplete project portfolio");
  if((await publicLearnerPortfolio(t.learner.publicId)).projects.length!==4)throw Error("Incomplete learner portfolio");
}
console.log(JSON.stringify({teams:3,people:9,projects:3,sessions:9,features:9,projectPortfolios:3,learnerPortfolios:3,blogPosts:6,discussions:9,replies:27,portfolioComments:9,verified:true}));

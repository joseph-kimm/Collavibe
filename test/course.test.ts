import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";
import { course } from "../src/course-content.js";
import { courseAccount,ownIntake,saveIntake,organizerIntakes,removeIntake } from "../src/course.js";
let f:Awaited<ReturnType<typeof collaborationFixture>>;
beforeAll(async()=>{f=await collaborationFixture();});afterAll(async()=>{await f.cleanup();});
const fields={experience:"new",interests:"Music tools",goals:"Understand the data my app uses",support:"Plain-language examples",organizerConsent:true};
describe("course and private learner intake",()=>{
  it("has five implementable two-hour sessions and real resources",()=>{expect(course.sessions).toHaveLength(5);for(const session of course.sessions){expect(session.agenda.reduce((total,row)=>total+row.minutes,0)).toBe(120);for(const id of session.resources)expect(course.resources.some(row=>row.id===id)).toBe(true);}expect(JSON.stringify(course)).not.toContain("placeholder");});
  it("only returns safe course account metadata",async()=>{const account=await courseAccount(f.member);expect(account.teams).toEqual([{id:f.teamId,name:"Collaboration test",organizer:false}]);expect(JSON.stringify(account)).not.toContain("joinCode");});
  it("keeps intake away from peers and outsiders and requires consent",async()=>{await expect(saveIntake(f.member,f.teamId,{...fields,organizerConsent:false})).rejects.toThrow();const row=await saveIntake(f.member,f.teamId,fields);expect((await ownIntake(f.owner,f.teamId))).toBeNull();expect((await organizerIntakes(f.owner,f.teamId))[0].id).toBe(row.id);await expect(organizerIntakes(f.member,f.teamId)).rejects.toMatchObject({status:403});await expect(ownIntake(f.outsider,f.teamId)).rejects.toMatchObject({status:403});});
  it("rejects stale updates and removes the stored response body",async()=>{const row=(await ownIntake(f.member,f.teamId))!;await expect(saveIntake(f.member,f.teamId,fields)).rejects.toMatchObject({status:409});await removeIntake(f.member,f.teamId,row.version);expect(await ownIntake(f.member,f.teamId)).toBeNull();expect(await organizerIntakes(f.owner,f.teamId)).toHaveLength(0);});
});

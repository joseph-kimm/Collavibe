import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTeam } from "../src/store.js";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";
import { addCourseDiscussion } from "../src/course-community.js";
import { publicForum, postPublicDiscussion, removePublicDiscussion } from "../src/public-forum.js";
let f: Awaited<ReturnType<typeof collaborationFixture>>;
beforeAll(async()=>{f=await collaborationFixture();});
afterAll(async()=>{await f.cleanup();});
const content=()=>({teamId:f.teamId,title:"Testing an API timeout",category:"question",body:"What did you do when one API timed out?",publicConsent:true});
describe("public forum boundaries",()=>{
  it("keeps existing private cohort posts out of anonymous results",async()=>{
    const id=await addCourseDiscussion(f.member,f.teamId,{category:"question",title:"PRIVATE_COHORT",body:"This stays in our private cohort."});
    expect(JSON.stringify(await publicForum())).not.toContain(id);
  });
  it("requires consent and team membership before public posting",async()=>{
    await expect(postPublicDiscussion(f.member,{...content(),publicConsent:false})).rejects.toThrow();
    await expect(postPublicDiscussion(f.outsider,content())).rejects.toMatchObject({status:403});
  });
  it("exposes only public fields, allows replies and removes threads with their replies",async()=>{
    const id=await postPublicDiscussion(f.member,{...content(),body:"My private address is private@example.com but this is a public question."});
    const reply=await postPublicDiscussion(f.owner,{teamId:f.teamId,body:"Try a partial result.",publicConsent:true},id);
    const row=(await publicForum()).find(r=>r.id===id)!;
    expect(row.replies.map(r=>r.id)).toContain(reply);
    expect(JSON.stringify(row)).not.toContain("private@example.com");
    expect(row).not.toHaveProperty("teamId");expect(row).not.toHaveProperty("authorId");
    expect(row.canRemove).toBe(false);
    await expect(removePublicDiscussion(f.outsider,id,{expectedVersion:row.version})).rejects.toMatchObject({status:403});
    await expect(removePublicDiscussion(f.member,id,{expectedVersion:99})).rejects.toMatchObject({status:409});
    await removePublicDiscussion(f.member,id,{expectedVersion:row.version});
    expect((await publicForum()).find(r=>r.id===id)).toBeUndefined();
    await expect(postPublicDiscussion(f.owner,{teamId:f.teamId,body:"Late reply",publicConsent:true},id)).rejects.toMatchObject({status:404});
  });
  it("lets another team's member reply publicly without gaining private cohort access", async()=>{
    const team=await createTeam({userId:f.outsider.id,name:"Another public community"});
    const id=await postPublicDiscussion(f.member,content());
    const reply=await postPublicDiscussion(f.outsider,{teamId:team.id,body:"We kept the successful API result.",publicConsent:true},id);
    const row=(await publicForum(f.outsider)).find(r=>r.id===id)!;
    expect(row.canRemove).toBe(false);expect(row.replies[0].canRemove).toBe(true);
    await removePublicDiscussion(f.outsider,id,{expectedVersion:1},reply);
    expect((await publicForum()).find(r=>r.id===id)!.replies).toHaveLength(0);
  });
  it("rejects private posts as public reply targets",async()=>{
    const id=await addCourseDiscussion(f.member,f.teamId,{category:"question",title:"Private question",body:"This discussion belongs to the cohort."});
    await expect(postPublicDiscussion(f.member,{teamId:f.teamId,body:"Public reply",publicConsent:true},id)).rejects.toMatchObject({status:404});
  });
});

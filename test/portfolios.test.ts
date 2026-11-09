import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";
import { mutate } from "../src/store.js";
import { portfolioFeedback, previewPortfolio, publishPortfolio, publicPortfolio, revokePortfolio, removePortfolioFeedback, feedbackPermissions, publicText } from "../src/portfolios.js";
import { writeReflection } from "../src/session-learning.js";
import { createMeeting } from "../src/meetings.js";
import { portfolioContent, safeHref } from "../public/portfolio-content.js";
import { safeReturnTo } from "../public/auth-return.js";

let f: Awaited<ReturnType<typeof collaborationFixture>>;
const fields = () => ({ title: "How we built the app", description: "A reviewed record of our design decisions and experiments.", sessionIds: [f.sessionId], featureIds: [], includeReflections: true });
beforeAll(async () => {
  f = await collaborationFixture();
  await mutate(state => { const session=state.sessions.find(item=>item.id===f.sessionId)!; session.intent="Built validation; contact private@example.com; local file /Users/private/app.ts; token sk-secret12345678901234567890"; });
});
afterAll(async () => { await f.cleanup(); });

describe("opt-in reviewed public portfolio", () => {
  it("projects only selected public-safe fields and requires an owner", async () => {
    const preview = await previewPortfolio(f.owner,f.teamId,f.projectId,fields());
    const text=JSON.stringify(preview.snapshot);
    expect(text).not.toContain("private@example.com"); expect(text).not.toContain("/Users/private"); expect(text).not.toContain("sk-secret123");
    expect(preview.snapshot).not.toHaveProperty("teamId"); expect(preview.snapshot).not.toHaveProperty("repositoryUrl");
    await expect(previewPortfolio(f.member,f.teamId,f.projectId,fields())).rejects.toMatchObject({status:403});
    await expect(previewPortfolio(f.owner,f.teamId,f.projectId,{...fields(),sessionIds:["foreign-session"]})).rejects.toMatchObject({status:400});
  });
  it("requires explicit publication consent and rejects previews made before source changes", async () => {
    const preview=await previewPortfolio(f.owner,f.teamId,f.projectId,fields());
    await expect(publishPortfolio(f.owner,f.teamId,f.projectId,{...fields(),previewHash:preview.previewHash})).rejects.toThrow();
    await mutate(state=>{state.sessions.find(item=>item.id===f.sessionId)!.intent += " Updated decision.";});
    await expect(publishPortfolio(f.owner,f.teamId,f.projectId,{...fields(),previewHash:preview.previewHash,consentConfirmed:true})).rejects.toMatchObject({status:409});
  });
  it("excludes meeting transcripts and team-only notes; consent can be withdrawn from an existing snapshot", async () => {
    await createMeeting(f.owner,f.teamId,f.projectId,{title:"Private discussion",transcript:"PRIVATE_MEETING_DO_NOT_PUBLISH",consentConfirmed:true});
    let note=await writeReflection(f.member,f.teamId,f.projectId,f.sessionId,{text:"PRIVATE_LEARNING_NOTE"});
    const privatePreview=await previewPortfolio(f.owner,f.teamId,f.projectId,fields());
    expect(JSON.stringify(privatePreview)).not.toContain("PRIVATE_LEARNING_NOTE"); expect(JSON.stringify(privatePreview)).not.toContain("PRIVATE_MEETING");
    note=await writeReflection(f.member,f.teamId,f.projectId,f.sessionId,{text:note.payload.text,expectedVersion:note.version,publicConsent:true});
    const preview=await previewPortfolio(f.owner,f.teamId,f.projectId,fields());
    const published=await publishPortfolio(f.owner,f.teamId,f.projectId,{...fields(),previewHash:preview.previewHash,consentConfirmed:true});
    expect(JSON.stringify(await publicPortfolio(published.id))).toContain("PRIVATE_LEARNING_NOTE");
    await writeReflection(f.member,f.teamId,f.projectId,f.sessionId,{text:note.payload.text,expectedVersion:note.version,publicConsent:false});
    const page=JSON.stringify(await publicPortfolio(published.id));
    expect(page).not.toContain("PRIVATE_LEARNING_NOTE");expect(page).not.toContain("PRIVATE_MEETING");expect(page).not.toContain("authorId");
  });
  it("lets a signed-in visitor discuss a selected session without joining or accessing the team", async () => {
    const preview=await previewPortfolio(f.owner,f.teamId,f.projectId,fields());
    const published=await publishPortfolio(f.owner,f.teamId,f.projectId,{...fields(),previewHash:preview.previewHash,consentConfirmed:true});
    await expect(portfolioFeedback(f.outsider,published.id,{text:"An idea",sessionId:f.sessionId})).rejects.toThrow();
    const feedback=await portfolioFeedback(f.outsider,published.id,{text:"Could you explain why the empty response needed different treatment?",sessionId:f.sessionId,publicConsent:true});
    expect((await publicPortfolio(published.id)).feedback).toHaveLength(1);
    expect((await feedbackPermissions(f.outsider,published.id)).removableIds).toContain(feedback.id);
    await expect(removePortfolioFeedback(f.member,published.id,feedback.id)).rejects.toMatchObject({status:403});
    await expect(portfolioFeedback(f.outsider,published.id,{text:"Wrong session",sessionId:"foreign-session",publicConsent:true})).rejects.toMatchObject({status:400});
    await removePortfolioFeedback(f.owner,published.id,feedback.id);
    expect((await publicPortfolio(published.id)).feedback).toHaveLength(0);
  });
  it("revokes public read and feedback access immediately", async () => {
    const preview=await previewPortfolio(f.owner,f.teamId,f.projectId,fields());
    const published=await publishPortfolio(f.owner,f.teamId,f.projectId,{...fields(),previewHash:preview.previewHash,consentConfirmed:true});
    await expect(revokePortfolio(f.member,f.teamId,f.projectId,published.id,published.version)).rejects.toMatchObject({status:403});
    await revokePortfolio(f.owner,f.teamId,f.projectId,published.id,published.version);
    await expect(publicPortfolio(published.id)).rejects.toMatchObject({status:404});
    await expect(portfolioFeedback(f.outsider,published.id,{text:"No longer public",publicConsent:true})).rejects.toMatchObject({status:404});
  });
  it("escapes hostile text and rejects unsafe links and login return destinations", async () => {
    const preview=await previewPortfolio(f.owner,f.teamId,f.projectId,{...fields(),description:"<img src=x onerror=alert(1)> A hostile description."});
    expect(portfolioContent(preview.snapshot)).not.toContain("<img"); expect(portfolioContent(preview.snapshot)).toContain("&lt;img");
    expect(safeHref("javascript:alert(1)")).toBe(""); expect(safeHref("https://secret:token@example.com")).toBe("");
    expect(publicText("https://example.com?api_key=secret-value")).toBe("[private URL]");
    for(const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/api/teams", "/course/../api/private"]) expect(safeReturnTo(path)).toBe("");
    expect(safeReturnTo("/course")).toBe("/course");
    expect(safeReturnTo("/course/community#post_12345678-1234-1234-1234-123456789012")).toBe("/course/community#post_12345678-1234-1234-1234-123456789012");
    expect(safeReturnTo("/p/portfolio_12345678-1234-1234-1234-123456789012")).toContain("/p/portfolio_");
  });
});

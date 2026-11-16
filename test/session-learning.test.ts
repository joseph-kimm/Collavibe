import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { previewPortfolio } from "../src/portfolios.js";
import { mutate } from "../src/store.js";
import { reflectionSourceLabel } from "../public/reflection-source.js";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";
import { removeLearningEntry, sessionLearning, writeReflection, writeSessionReply, writeSessionComment } from "../src/session-learning.js";

let f: Awaited<ReturnType<typeof collaborationFixture>>;
beforeAll(async () => { f = await collaborationFixture(); });
afterAll(async () => { await f.cleanup(); });

describe("session reflection provenance and discussion", () => {
  it("records the account author without assuming human writing, privately by default", async () => {
    const row = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "I learned why we validate an API response.", authorId: f.member.id });
    expect(row.authorId).toBe(f.owner.id); expect(row.payload.humanWritten).toBe(false); expect(row.payload.authorship).toBe("unspecified"); expect(row.payload.publicConsent).toBe(false);
    expect((await sessionLearning(f.member, f.teamId, f.projectId, f.sessionId)).records).toContainEqual(row);
  });
  it("requires explicit personal attestation and labels synthetic/assisted writing", async () => {
    let row = (await sessionLearning(f.owner, f.teamId, f.projectId, f.sessionId)).records[0];
    row = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "My experience", authorship: "personal", expectedVersion: row.version });
    expect(row.payload.humanWritten).toBe(true);
    row = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: row.payload.text, publicConsent: true, expectedVersion: row.version });
    expect(row.payload.authorship).toBe("personal");
    row = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "Replacement without attestation", expectedVersion: row.version, humanWritten: true });
    expect(row.payload.authorship).toBe("unspecified"); expect(row.payload.humanWritten).toBe(false);
    for (const authorship of ["synthetic", "ai_assisted"] as const) {
      row = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "Example", authorship, expectedVersion: row.version, humanWritten: true });
      expect(row.payload.authorship).toBe(authorship); expect(row.payload.humanWritten).toBe(false);
    }
    await expect(writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "Invalid source", authorship: "verified_human", expectedVersion: row.version })).rejects.toThrow();
  });
  it("preserves legacy record contents but does not render the old automatic flag as attestation", async () => {
    const row = (await sessionLearning(f.owner, f.teamId, f.projectId, f.sessionId)).records[0];
    await mutate(state => {
      const legacy = state.collaborationRecords!.find(record => record.id === row.id)!;
      delete legacy.payload.authorship;
      legacy.payload.humanWritten = true;
    });
    const legacy = (await sessionLearning(f.member, f.teamId, f.projectId, f.sessionId)).records.find(record => record.id === row.id)!;
    expect(legacy.payload.text).toBe(row.payload.text);
    expect(legacy.payload.humanWritten).toBe(true);
    expect(reflectionSourceLabel(legacy.payload.authorship)).toBe("Authorship not specified");
    expect(reflectionSourceLabel("__proto__")).toBe("Authorship not specified");
  });
  it("rejects outsiders, unknown sessions, and mismatched projects", async () => {
    await expect(sessionLearning(f.outsider, f.teamId, f.projectId, f.sessionId)).rejects.toMatchObject({ status: 403 });
    await expect(writeReflection(f.owner, f.teamId, f.projectId, "missing", { text: "No" })).rejects.toMatchObject({ status: 404 });
    await expect(sessionLearning(f.owner, f.teamId, "other-project", f.sessionId)).rejects.toMatchObject({ status: 404 });
  });
  it("keeps one reflection per author and session, rejects stale edits, and permits consent withdrawal", async () => {
    const row = (await sessionLearning(f.owner, f.teamId, f.projectId, f.sessionId)).records[0];
    const edited = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "I changed my mind after testing.", publicConsent: true, expectedVersion: row.version });
    expect(edited.id).toBe(row.id);
    await expect(writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "Stale", expectedVersion: row.version })).rejects.toMatchObject({ status: 409 });
    const withdrawn = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: edited.payload.text, expectedVersion: edited.version, publicConsent: false });
    expect(withdrawn.payload.publicConsent).toBe(false);
  });
  it("supports teammate replies and replies to replies without spoofing authors", async () => {
    const root = (await sessionLearning(f.owner, f.teamId, f.projectId, f.sessionId)).records[0];
    const reply = await writeSessionReply(f.member, f.teamId, f.projectId, f.sessionId, { parentId: root.id, text: "Which response surprised you?", authorName: "Owner" });
    const nested = await writeSessionReply(f.owner, f.teamId, f.projectId, f.sessionId, { parentId: reply.id, text: "The empty result was still a successful response." });
    expect(reply.authorName).toBe("Member"); expect(nested.payload.rootId).toBe(root.id); expect(nested.payload.parentId).toBe(reply.id);
    await expect(writeSessionReply(f.member, f.teamId, f.projectId, f.sessionId, { parentId: "another-session-entry", text: "Invalid target" })).rejects.toMatchObject({ status: 404 });
  });
  it("validates text and only lets the author or owner remove entries", async () => {
    await expect(writeReflection(f.member, f.teamId, f.projectId, f.sessionId, { text: " " })).rejects.toThrow();
    const root = (await sessionLearning(f.owner, f.teamId, f.projectId, f.sessionId)).records[0];
    await expect(removeLearningEntry(f.member, f.teamId, f.projectId, f.sessionId, root.id, root.version)).rejects.toMatchObject({ status: 403 });
    const own = await writeReflection(f.member, f.teamId, f.projectId, f.sessionId, { text: "My own note" });
    await removeLearningEntry(f.owner, f.teamId, f.projectId, f.sessionId, own.id, own.version);
    expect((await sessionLearning(f.owner, f.teamId, f.projectId, f.sessionId)).records.some(row => row.id === own.id)).toBe(false);
  });
});

describe("standalone session comments", () => {
  it("allows a teammate question without inventing a reflection or public consent", async () => {
    const comment = await writeSessionComment(f.member, f.teamId, f.projectId, f.sessionId, {text:"  PRIVATE_SESSION_QUESTION  ", authorId:f.owner.id, publicConsent:true});
    expect(comment.authorId).toBe(f.member.id);
    expect(comment.payload).toEqual({sessionId:f.sessionId,text:"PRIVATE_SESSION_QUESTION",discussion:true,rootId:comment.id});
    const reply = await writeSessionReply(f.owner, f.teamId, f.projectId, f.sessionId, {parentId:comment.id,text:"Team answer"});
    expect(reply.payload.discussion).toBe(true);expect(reply.payload.rootId).toBe(comment.id);
    expect((await sessionLearning(f.member,f.teamId,f.projectId,f.sessionId)).records).toContainEqual(reply);
    const preview = await previewPortfolio(f.owner,f.teamId,f.projectId,{title:"Public example",description:"A selected public demonstration",sessionIds:[f.sessionId],featureIds:[],includeReflections:true});
    expect(JSON.stringify(preview)).not.toContain("PRIVATE_SESSION_QUESTION");expect(JSON.stringify(preview)).not.toContain("Team answer");
    await removeLearningEntry(f.member,f.teamId,f.projectId,f.sessionId,comment.id,comment.version);
    await expect(writeSessionReply(f.owner,f.teamId,f.projectId,f.sessionId,{parentId:reply.id,text:"Reply after root deletion"})).rejects.toMatchObject({status:404});
  });
  it("rejects outsiders, invalid content and archived-project comments",async()=>{
    await expect(writeSessionComment(f.outsider,f.teamId,f.projectId,f.sessionId,{text:"Unauthorized"})).rejects.toMatchObject({status:403});
    await expect(writeSessionComment(f.member,f.teamId,f.projectId,"missing",{text:"Unknown"})).rejects.toMatchObject({status:404});
    for(const text of [" ","x".repeat(2001)]) await expect(writeSessionComment(f.member,f.teamId,f.projectId,f.sessionId,{text})).rejects.toThrow();
    await mutate(state=>{state.projects.find(p=>p.id===f.projectId)!.archivedAt=new Date().toISOString();});
    await expect(writeSessionComment(f.member,f.teamId,f.projectId,f.sessionId,{text:"Archived"})).rejects.toMatchObject({status:409});
    await mutate(state=>{delete state.projects.find(p=>p.id===f.projectId)!.archivedAt;});
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";
import { removeLearningEntry, sessionLearning, writeReflection, writeSessionReply } from "../src/session-learning.js";

let f: Awaited<ReturnType<typeof collaborationFixture>>;
beforeAll(async () => { f = await collaborationFixture(); });
afterAll(async () => { await f.cleanup(); });

describe("human session reflection and discussion", () => {
  it("persists a human-authored reflection, not a generated handoff, privately by default", async () => {
    const row = await writeReflection(f.owner, f.teamId, f.projectId, f.sessionId, { text: "I learned why we validate an API response.", authorId: f.member.id });
    expect(row.authorId).toBe(f.owner.id); expect(row.payload.humanWritten).toBe(true); expect(row.payload.publicConsent).toBe(false);
    expect((await sessionLearning(f.member, f.teamId, f.projectId, f.sessionId)).records).toContainEqual(row);
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

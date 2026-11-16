import { beforeEach, describe, expect, it, vi } from "vitest";
import { amendHandoff, hostedDelta, hostedCommitSchema, fullGitHashSchema, type CommitRange } from "../src/hosted-evidence.js";
import { amendHostedSession, syncHostedSession } from "../src/hosted.js";
import { sessionCommits, commitEvidenceNotice } from "../public/commit-evidence.js";
import type { CollaborationSession, GitSnapshot, GitCommit } from "../src/types.js";

const { db, member } = vi.hoisted(() => ({ db: { from: vi.fn(), rpc: vi.fn() }, member: vi.fn() }));
vi.mock("../src/supabase.js", () => ({ getSupabaseAdmin: () => db, throwSupabaseError: (error: any) => { if (error) throw new Error(error.message); } }));
vi.mock("../src/cloud-workspace.js", () => ({ cloudRequireMember: member }));
const base = "a".repeat(40), head = "b".repeat(40), old = "c".repeat(40), merge = "d".repeat(40);
const commit = (hash: string, author = "Shani"): GitCommit => ({ hash, shortHash: hash.slice(0,7), author, authoredAt: "2026-11-16T12:00:00Z", subject: "A recorded change" });
const snapshot = (hash: string, recentCommits: GitCommit[] = []): GitSnapshot => ({ root: "https://github.com/example/test", branch: "main", head: hash, dirty: false, workingFiles: [], branches: [], recentCommits, trackedFiles: [], capturedAt: "2026-11-16T12:00:00Z" });
const actor = { userId: "shani", teamId: "team", tokenId: "token", name: "Shani" };
const range: CommitRange = { baseHead: base, head, commits: [commit(head), commit(merge, "Other collaborator")] };
function saved(): CollaborationSession {
  return { id: "session_test_001", projectId: "project_test", repoPath: "https://github.com/example/test", participant: "Shani", userId: actor.userId, featureId: "feature_done", status: "synced", startedAt: "2026-11-16T12:00:00Z", syncedAt: "2026-11-16T13:00:00Z", startSnapshot: snapshot(base, [commit(base)]), sync: { summary: "Built and tested the timer.", workCompleted: ["Added timer"], decisions: [], blockers: [], nextSteps: ["Old step"], agentReportedFiles: ["timer.js"], verified: { source: "agent_attested", startHead: base, endHead: head, startBranch: "main", endBranch: "main", commits: [commit(head),commit(merge),commit(old)], changedFiles: ["timer.js"], workingFiles: [], reportedButUnverified: [] } } };
}
const amendment = { expectedRevision: 0, correctionReason: "Removed an older bootstrap commit that was not in the Git range.", commitRange: range, handoff: { nextSteps: ["Review the merged timer"] } };
let record: CollaborationSession;
let feature: { status: string; checklist: Array<{ done: boolean }> };
const project = { id: "project_test", name: "Test", root: "https://github.com/example/test", remote: null, latest_git: snapshot("e".repeat(40)), created_at: "2026-11-16T10:00:00Z", updated_at: "2026-11-16T14:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks(); record = saved(); feature = { status: "done", checklist: [{ done: true }] };
  member.mockResolvedValue({ id: "team", name: "Test team" });
  db.from.mockImplementation((table: string) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "collaboration_sessions" ? { payload: structuredClone(record) } : { project_id: record.projectId }, error: null }), single: async () => ({ data: structuredClone(project), error: null }) };
    return query;
  });
  db.rpc.mockImplementation(async (_name: string, args: any) => {
    if (JSON.stringify(args.expected_session) !== JSON.stringify(record)) return { error: { code: "PT409", message: "Concurrent session update" } };
    record = structuredClone(args.session_data);
    if (args.feature_data) feature = args.feature_data;
    return { error: null };
  });
});

describe("precise hosted commit evidence", () => {
  it("rejects malformed38-character hashes and mismatched short IDs; accepts full SHA1/SHA256", () => {
    expect(fullGitHashSchema.safeParse("a".repeat(38)).success).toBe(false);
    expect(fullGitHashSchema.safeParse("eb208ce859c29915a48d9b1a41ae074942a03d3f9a").success).toBe(false);
    expect(fullGitHashSchema.safeParse("eb208ce859c29915a48d9b41ae074942a03d3f9a").success).toBe(true);
    expect(fullGitHashSchema.safeParse("a".repeat(40)).success).toBe(true);
    expect(fullGitHashSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(hostedCommitSchema.safeParse({ ...commit(head), shortHash: "abc1234" }).success).toBe(false);
  });
  it("never infers new work from differing or truncated recent histories", () => {
    const delta = hostedDelta(snapshot(base, [commit(base)]), snapshot(head, [commit(head),commit(old)]), ["timer.js"]);
    expect(delta.commits).toEqual([]);
    expect(delta.unverifiedRecentCommits?.map(row => row.hash)).toEqual([head,old]);
    expect(delta.commitEvidence).toBe("recent_context_only");
    expect(commitEvidenceNotice(delta)).toContain("unverified repository context");
    expect(sessionCommits({ sync: { ...saved().sync!, verified: delta } })).toEqual([]);
    expect(sessionCommits(saved())).toEqual([]); // Existing hosted logs are also not proof of a range.
  });
  it("accepts only an explicit matching range and retains merge/other-author metadata", () => {
    const delta = hostedDelta(snapshot(base), snapshot(head, [commit(old)]), ["timer.js"], range);
    expect(delta.commits).toEqual(range.commits);
    expect(delta.unverifiedRecentCommits).toBeUndefined();
    expect(() => hostedDelta(snapshot(base),snapshot(head),[],{...range,baseHead:old})).toThrow("match");
    expect(() => hostedDelta(snapshot(base),snapshot(head),[],{...range,commits:[commit(head),commit(head)]})).toThrow("duplicate");
    expect(() => hostedDelta(snapshot(base),snapshot(head),[],{...range,commits:[commit(base)]})).toThrow("exclude");
    expect(() => hostedDelta(snapshot(base),snapshot(base),[],{baseHead:base,head:base,commits:[commit(head)]})).toThrow();
  });
  it("uses the same safe fallback through the real hosted sync handler", async () => {
    record.status = "active"; delete record.sync; delete record.featureId;
    const result = await syncHostedSession({ actor, sessionId: record.id, summary: "Tested one completed change.", workCompleted: [], decisions: [], blockers: [], nextSteps: [], changedFiles: ["timer.js"], endGit: snapshot(head,[commit(head),commit(old)]) });
    expect(result.attestation.commits).toEqual([]);
    expect(result.session.syncRevision).toBe(1);
  });
});

describe("own-session auditable correction", () => {
  it("retains the entire original handoff and does not rewrite its identity or boundaries", () => {
    const before = saved(); const revised = amendHandoff(before,actor.userId,amendment,"2026-11-16T15:00:00Z");
    expect(revised.sync?.verified.commits).toEqual(range.commits);
    expect(revised.sync?.nextSteps).toEqual(amendment.handoff.nextSteps);
    expect(revised.syncHistory?.[0].sync).toEqual(before.sync);
    expect(revised.syncHistory?.[0]).toMatchObject({ revision: 0, correctedBy: actor.userId, reason: amendment.correctionReason });
    expect(revised.syncRevision).toBe(1); expect(revised.syncedAt).toBe(before.syncedAt);
    expect(revised.startSnapshot).toEqual(before.startSnapshot); expect(revised.participant).toBe(before.participant);
    expect(before.sync?.verified.commits).toHaveLength(3);
    expect(() => amendHandoff(revised,actor.userId,amendment)).toThrow("changed");
    expect(() => amendHandoff(revised,actor.userId,{...amendment,expectedRevision:1})).toThrow("does not change");
    expect(() => amendHandoff(before,"other-account",amendment)).toThrow("original session");
    expect(() => amendHandoff({...before,status:"active"},actor.userId,amendment)).toThrow("synced");
  });
  it("persists through atomic RPC with original-session CAS and leaves Done feature/project state untouched", async () => {
    const before = structuredClone(record); const projectBefore = structuredClone(project);
    const result = await amendHostedSession({ actor, sessionId: record.id, ...amendment });
    expect(result.session.syncRevision).toBe(1);
    expect(record.syncHistory?.[0].sync).toEqual(before.sync);
    expect(feature).toEqual({ status: "done", checklist: [{ done: true }] });
    const args = db.rpc.mock.calls[0][1];
    expect(args.feature_data).toBeNull(); expect(args.expected_session).toEqual(before);
    expect(args.project_data.latestGit).toEqual(projectBefore.latest_git);
    expect(args.project_data.updatedAt).toBe(projectBefore.updated_at);
    await expect(amendHostedSession({ actor, sessionId: record.id, ...amendment })).rejects.toMatchObject({status:409});
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it("denies another account and outsiders, and surfaces a concurrent database conflict", async () => {
    await expect(amendHostedSession({ actor:{...actor,userId:"other"},sessionId:record.id,...amendment })).rejects.toMatchObject({status:403});
    expect(db.rpc).not.toHaveBeenCalled();
    member.mockRejectedValueOnce(Object.assign(new Error("Not a member"),{status:403}));
    await expect(amendHostedSession({actor,sessionId:record.id,...amendment})).rejects.toMatchObject({status:403});
    db.rpc.mockResolvedValueOnce({error:{code:"PT409",message:"Concurrent session update"}});
    await expect(amendHostedSession({actor,sessionId:record.id,...amendment})).rejects.toMatchObject({status:409});
    expect(record.syncRevision).toBeUndefined();
  });
});

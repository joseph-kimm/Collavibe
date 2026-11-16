import { z } from "zod";
import type { CollaborationSession, GitSnapshot, SessionSync, VerifiedDelta } from "./types.js";
import { WorkspaceError } from "./workspace-model.js";

export const fullGitHashSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i, "Use the complete 40- or 64-character Git object ID.");
export const hostedCommitSchema = z.object({
  hash: fullGitHashSchema,
  shortHash: z.string().regex(/^[a-f0-9]{4,32}$/i),
  author: z.string().min(1).max(300),
  authoredAt: z.string().min(10).max(100),
  subject: z.string().min(1).max(1000),
}).refine(commit => commit.hash.toLowerCase().startsWith(commit.shortHash.toLowerCase()), "Short hash must match the complete commit hash.");
export const commitRangeSchema = z.object({
  baseHead: fullGitHashSchema,
  head: fullGitHashSchema,
  commits: z.array(hostedCommitSchema).max(1000),
}).strict().describe("Exact output of git log BASE..HEAD, including merges/other authors. BASE is the session start HEAD, HEAD is its end HEAD. Do not subtract two recent-log lists.");
export type CommitRange = z.infer<typeof commitRangeSchema>;
const handoffText = z.string().min(1).max(2000);
export const handoffCorrectionSchema = z.object({
  summary: z.string().min(12).max(10000).optional(),
  workCompleted: z.array(handoffText).max(100).optional(),
  decisions: z.array(handoffText).max(100).optional(),
  blockers: z.array(handoffText).max(100).optional(),
  nextSteps: z.array(handoffText).max(100).optional(),
  changedFiles: z.array(z.string().min(1).max(4096)).max(500).optional(),
}).strict();
export const amendmentSchema = z.object({
  expectedRevision: z.number().int().min(0),
  correctionReason: z.string().trim().min(12).max(2000),
  commitRange: commitRangeSchema,
  handoff: handoffCorrectionSchema.optional(),
}).strict();
export type HandoffAmendment = z.infer<typeof amendmentSchema>;

export function validateCommitRange(range: CommitRange, base: string, head: string): CommitRange {
  const parsed = commitRangeSchema.parse(range);
  if (parsed.baseHead !== base || parsed.head !== head) throw new WorkspaceError("Commit range must match this session's recorded start and end HEAD exactly.", 400);
  const hashes = parsed.commits.map(commit => commit.hash.toLowerCase());
  if (new Set(hashes).size !== hashes.length) throw new WorkspaceError("Commit range contains duplicate commits.", 400);
  if (hashes.includes(base.toLowerCase()) || (base === head && hashes.length)) throw new WorkspaceError("Commit range must exclude the starting HEAD and contain no commits when the HEAD is unchanged.", 400);
  return parsed;
}

export function hostedDelta(start: GitSnapshot, end: GitSnapshot, files: string[], range?: CommitRange): VerifiedDelta {
  const exact = range ? validateCommitRange(range, start.head, end.head) : undefined;
  return {
    source: "agent_attested", startHead: start.head, endHead: end.head,
    startBranch: start.branch, endBranch: end.branch,
    // Recent logs can be truncated or malformed. They are context, not a Git range.
    commits: exact?.commits || [],
    commitRange: exact ? { baseHead: exact.baseHead, head: exact.head } : undefined,
    commitEvidence: exact ? "explicit_range" : "recent_context_only",
    unverifiedRecentCommits: exact ? undefined : end.recentCommits,
    changedFiles: [...new Set(files)].sort(), workingFiles: end.workingFiles, reportedButUnverified: [],
  };
}

export function amendHandoff(session: CollaborationSession, actorId: string, raw: HandoffAmendment, now = new Date().toISOString()): CollaborationSession {
  if (session.userId !== actorId) throw new WorkspaceError("Only the original session account can correct this handoff.", 403);
  if (session.status !== "synced" || !session.sync) throw new WorkspaceError("Only a synced handoff can be corrected.", 409);
  const input = amendmentSchema.parse(raw);
  const revision = session.syncRevision || 0;
  if (input.expectedRevision !== revision) throw new WorkspaceError("This handoff changed. Reload context before correcting it.", 409);
  const range = validateCommitRange(input.commitRange, session.startSnapshot.head, session.sync.verified.endHead);
  const { changedFiles, ...fields } = input.handoff || {};
  const sync: SessionSync = {
    ...structuredClone(session.sync), ...fields,
    verified: { ...structuredClone(session.sync.verified), commits: range.commits, commitRange: { baseHead: range.baseHead, head: range.head }, commitEvidence: "explicit_range" },
  };
  delete sync.verified.unverifiedRecentCommits;
  if (changedFiles) { sync.agentReportedFiles = [...new Set(changedFiles)].sort(); sync.verified.changedFiles = sync.agentReportedFiles; }
  if (JSON.stringify(sync) === JSON.stringify(session.sync)) throw new WorkspaceError("This correction does not change the handoff.", 409);
  return {
    ...session, sync, syncRevision: revision + 1, syncUpdatedAt: now,
    syncHistory: [...(session.syncHistory || []), {
      revision, recordedAt: session.syncUpdatedAt || session.syncedAt || session.startedAt,
      correctedAt: now, correctedBy: actorId, reason: input.correctionReason,
      sync: structuredClone(session.sync),
    }],
  };
}

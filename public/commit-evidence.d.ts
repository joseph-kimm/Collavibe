import type { CollaborationSession, GitCommit, VerifiedDelta } from "../src/types.js";
export function sessionCommits(session: Pick<CollaborationSession, "sync">): GitCommit[];
export function commitEvidenceNotice(evidence?: VerifiedDelta): string;

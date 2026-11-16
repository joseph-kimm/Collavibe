// A recent-log list is not a session range. Legacy hosted comparisons stay readable
// in the detail view, but are excluded from session-work counts and new portfolios.
export function sessionCommits(session) {
  const evidence = session?.sync?.verified;
  if (evidence?.source === "agent_attested" && evidence.commitEvidence !== "explicit_range") return [];
  return evidence?.commits || [];
}
export function commitEvidenceNotice(evidence) {
  if (evidence?.source === "local_git") return "Read from local Git.";
  if (evidence?.commitEvidence === "explicit_range") return "Exact start-to-end commit range reported by the coding agent; not independently checked by Collavibe. The range can include merges and other authors' work.";
  if (evidence?.commitEvidence === "recent_context_only") return "No exact session commit range was supplied. Recent commits are unverified repository context and are not counted as session work.";
  return "Legacy recent-log evidence. This was not checked as an exact session range and may include older work. It is not counted as session work.";
}

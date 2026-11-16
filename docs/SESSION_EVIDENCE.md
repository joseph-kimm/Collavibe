# Hosted session Git evidence and corrections

The hosted MCP cannot inspect a developer's Git repository. Commit evidence is supplied by the coding agent and labeled accordingly.

## Recording the session range

Obtain `startHead` from `get_sync_template`. Use Git to generate the exact `startHead..endHead` range, including merge commits and commits by other people. Do not manually transcribe hashes or subtract two bounded `git log -n` results. Populate full 40-character SHA-1 or 64-character SHA-256 IDs, matching short IDs, author, authoredAt, and subject. Include it in `sync_collaboration_session`:

```json
{
  "commitRange": {
    "baseHead": "FULL_RECORDED_START_HEAD",
    "head": "FULL_RECORDED_END_HEAD",
    "commits": []
  }
}
```

The actual tool call also needs its existing handoff and endGit fields. Range boundaries must match the saved session start and supplied end snapshot. Identical start/end heads require an empty range. Duplicate commits and the excluded start commit are rejected. A range describes repository history during the session, not proof that the session's account authored every commit.

For older clients omitting `commitRange`, the handoff still saves. Its recent-log list is retained only as unverified repository context, with zero inferred session commits. Legacy hosted handoffs without explicit ranges remain readable but their commit lists are labeled unverified and excluded from session-work counts and newly generated portfolios. Local Git evidence is unaffected. Already published portfolio snapshots are not automatically rewritten.

## Correcting a saved handoff

The same account that created the session may call `amend_collaboration_session`:

- `sessionId`: existing synced session.
- `expectedRevision`: current `syncRevision`; use 0 only for old records with no revision property.
- `correctionReason`: factual reason, at least 12 characters.
- `commitRange`: complete replacement range with the existing start/end boundaries.
- Optional `handoff`: any of summary, workCompleted, decisions, blockers, nextSteps, changedFiles. Omitted values are retained; supplied arrays replace the corresponding array.

The operation rejects another account, an unsynced session, stale revisions, and an unchanged correction. It atomically compares the original session snapshot before saving. Each correction increments the revision and appends the entire previous handoff, correction reason, timestamp, and account ID to `syncHistory`. The website exposes this under Handoff corrections. It does not rewrite the original participant, start snapshot, sync time, selected feature status/checklist, or current project Git state. Correcting an archived project requires restoring the project first, consistent with the existing database write boundary.

The supported path uses the normal authenticated MCP connection. It requires no direct database edits or migration.

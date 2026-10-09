# QA results — 2026-10-09

Branch tested: `codex/collavibe-session-sync`

This report records the final local verification pass for the Collavibe MCP prototype. It separates executed evidence from future production work.

## Automated verification

| Check | Result |
| --- | --- |
| TypeScript compilation | Passed |
| Vitest suite | 3 files, 22 tests passed |
| Clean `npm ci` | Passed without engine warnings |
| Full dependency audit | 0 vulnerabilities |
| Git whitespace validation | Passed |
| Working tree before report | Clean |

The suite includes Git edge cases, session-state transitions, concurrent persistence, Streamable HTTP behavior, restart recovery, response redaction, remote-credential stripping, client input limits, and a text fallback for clients that ignore MCP `structuredContent`. The detailed matrix and commands are in [TESTING.md](TESTING.md).

## MCP protocol verification

The official MCP Inspector CLI passed strict tool-schema checks through both transports:

- Streamable HTTP: `http://127.0.0.1:4317/mcp`
- stdio: `npx tsx server/stdio.ts`

Observed contract:

- 5 tools: `get_project_context`, `start_collaboration_session`, `choose_work_item`, `get_sync_template`, and `sync_collaboration_session`
- 2 prompts: `start` and `sync`
- Accurate read-only, destructive, and open-world annotations
- Valid application errors for a nonexistent repository, invalid participant, missing session, duplicate selection, duplicate sync, and unsupported `done` claim

## Concurrency and recovery

- 24 concurrent stdio processes wrote 24 unique sessions to one state file.
- 12 concurrent HTTP clients initialized and wrote 12 unique sessions.
- Both runs preserved one project, valid JSON, every participant, and no orphaned lock file.
- An automated HTTP test killed and restarted the server, then confirmed the prior session was restored.
- A stale-lock test confirmed that an abandoned lock is recovered and removed.

## Real coding-agent verification

A real Codex agent, running read-only with a disposable state path:

1. discovered `start_collaboration_session` through MCP;
2. created a session and returned the current branch and work-option kinds;
3. selected a new test feature;
4. fetched the sync template; and
5. synchronized the session.

Collavibe correctly returned `synced`, with zero verified commits and zero verified changed files for that no-code transport test. This confirms the agent summary did not create false Git evidence.

Claude Code's MCP health check reports Collavibe connected. Claude Desktop launched the configured stdio process, completed MCP initialization and tool discovery, and then executed a user-approved, read-only `get_project_context` call. The first live call exposed a client-compatibility gap: Claude Desktop used the tool's text block but did not surface its `structuredContent`, so the model could report the branch and counts but not the project name or HEAD hash. Collavibe now includes the same redacted public payload in both representations. A second live call returned all five requested fields exactly: project `Collavibe`, branch `codex/collavibe-session-sync`, HEAD `4198dfe`, 2 features, and 2 sessions. The Claude MCP log independently recorded the matching `tools/call` request and successful one-block response.

## Project-map verification

The browser view was checked at its default desktop size and at a 390 by 844 mobile viewport:

- repository and remote-tracking refs rendered without duplication in agent work choices;
- selected-feature state and keyboard focus were exposed accessibly;
- completed checklist items included visible and screen-reader status;
- verified commit author, subject, hash, and file paths were distinct from the agent-authored summary;
- refresh completed without console warnings or errors; and
- no internal working-tree fingerprints appeared in MCP or browser responses.

## Security and production boundary

The development HTTP server now binds to `127.0.0.1` by default. Git credentials are removed from stored remote URLs, state writes are atomic and inter-process locked, inputs are bounded, and internal file fingerprints are not returned to clients.

This is still a local prototype. A shared deployment requires user authentication, repository-level authorization, a transactional database, rate limiting, structured operational logs, HTTPS, and deployment-level recovery tests.

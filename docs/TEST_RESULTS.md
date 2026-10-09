# QA results — 2026-10-09

Branch tested: `codex/collavibe-session-sync`

This report records the local and hosted verification pass for the Collavibe MCP preview. It separates executed evidence from future production hardening.

## Automated verification

| Check | Result |
| --- | --- |
| TypeScript compilation | Passed |
| Vitest suite | 4 files, 28 tests passed |
| Clean `npm ci` | Passed without engine warnings |
| Full dependency audit | 0 vulnerabilities |
| Git whitespace validation | Passed |
| Working tree before report | Clean |

The suite includes Git edge cases, session-state transitions, concurrent persistence, Streamable HTTP behavior, restart recovery, response redaction, remote-credential stripping, client input limits, a text fallback for clients that ignore MCP `structuredContent`, local account authentication, team membership, invite codes, hosted team-code publishing, and team-scoped repository attachment. The detailed matrix and commands are in [TESTING.md](TESTING.md).

## Hosted Supabase and Vercel flow

The Supabase project was provisioned on the free tier with Auth, seven application tables, user-profile trigger, membership checks, and row-level security. Two live disposable-user flows verified:

1. account signup and immediate authenticated session;
2. team creation with an eight-character code;
3. a second account joining with the lowercase form of that code;
4. team membership isolation;
5. a local MCP process inspecting a real Git checkout and publishing through the hosted sync endpoint; and
6. both the repository and new session appearing in the authenticated team dashboard.

Disposable users and orphaned test projects were deleted after verification. Backend Supabase keys are stored only as hidden Vercel secrets and in an ignored local environment file.

The production deployment `dpl_Yfd2GrFqv1BD4E4EstDJbN946LZ3` completed successfully and is aliased to [collavibe.vercel.app](https://collavibe.vercel.app). Vercel reports the deployment as Ready, all three Supabase values are present in the Production environment, and Vercel Authentication was explicitly disabled so third-party users can reach the signup screen.

## Account and team workflow

A disposable browser and state directory were used to verify the complete human and agent handoff:

1. an owner account created `Learning Lab` with an attached Git repository;
2. Collavibe generated the eight-character code `9DN438HF` for that disposable team;
3. a second account logged in and joined using the lowercase-insensitive code;
4. the workspace reported two members and exposed the shared repository only after membership was established;
5. a separate HTTP MCP client called `start_collaboration_session` with the team code; and
6. the new `choosing` session appeared in the joined member's project map after refresh.

The disposable credentials and state were isolated from the main Collavibe data file. Visual checks covered the account gateway, create-or-join step, team selector, copyable code, repository tree, and team-scoped activity feed.

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

The hosted preview now has Supabase authentication, transactional shared storage, row-level security, server-only backend credentials, and HTTPS. The local MCP still performs Git inspection so the hosted service never reads a developer filesystem. Before broader production use, persistent team-code agent access should be replaced with scoped revocable tokens, and the service still needs repository-provider authorization, rate limiting, structured operational logs, and deployment-level load and recovery tests.

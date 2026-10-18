# QA results — 2026-10-17 — v0.7.0

Branch: `codex/collavibe-workspace`. Runtime commit: `e5ff9ee`.
Production: https://collavibe.vercel.app
Production deployment: `dpl_dcwfg4mPqSmY4rPyDaheoWUNVATg` (Ready).

## Executed verification

- TypeScript and all 42 automated tests pass across six files. Dependency audit reports zero vulnerabilities.
- Both cloud scripts pass on preview `collavibe-3s68owo5q-shayan-ahmads-projects.vercel.app` and the stable production alias.
- `hosted-smoke.ts`: signup, create/join team, readiness, website project/feature planning and editing, stale-edit rejection, outsider and owner permissions, MCP start/claim/template/sync, shared dashboard, member removal, preservation of another member's connection, and personal-key revocation.
- `access-smoke.ts`: official MCP SDK discovery and dynamic registration; public and confidential OAuth clients; browser-bound consent; cancellation; PKCE rejection; code replay rejection; exact resource binding; account-bound sessions; cross-session denial; token refresh rotation and replay rejection; revocation; member removal; secret redaction; trusted/untrusted browser origin checks; and distributed rate budgets.
- Direct database requests authenticated as an ordinary user cannot read another team's seeded feature or session, or read the credential table. These checks do not rely only on the application's service-role API.
- Two independent teams can track the same repository without sharing records.
- Simultaneous claims produce exactly one winner. Simultaneous syncs produce exactly one saved outcome. Unknown checklist identifiers fail without partially syncing.
- Browser QA in Chrome covers real cloud signup, team/project/feature creation, OAuth consent followed by an authenticated MCP request, personal-key creation/use/revocation, and immediate clearing of the raw key when the dialog closes.
- Chrome at 390 × 844 and WebKit with iPhone 15 emulation pass responsive checks. WebKit search, sessions, mobile navigation, and agent setup work; form text is 16 px to avoid mobile input zoom. No horizontal overflow is observed, the detail drawer fills the viewport, and primary mobile controls are 44 px tall.
- The production sample and connection panel render with zero browser console errors or warnings. Sample records remain explicitly fictional and read-only.
- Repeated local OAuth testing reached the configured 120-request budget: attempt 121 was rejected. One test run stopped at that rate limit; the full access flow subsequently passed on preview and production without disabling limits.
- Concurrency testing exposed delayed responses when application conflicts used SQLSTATE `40001`. Changing those conflicts to explicit `PT409` responses eliminated the failure; both race checks pass.

## Changes and boundary

Invitation codes no longer authorize MCP calls. OAuth and personal keys authorize one account, team, and resource. The bulk state-replacement bridge is retired. The original database feature/session read policies were corrected, and multi-record MCP changes now use atomic PostgreSQL transactions with revision checks.

All disposable script records and the separately named Browser QA fixture were removed. Existing accounts and teams are preserved. No branch was merged into main. See [ACCESS.md](ACCESS.md) for the migration, trust model, and remaining work.

This is a testable beta, not an independent security certification or an unlimited-scale production claim. OAuth was exercised using the official SDK and a browser consent flow; this release was not separately approved through every vendor's desktop/mobile client. Email verification/recovery delivery, repository-provider push verification, retention/deletion controls, and sustained load testing remain further work.

---

## Earlier workspace verification — v0.6.0

Branch: `codex/collavibe-workspace`. Version: `0.6.0`.

- TypeScript and 38 automated tests pass across five files. The new checks cover project URL validation, project and feature access boundaries, owner-only team operations, stale edit rejection, checklist IDs, code rotation, removal, and HTTP origin checks.
- The cloud smoke workflow passes against the Supabase backend: signup, team creation, readiness, website project creation, feature planning/editing, stale-edit rejection, outsider rejection, invitation joining, owner permission checks, team renaming, member listing, MCP start, claiming the planned feature, template, sync, dashboard, member removal, and invalidation of the old MCP code. The script removes the accounts and records it created.
- Real browser checks cover signup, team/project/feature creation, feature editing, checklist persistence after reload, search, team rename persistence, invitation copying, client configuration, and repository-specific prompts.
- A two-account browser test verifies that an invite survives signup, members see the shared project, owner controls stay disabled for members, removal resets the code, and the removed account loses website access.
- Desktop and 390 × 844 mobile layouts are inspected with screenshots. Sample data is explicitly labeled and does not write to the server.
- Browser testing caught an input-reset bug caused by asynchronous member loading. Team name input is now preserved while the user types.
- The database was found paused in the Supabase dashboard and resumed. Before cloud tests, there were two existing accounts and two teams, with no projects/features/sessions; those records are preserved.
- The final cloud smoke test passed on preview `collavibe-5w8ym2wg6-shayan-ahmads-projects.vercel.app` and production `https://collavibe.vercel.app/mcp`. It also verified that an agent session preserves the project's website-defined name. Production deployment `dpl_Fvtdubo5fPHr1sTD8m5RVk35GhP7` is Ready.
- The deployed preview passed browser signup, cloud team/project/feature creation, editing, checklist persistence after reload, a project JSON download, team rename, agent setup, and logout with no console errors. Search, filters, handoff Markdown downloads, mobile project switching, and mobile agent setup also passed.

This release still uses a team code for MCP authorization. OAuth, individual agent credentials, GitHub webhook verification, and atomic multi-record MCP transactions remain outside this verification claim. See [WORKSPACE.md](WORKSPACE.md) for capabilities and limits.

## Historical verification — 2026-10-09

Branch tested: `codex/collavibe-session-sync`

This report records the local and hosted verification pass for the Collavibe MCP preview. It separates executed evidence from future production hardening.

## Automated verification

| Check | Result |
| --- | --- |
| TypeScript compilation | Passed |
| Vitest suite | 4 files, 29 tests passed |
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

The tested production deployment is aliased to [collavibe.vercel.app](https://collavibe.vercel.app). Vercel reports the deployment as Ready, all three Supabase values are present in the Production environment, and deployment protection is disabled so third-party users can reach the signup screen and hosted MCP.

### Hosted MCP production test

The official TypeScript MCP client connected directly to `https://collavibe.vercel.app/mcp`; no Collavibe process was running on the client machine. The test discovered all five tools and completed `start_collaboration_session`, `choose_work_item`, `get_sync_template`, and `sync_collaboration_session` across independent stateless HTTP requests. Supabase preserved the project, selected feature, completed checklist, synced session, commit, and changed file. The authenticated production dashboard returned the same session with evidence source `agent_attested`.

The same smoke test passed first against a Vercel preview and then against the stable production alias. Both runs deleted their disposable user, team, project, feature, and session afterward. A database audit confirmed that no smoke-test teams or projects remained and that the pre-existing real account and team were untouched.

### Production end-to-end retest

The stable production alias was retested after deployment with two separate browser sessions and a real local stdio MCP client. The test verified owner signup, team creation, lowercase invite-code joining, MCP `start_collaboration_session`, `choose_work_item`, and `sync_collaboration_session`, shared project visibility from both accounts, and returning-user logout/login. The synchronized no-code test correctly displayed zero verified commits and zero changed files. The disposable project, team, accounts, and local MCP state were removed after the test.

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

The hosted preview now has Supabase authentication, transactional shared storage, row-level security, server-only backend credentials, HTTPS, and a stateless remote MCP endpoint. The coding agent inspects its checkout and sends a sanitized snapshot; the remote service explicitly labels this evidence `agent_attested` because it cannot independently read the developer filesystem. Before broader production use, persistent team-code agent access should be replaced with scoped revocable tokens, and the service still needs repository-provider authorization, rate limiting, structured operational logs, and deployment-level load and recovery tests.

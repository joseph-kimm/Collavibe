# QA results

## Public landing page and design system - October 19, 2026

- All 77 automated tests across nine files and TypeScript checks pass. Eight new homepage cases cover the absence of a sample-workspace entry, unique HTML identifiers, all three workflow stages, account-mode/focus behavior, invitation and authorization context, reduced motion, clipboard failure fallback, and the SVG allowlist. Browser-JavaScript syntax and whitespace checks also pass.
- Local Chrome QA on isolated data passed account creation, team creation, repository-link/project creation, feature/checklist creation, reload persistence, logout, and a second login. No production records were created or edited. The existing app now uses the same button and icon treatments as the landing page.
- Landing workflow switches between start/build/sync, updates the explanation, and responds to Enter. Copy example prompt displayed success, and the actual saved prompt was pasted into a local test name field to verify clipboard contents, then cleared without submitting it.
- At 320 and 390 CSS px, the document width matched the viewport. Primary landing actions measured 50 px tall. The mobile workspace menu and logout worked; account actions focused the correct field. No local browser warning/error logs were observed. Invitation and agent-authorization links scrolled directly to the real account form and displayed the correct context without printing invitation/auth tokens.
- These checks are browser-emulated and do not claim universal physical-device or assistive-technology coverage. The legacy explicit `?demo=1` route remains available for internal regression testing; it is no longer linked from the homepage.
- Runtime `f1b25f0` passed Vercel preview QA at https://collavibe-p2lgxwgsu-shayan-ahmads-projects.vercel.app (`dpl_99rBHhxRvCBp6foUJ8mACM2jKa9e`): workflow switching/copy feedback, real signup-mode field focus, 27 hydrated local icons, no sample entry, and 320 px reflow. A Chrome-extension listener error was observed; no application-origin error was observed.
- Its production deployment `dpl_5j9CYWmcJNXpCeF6V4G9uk9F4gU8` reached Ready at https://collavibe.vercel.app. Signed-out production controls responded correctly; the existing signed-in member session still opened Team1's real project map with one feature, one synced session, two commits, the final recorded branch, and four completed checklist items. No production writes or sign-outs were used for this verification.
- Final runtime `57d6ae2` retains the full asset-license notices in the browser-served icon module. Preview `dpl_J1e9eNtEnie4NyDziDYzpGhcZDR8` passed workflow/icon checks, then production `dpl_2Frh8F6V5utj8Mixb7i6hMR6PKnU` reached Ready at https://collavibe.vercel.app. Final production checks confirmed the public page, interactive explanation, 27 hydrated icons, and unchanged Team1 access; a homepage screenshot was saved. Only extension-origin listener errors were observed. All 77 tests and whitespace checks remain passing. Local QA server 4323 was stopped; the separate sample-project server was left untouched.

## Interactive map and readability - October 19, 2026

- All 69 automated tests across eight files, TypeScript, browser-JavaScript syntax, and whitespace checks pass. New pure-model cases cover project scoping, multiple contributors, assignment versus session evidence, contributor/status/priority/archive/search filters, unlinked sessions, deduplicated commit counts, empty data, corrected final-branch display, coherent demo branches, and a small-font regression guard.
- Local Chrome sample QA passed feature/contributor grouping, Expand all (10 disclosures), Collapse all (0 open disclosures), person filtering (Sam only, two relevant features), no-match search, clearing filters, opening a handoff while retaining the map, and final branch versus starting branch labels. Native disclosures respond to Enter/Space. At 390 px, the handoff drawer fills the viewport; opening focuses its close control, and Escape returns focus to the originating session.
- Narrow-screen checks at 390 and 320 CSS px produced matching document widths. Measured normal text/sidebar 16 px, feature titles 18 px, metadata 14 px. No application console errors/warnings were observed in the local map interaction run. These are browser-emulated checks, not certification on every physical device or assistive technology.
- Isolated local-account QA passed signup, team creation, empty project/map onboarding, feature creation, the feature inspector/checklist update, map+feature URL restoration after reload, and labeled mobile logout. At 320 px the feature dialog fit within the viewport and its inputs measured 16 px. No production team records were created or edited during these local checks.
- Live MCP readback before implementation confirmed the real Team1 project still has one recorded contributor, one synced session, two commits, and the Study Table feature in review. Multi-person UI testing uses explicitly fictional browser-only sample data; no Joseph activity is invented.
- Runtime commit `9a70e1b` was pushed only to `codex/collavibe-workspace`. Vercel preview https://collavibe-dndcavinu-shayan-ahmads-projects.vercel.app (`dpl_91hHLDhCXthHBcJKFiebLF4VdFEH`) passed live grouping, collapse/expand, Sam filtering, final-branch handoff inspection, and 320 px reflow checks. A Chrome-extension message-listener error appeared; no application-origin error was observed.
- Following explicit publication approval, production deployment `dpl_6GTUtA8A64Qz4xtnU4fzL93P2ir5` is Ready at https://collavibe.vercel.app. The existing signed-in member account sees the shared Team1 map with Shayan Ahmad's real feature, synced session, four completed checklist items, two commits, and eleven changed files. The inspector correctly separates final branch `codex/study-table-landing` from starting branch `main`.
- Production at 390 x 844 measured a 390 px document, 16 px normal text, 18 px feature titles, and a 390 px handoff drawer. Opening focuses the close control and Escape closes it. No browser errors/warnings were recorded in that live interaction. Native MCP readback still returns the same real synced session and branch; production records were not mutated for this UI verification.
- No merge into main, database migration, manufactured collaborator activity, or new sample-project deployment was performed. Goal requirements are satisfied for this tested release; this remains browser-emulated beta QA, not universal physical-device or assistive-technology certification.

## Repository and account clarity - October 19, 2026

- TypeScript, JavaScript syntax, whitespace checks, and all 56 automated tests pass. Seven new repository-presentation tests distinguish saved links, real agent snapshots, and fictional sample data; they also cover SSH URLs, other Git providers, missing snapshot fields, and unsafe or credential-bearing links.
- Chrome local browser QA passed signup, team creation, project creation, persistence after reload, the linked repository section, no-snapshot guidance, and opening Connect agent from the repository section. All writes used an isolated local state file, not Team1's cloud records.
- Chrome at 390 x 844 showed a 390 px document width. Mobile navigation, the labeled logout action, and logout resetting the menu's expanded state were checked. The sample-to-workspace action restored the signed-in local account; leaving a sample without a session returned to login. No warning/error browser logs were recorded in this run.
- Preview runtime commit: `42764f9`. Vercel deployment `dpl_2wXnWdh3uxV2zuCCU7CZwoA1FHXr` is Ready at https://collavibe-771w81r48-shayan-ahmads-projects.vercel.app. Preview browser checks passed repository presentation and mobile navigation, including the inert background and expanded state. The document width matched the 390 px viewport. One Chrome-extension message-listener error was recorded; no application-origin error was observed in that check.
- After explicit approval, the tested preview was promoted. Production deployment `dpl_69jQ9aojW3si3b6dbxprWq99MptP` is Ready and aliased to https://collavibe.vercel.app. The signed-in Team1 browser shows `shayanahmad7/collavibe-test`, the waiting-for-agent-snapshot status, Copy URL / Connect agent actions, and a text-labeled Log out button. Live mobile verification returned document width 390 for viewport 390, expanded navigation, and an inert background; the menu was closed and the viewport reset afterward. Team1's records were not edited during verification, and the user's session remains signed in.
- These changes affect presentation and navigation, not the hosted MCP protocol, database schema, or GitHub access permissions. Only `codex/collavibe-workspace` was pushed; no merge into main was performed.

## Released v0.8.0: lifecycle and discussion

Runtime commit: `11b878f`. Branch: `codex/collavibe-workspace` (main unchanged).
Final tested preview: https://collavibe-qphlf61av-shayan-ahmads-projects.vercel.app (`dpl_2wS88xHfYXU7HtC5SLjXo2hwHHYm`).
Production: https://collavibe.vercel.app (`dpl_7WL1xJCP1DnHhK2jgL9o132XYK8M`, Ready).

- TypeScript and 49 automated tests pass across six files. Dependency audit: zero vulnerabilities. Git whitespace checks pass.
- New tests cover valid/invalid calendar dates and priority values, concurrent comments, identity binding, comment-author/owner permissions, preserving discussions during feature edits, stale revisions, recoverable feature/project archives, archived write/claim rejection, and active-session archive rejection. The HTTP tests exercise the new routes, not only pure helpers.
- Local Chrome browser QA passed actual signup, team/project/feature creation, priority/due-date entry, posting and reopening a comment after reload, HTML escaping, feature archive/restore, owner project rename/archive/restore, discussion-draft preservation on Refresh, and preservation/recovery during an injected 503 outage.
- Local WebKit iPhone 15 emulation verified posting a comment and editing priority/due date, with both persisted after reload. A test initially attempted to click the covered list behind an open mobile drawer; it was corrected to close the drawer first. No force-click or UI bypass was used. WebKit reported no browser console errors/warnings.
- Chrome at 390 × 844: document width 390, full-height 844 detail drawer, 16 px comment input. WebKit emulation: document width matches its 393 px viewport. These are emulated checks, not physical-device certification.
- Two-account mobile QA exposed the sidebar remaining open after logout and a new login. The account/team gate now resets mobile navigation; this is included in the regression checks.
- The corrected two-account mobile run passed shared discussion, hidden owner-only project controls, own-comment removal controls, and logout/login navigation reset. Logout also returns the form to Log in instead of leaving Create account selected.
- Before this release, the then-live v0.7.0 passed fresh `hosted-smoke.ts` and `access-smoke.ts` runs. The runs verify signup/join/planning/MCP handoffs, OAuth public/confidential clients, PKCE, resource binding, RLS, concurrent claims/syncs, refresh rotation, revocation, and distributed rate limits. Disposable records were removed.
- The Mac lock was resolved and the lifecycle migration was applied through the Supabase SQL editor, with an explicit Success result. All three scripts passed against the local HTTP service connected to the real cloud database, the deployed preview, and the stable production alias.
- `workspace-smoke.ts` verified concurrent comments, identity and revision protection, owner settings, archive/restore history, active-session guards, and feature/project archive-versus-claim races with exactly one winner. Anonymous and ordinary authenticated clients cannot execute the new service-only transaction RPC directly.
- Upgrade verification found that an older browser could omit the newly added metadata fields when editing. The final runtime preserves existing priority/date values when fields are omitted, while explicit clearing remains possible. Both the automated suite and final preview/production lifecycle smoke runs verify this fix.
- Preview browser QA passed priority sorting, due-date sorting, priority filtering, and a real JSON download. The downloaded file was parsed separately and contained all three features, their priority/date values, and the discussion.
- The production browser passed fresh signup, team/project/feature creation, priority/date entry, comment persistence after reload, and project/feature archive and restore. Production health returns version `0.8.0`, mode `hosted-mcp`; readiness returns 200.
- Production Chrome at 390 × 844 passed comment posting and priority/date editing, with both persisted after reload. Document width was 390, drawer height 844, and form text 16 px. Production WebKit iPhone emulation passed filters, archive navigation, and agent setup with a 393 px document matching its viewport. Fresh production sample pages reported no console errors or warnings.
- Script and browser fixtures were removed by exact IDs. The final database audit returned the original two profiles and two teams, with zero projects, features, sessions, agent connections, OAuth clients, requests, or codes. Operational rate-limit records were preserved. An open QA page correctly lost authentication after its disposable account was removed.

This is a tested public beta, not certification for every physical device or every vendor client. Email verification/recovery delivery, provider-verified Git pushes, retention controls, independent security review, and sustained load testing remain outside this release. See [WORKSPACE.md](WORKSPACE.md) and [ACCESS.md](ACCESS.md).

## Released v0.7.0

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

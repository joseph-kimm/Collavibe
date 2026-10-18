# Workspace

## Next release: lifecycle and discussion (not deployed yet)

The feature branch adds priority and due-date fields, priority filtering and due-date sorting, feature discussions, and recoverable archives. Members can archive/restore features and post comments. Only comment authors and the team owner can remove comments. The team owner can rename, archive, or restore projects. Archived projects and features remain readable/exportable but cannot accept edits or agent claims. Active sessions must be synced before their work is archived.

Discussion drafts survive in-page refreshes and temporary outages; they are not saved across a full browser reload. Posting uses bounded compare-and-swap retries so concurrent comments are preserved. Form edits and archives return 409 on stale revisions, rather than overwriting newer work. Comments are plain text, limited to 2,000 characters each and 200 per feature.

Deployment prerequisite: apply `20261018005000_workspace_lifecycle.sql` before deploying this code. It adds a nullable archive timestamp and a service-only transaction function. Website writes and MCP claims use the same per-project lock. Do not deploy the branch before the migration and the cloud lifecycle smoke test pass.

Cloud verification command (disposable fixtures are removed in `finally`):

```sh
COLLAVIBE_SMOKE_URL=<preview-or-production-origin> node --env-file=.env.local --import tsx scripts/workspace-smoke.ts
```

New authenticated routes are `PATCH /api/teams/:teamId/projects/:projectId` (owner-only, revision required) and `POST /api/teams/:teamId/features/:featureId/actions` (`comment`, `remove-comment`, or revision-bound `archive`). Existing feature create/edit routes also accept `priority` and a calendar `dueDate` in `YYYY-MM-DD` form. Authors and timestamps are server-generated; submitted author fields cannot impersonate a teammate.

The public website is still v0.7.0 until the migration, preview checks, and production checks have been completed.

The website and MCP use the same project, feature, checklist, and session records. A feature planned on the website is returned to a coding agent as a work option. A session synced by an agent is visible on the website.

## People using Collavibe for the first time

1. Create an account, then create a team or open an invitation link.
2. Add a project using its Git repository URL. The URL is saved without fetching the repository. The project starts without fabricated branches, commits, or files.
3. Add features and their completion checklists. Set an owner, status, and branch when useful.
4. Open **Connect agent**, choose a client, and follow its setup instructions and approve a team through browser sign-in. Personal agent keys are available for clients without OAuth. The server is a general remote MCP endpoint at `https://collavibe.vercel.app/mcp`.
5. Send the prepared start prompt from a chat whose agent can access the repository. The agent supplies a Git snapshot, loads teammates' context, and asks which feature to work on.
6. At the end, send the prepared sync prompt. The agent records the handoff; syncing does not commit or push source code.

The **Work** view supports status and owner filtering, search, editing, completion checklists, and copying a feature-specific agent prompt. The **Sessions** view searches summaries, decisions, blockers, and next steps and shows full handoffs. **Branches & files** displays the most recent agent-supplied snapshot. **Export** downloads the selected project as JSON; session handoffs can be copied or downloaded as Markdown.

## Team management

Members can view the teammate list, copy invitation links, create projects, and edit features. The owner can rename a team, reset its code, and remove members. Members can leave, but the owner cannot remove themselves. Removing or leaving resets the invitation code and revokes the departing member's agent connections. Other members retain their website and agent access.

The server checks membership on each operation. Ownership is checked on team administration. Feature writes carry an expected revision and return HTTP 409 if another edit changed the feature first. Checklist identifiers are validated against the existing feature. An agent cannot claim an active feature owned by another participant without the team reassigning it first.

## Sample workspace

`/?demo=1` or **View a sample workspace** opens fictional data in the browser. Writes are disabled and sample data is never sent to the API. It is separate from signed-in team data. The sample exists to preview the interface without an account.

## Availability

`GET /health` checks whether the web/MCP process is running. `GET /api/readiness` also queries the database and returns 503 if it cannot be reached. Browser data is refreshed every 20 seconds while the tab is visible. Errors preserve the last displayed data and explicitly mark updates as paused. Forms report errors without discarding input.

Supabase free projects can pause after inactivity. The project can be resumed from the Supabase dashboard. Collavibe does not automatically buy an upgrade or change the hosting plan.

## Current limits

- Browser OAuth and personal keys authorize one user in one team. Existing code-only clients must reconnect; see [agent access](ACCESS.md).
- Remote Git snapshots and summaries are supplied by agents. There is no GitHub app or webhook that independently verifies commits or imports every push.
- Independent teams can track the same repository without sharing state. GitHub URLs with and without a trailing slash or `.git` are canonicalized.
- MCP session identity is bound to the authorizing account; teammate context remains shared within the team.
- There are no email invitations, password reset emails, notifications, or background jobs in this release.
- Browser feature edits use revision checks. MCP start, claim, and sync are atomic transactions; simultaneous conflicting changes require reloading context.

## API additions

All workspace routes require the browser session cookie except readiness. Team membership is required for project/feature operations; only owners can rename or rotate a code.

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/api/teams/:teamId/projects` | Add a remote repository by `name` and `repositoryUrl` |
| GET | `/api/teams/:teamId/members` | List names, email addresses, roles, and join dates within the team |
| PATCH | `/api/teams/:teamId` | Rename the team |
| POST | `/api/teams/:teamId/rotate-code` | Invalidate the old code and issue a new one |
| DELETE | `/api/teams/:teamId/members/:userId` | Remove a member or leave; rotate code |
| POST | `/api/teams/:teamId/projects/:projectId/features` | Create a feature |
| PATCH | `/api/teams/:teamId/features/:featureId` | Save feature fields and checklist with `expectedUpdatedAt` |
| GET | `/api/readiness` | Check database availability |

## Verification

`npm run check` runs the TypeScript checks and local automated contracts. `scripts/hosted-smoke.ts` exercises both the cloud workspace API and the five hosted MCP tools with disposable accounts, then removes only the records created by that run. It verifies planning before an agent session, stale edits, membership access, owner permissions, synced data, and code invalidation.

The client setup guidance follows [OpenAI's MCP setup](https://developers.openai.com/learn/docs-mcp), [Claude's remote connector guidance](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp), and [Cursor's MCP documentation](https://docs.cursor.com/context/model-context-protocol).

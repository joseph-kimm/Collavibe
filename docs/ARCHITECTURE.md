# Architecture

```text
Human
  |
  | account, team, invite code
  v
Hosted team workspace ───────────────────────────────┐
(Vercel + Supabase Auth/Postgres)                    |
                                                     |
Coding agent (Codex, Claude, or another MCP client) |
  |                                                  |
  | HTTPS + browser OAuth / personal key                            |
  v                                                  |
Hosted Collavibe MCP                                 |
(stateless Vercel handler)                           |
  |                                                  |
  | team-scoped projects, features, sessions         |
  └──────────────────────> Supabase <────────────────┘

The coding agent uses its native tools to inspect the local Git checkout and
sends a sanitized snapshot at session start and sync. Collavibe never receives
filesystem access and never edits, commits, or pushes source code.
```

## Stateless transport

`POST /mcp` creates a fresh MCP server and `StreamableHTTPServerTransport` for each request. No protocol session or repository state is kept in Vercel memory. Durable workflow state lives in Supabase, so a later request can be served by a different function instance.

`GET /mcp` and `DELETE /mcp` return `405` because the current tools do not use server-initiated streams or resumable protocol sessions.

## Trust boundary

The hosted service cannot independently inspect a developer laptop. It records two related claims from the coding agent:

- **Agent summary:** intent, decisions, blockers, completed work, and next steps derived from the conversation.
- **Agent-attested Git delta:** start and end commits, branches, commits, changed files, and working files supplied after the agent inspects Git.

The website names the second source agent-attested instead of verified. The original local development MCP can compute a local Git delta itself and marks that source separately as `local_git`.

## Components

- `server/oauth.ts`, `src/agent-access.ts`: browser authorization, key lifecycle, and account/resource binding.
- `server/request-limits.ts`: durable request budgets.
- `server/hosted-mcp.ts`: cloud-safe MCP tools and prompts.
- `src/hosted.ts`: team-scoped Supabase workflow for projects, features, and sessions.
- `server/http.ts`: authentication API, stateless hosted MCP route, and static project-map host.
- `src/supabase.ts`: Supabase Auth and privileged server-only database access.
- `server/mcp.ts`, `server/stdio.ts`, `src/git.ts`, `src/store.ts`: local development transport and Git-observed workflow.
- `public/`: dependency-free account onboarding and team project map.

## Identity and isolation

Every hosted call requires a revocable credential bound to one user, team, and MCP resource. Sessions bind to the account, not an agent-supplied participant name. New project IDs include the team namespace, so independent teams can track the same repository without sharing state. Every operation checks membership and project linkage. Atomic PostgreSQL mutations serialize conflicting claims and reject stale revisions.

Browser credentials are managed by Supabase Auth. The service role key remains server-side in Vercel environment variables. OAuth discovery and consent, personal key management, and database-backed request limits are implemented. Repository-provider authorization, account recovery email delivery, retention/deletion controls, sustained load testing, and an independent security audit remain further work. See [ACCESS.md](ACCESS.md).

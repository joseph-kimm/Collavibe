# Architecture

```text
Human
  |
  |  account / team / invite code
  v
Hosted team workspace (Vercel + Supabase Auth/Postgres)
  |
  v
Coding agent (Codex, Claude, or another MCP client)
  |  start / choose / sync
  v
Local Collavibe MCP server
  |-------------------|
  v                   v
Git inspection     Durable coordination state
(independent)      (projects, features, sessions)
  |                   |
  |-------------------|
            |
            v
     Sanitized cloud sync -> authenticated project map
```

## Trust boundary

The coding agent can summarize the conversation because it has the relevant chat context. That summary is useful but not treated as proof. At sync time, Collavibe independently compares the repository with the session's starting commit and working tree. The website deliberately labels these two sources separately:

- **Agent summary:** intent, decisions, blockers, and proposed next steps.
- **Verified Git delta:** commits and files observable in the repository.

## Components

- `server/mcp.ts`: shared MCP tools and prompts.
- `server/stdio.ts`: local stdio transport for desktop and CLI clients.
- `server/http.ts`: authenticated API, hosted sync endpoint, optional Streamable HTTP transport, and project-map host.
- `src/git.ts`: read-only repository inspection and delta calculation.
- `src/store.ts`: local Git-adjacent coordination state with atomic writes and an inter-process lock.
- `src/cloud-sync.ts`: redacted local-to-hosted publishing boundary.
- `src/supabase.ts`: Supabase Auth, teams, memberships, projects, features, and collaboration sessions.
- `public/`: dependency-free account onboarding and read-only team project map.

## Storage and deployment

The local MCP keeps a small ignored JSON cache beside the checkout so it can verify Git deltas. Atomic rename prevents partial files and a lock coordinates multiple local agent processes. Shared browser state lives in Supabase Postgres; authentication is handled by Supabase Auth, backend credentials remain server-only, row-level security is enabled, and the Vercel deployment serves the team workspace over HTTPS.

The hosted service cannot and should not inspect a developer laptop. The local MCP publishes sanitized snapshots and handoffs using the team code. A production hardening phase should add revocable agent tokens, rate limits, structured audit logs, and repository-provider authorization.

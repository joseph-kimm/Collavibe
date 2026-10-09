# Architecture

```text
Human
  |
  |  account / team / invite code
  v
Authenticated team workspace
  |
  v
Coding agent (Codex, Claude, or another MCP client)
  |  start / choose / sync
  v
Collavibe MCP server
  |-------------------|
  v                   v
Git inspection     Durable coordination state
(independent)      (projects, features, sessions)
  |                   |
  |-------------------|
            |
            v
     Authenticated project map
```

## Trust boundary

The coding agent can summarize the conversation because it has the relevant chat context. That summary is useful but not treated as proof. At sync time, Collavibe independently compares the repository with the session's starting commit and working tree. The website deliberately labels these two sources separately:

- **Agent summary:** intent, decisions, blockers, and proposed next steps.
- **Verified Git delta:** commits and files observable in the repository.

## Components

- `server/mcp.ts`: shared MCP tools and prompts.
- `server/stdio.ts`: local stdio transport for desktop and CLI clients.
- `server/http.ts`: Streamable HTTP transport, JSON state endpoint, and project-map host.
- `src/git.ts`: read-only repository inspection and delta calculation.
- `src/store.ts`: durable accounts, hashed passwords, browser sessions, teams, memberships, project links, features, and agent sessions with atomic writes and an inter-process lock.
- `public/`: dependency-free account onboarding and read-only team project map.

## MVP storage

The current implementation stores JSON locally. Atomic rename prevents partial files, while a lock coordinates writes from multiple local MCP processes. Local passwords are scrypt-hashed, raw browser-session tokens are never stored, and team dashboards require membership. A shared hosted deployment should replace the file with a transactional database and production identity, add repository-level authorization and revocable agent credentials, and serve only over HTTPS while preserving the MCP contract.

# Architecture

```text
Human
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
     Read-only project map
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
- `src/store.ts`: durable feature and session state with atomic writes and an inter-process lock.
- `public/`: dependency-free, read-only project map.

## MVP storage

The current implementation stores JSON locally. Atomic rename prevents partial files, while a lock coordinates writes from multiple local MCP processes. A shared hosted deployment should replace this file with a transactional database and authentication while preserving the MCP contract.

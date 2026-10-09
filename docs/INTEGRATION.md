# Connect a coding agent

Collavibe's production MCP is a stateless Streamable HTTP service:

```text
https://collavibe.vercel.app/mcp
```

The coding agent remains responsible for reading and editing its checkout. At the start and end of a session, it sends a sanitized Git snapshot to the hosted MCP. Collavibe stores the team context and handoff in Supabase. No Collavibe process needs to run on the developer's computer.

## Claude Code

Add this project-scoped `.mcp.json`:

```json
{
  "mcpServers": {
    "collavibe": {
      "type": "http",
      "url": "https://collavibe.vercel.app/mcp"
    }
  }
}
```

Run `/mcp` to confirm the server is connected. Clients that surface MCP prompts expose the `start` and `sync` workflows; Claude Code commonly names them `/mcp__collavibe__start` and `/mcp__collavibe__sync`.

## Codex CLI

Register the hosted endpoint once:

```bash
codex mcp add collavibe --url https://collavibe.vercel.app/mcp
```

Then open the repository in Codex and ask it to use Collavibe with the team code shown in the workspace.

## Generic MCP clients

Use Streamable HTTP with the production URL above. The client must support MCP protocol version `2025-03-26` or newer and send both `application/json` and `text/event-stream` in its `Accept` header, as required by Streamable HTTP.

The hosted tools are:

- `get_project_context`
- `start_collaboration_session`
- `choose_work_item`
- `get_sync_template`
- `sync_collaboration_session`

## Team code

Create or join a team at [collavibe.vercel.app](https://collavibe.vercel.app). Copy the eight-character code shown in the workspace. Every hosted MCP tool requires that code, which scopes reads and writes to the matching team.

The current preview treats the team code as both an invitation and an agent capability. Keep it within the intended team. A broader production release should replace it with scoped, revocable agent tokens.

## Intended session loop

1. Invoke the `start` prompt or ask the agent to inspect Git and call `start_collaboration_session` with the team code.
2. The MCP returns teammate context and concrete work options.
3. The agent presents those choices and waits for the human to choose.
4. The agent calls `choose_work_item`, then implements and tests the selected work normally.
5. Invoke the `sync` prompt or ask the agent to finish the Collavibe handoff.
6. The agent inspects Git again and calls `sync_collaboration_session` with its summary and final snapshot.
7. The hosted project map updates for every teammate.

The remote website labels the repository delta **agent-attested** because a cloud server cannot independently inspect a private laptop. Syncing never commits or pushes code.

## Local development fallback

The repository still contains local HTTP and stdio transports for development:

```bash
npm run start  # http://127.0.0.1:4317/mcp
npm run mcp    # stdio
```

They are not required to use the hosted product.

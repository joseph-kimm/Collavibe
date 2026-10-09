# Connect a coding agent

Collavibe exposes the same coordination workflow through stdio and Streamable HTTP. The host coding agent remains responsible for conversation, planning, and code changes. Collavibe only supplies shared context and records a Git-verified handoff.

## Claude Code

The repository includes a project-scoped `.mcp.json`:

```json
{
  "mcpServers": {
    "collavibe": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "server/stdio.ts"],
      "env": {
        "COLLAVIBE_DATA_PATH": ".collavibe/state.json",
        "COLLAVIBE_CLOUD_URL": "https://collavibe.vercel.app"
      }
    }
  }
}
```

After opening Claude Code in this repository, run `/mcp` to confirm the server is connected. MCP prompts are exposed as `/mcp__collavibe__start` and `/mcp__collavibe__sync`.

## Codex CLI

For the development server, start Collavibe and register its local HTTP endpoint:

```bash
npm run start
codex mcp add collavibe --url http://127.0.0.1:4317/mcp
```

For stdio, use absolute paths because `codex mcp add` creates a persistent configuration that may later start from another working directory:

```bash
codex mcp add collavibe \
  --env COLLAVIBE_DATA_PATH=/absolute/path/to/Collavibe/.collavibe/state.json \
  --env COLLAVIBE_CLOUD_URL=https://collavibe.vercel.app \
  -- /absolute/path/to/Collavibe/node_modules/.bin/tsx \
  /absolute/path/to/Collavibe/server/stdio.ts
```

## Claude Desktop

For a development checkout, add a `collavibe` stdio entry to `claude_desktop_config.json` using absolute paths for the `tsx` executable, `server/stdio.ts`, and `COLLAVIBE_DATA_PATH`, then restart Claude Desktop. A packaged desktop extension is a future distribution step; the development server itself does not require one.

## Generic MCP clients

- stdio command: `npm run mcp`
- Streamable HTTP endpoint: `http://localhost:4317/mcp`
- health check: `http://localhost:4317/health`
- authenticated project workspace: `http://localhost:4317/`
- authenticated project state: `http://localhost:4317/api/state`

## Team codes

Create or join a team in the hosted browser workspace first. The workspace header displays an eight-character code. Set `COLLAVIBE_CLOUD_URL` for the local MCP, then pass the code as `teamCode` when calling `get_project_context` or `start_collaboration_session`, or as `team_code` when invoking the `start` prompt. On first use, the local MCP inspects the repository and publishes a redacted snapshot to that team. Later sessions for the same repository resolve to the same shared workspace.

The code currently serves as both the invitation and agent capability. Keep it within the intended class or project team. A production release should replace or supplement it with scoped, revocable agent tokens.

## Intended session loop

1. Invoke the `start` prompt or ask the agent to call `start_collaboration_session`, including the team code shown in the workspace.
2. The agent summarizes the current repository and teammate work, then presents the returned work choices.
3. After the human chooses, the agent calls `choose_work_item` before editing code.
4. The agent implements and tests the selected work in the normal coding environment.
5. Invoke the `sync` prompt or ask the agent to call `sync_collaboration_session`.
6. The agent submits its session summary. Collavibe separately computes the commits and changed files visible in Git and updates the project map.

The sync step does not commit or push. Those actions remain explicit decisions in the coding client.

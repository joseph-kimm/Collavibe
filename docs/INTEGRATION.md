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
        "COLLAVIBE_DATA_PATH": ".collavibe/state.json"
      }
    }
  }
}
```

After opening Claude Code in this repository, run `/mcp` to confirm the server is connected. MCP prompts are exposed as `/mcp__collavibe__start` and `/mcp__collavibe__sync`.

## Codex CLI

From the repository root, register the local stdio server:

```bash
codex mcp add collavibe -- npx tsx server/stdio.ts
```

Alternatively, run the HTTP service with `npm run start` and point any Streamable HTTP-compatible client at `http://localhost:4317/mcp`.

## Claude Desktop

For a development checkout, add a `collavibe` stdio entry to `claude_desktop_config.json` using absolute paths for the `tsx` executable, `server/stdio.ts`, and `COLLAVIBE_DATA_PATH`, then restart Claude Desktop. A packaged desktop extension is a future distribution step; the development server itself does not require one.

## Generic MCP clients

- stdio command: `npm run mcp`
- Streamable HTTP endpoint: `http://localhost:4317/mcp`
- health check: `http://localhost:4317/health`
- read-only project state: `http://localhost:4317/api/state`

## Intended session loop

1. Invoke the `start` prompt or ask the agent to call `start_collaboration_session`.
2. The agent summarizes the current repository and teammate work, then presents the returned work choices.
3. After the human chooses, the agent calls `choose_work_item` before editing code.
4. The agent implements and tests the selected work in the normal coding environment.
5. Invoke the `sync` prompt or ask the agent to call `sync_collaboration_session`.
6. The agent submits its session summary. Collavibe separately computes the commits and changed files visible in Git and updates the project map.

The sync step does not commit or push. Those actions remain explicit decisions in the coding client.

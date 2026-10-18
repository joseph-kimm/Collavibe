# Connect a coding agent

Collavibe's production MCP is a stateless Streamable HTTP service:

```text
https://collavibe.vercel.app/mcp
```

The coding agent remains responsible for reading and editing its checkout. At the start and end of a session, it sends a sanitized Git snapshot to the hosted MCP. Collavibe stores the team context and handoff in Supabase. No Collavibe process needs to run on the developer's computer.

The signed-in workspace also has a **Connect agent** button that provides browser sign-in instructions, personal-key controls, and starter prompts for each supported client.

## ChatGPT

Open [ChatGPT Plugins](https://chatgpt.com/plugins), click **+**, and choose **Add custom MCP server**. Use:

- Name: `Collavibe`
- URL: `https://collavibe.vercel.app/mcp`
- Authentication: `OAuth` / browser sign-in

Create and install the plugin. In a Work chat, invoke `@Collavibe`, complete Collavibe browser sign-in, and choose your team. The website's connection sheet prepares a complete first prompt for this step.

## Claude and Claude Desktop

Go to **Settings → Connectors → Add custom connector**. Name the connector `Collavibe`, paste the hosted MCP URL, and add it. Complete browser sign-in and approve a team. Enable Collavibe from **Search and tools** in a new chat before using the prepared starter prompt.

Claude Code can instead register it from the terminal:

```bash
claude mcp add --transport http --scope user collavibe https://collavibe.vercel.app/mcp
```

## Claude Code project configuration

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

Run `codex mcp login collavibe`, complete browser sign-in, and choose a team. Then open the repository in Codex and use the prepared start prompt.

## Generic MCP clients

Use Streamable HTTP with the production URL above. The client must support MCP protocol version `2025-03-26` or newer and send both `application/json` and `text/event-stream` in its `Accept` header, as required by Streamable HTTP.

The hosted tools are:

- `get_project_context`
- `start_collaboration_session`
- `choose_work_item`
- `get_sync_template`
- `sync_collaboration_session`

## Authentication\n\nInvitation codes only join website teams. They are not MCP credentials. Prefer browser OAuth; personal agent keys are available in Connect agent for clients that only support Authorization headers. Never paste a key into chat or commit it to Git. See [ACCESS.md](ACCESS.md) for expiry, revocation, and exact scopes.\n\n## Intended session loop

1. Invoke the `start` prompt or ask the agent to inspect Git and call `start_collaboration_session` with a sanitized repository snapshot. The connection identifies the account and team.
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
\nSetup references: [official OpenAI MCP guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Claude Code MCP](https://code.claude.com/docs/en/mcp), and [MCP SDK authentication](https://ts.sdk.modelcontextprotocol.io/server#bearer-token-authentication). Client labels and availability can vary by version, plan, and workspace policy.\n

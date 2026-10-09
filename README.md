# Collavibe

Collavibe is an agent-agnostic MCP server for collaborative coding. It gives an AI coding agent shared project context at the start of a chat and turns the end of that chat into a structured team handoff.

The agent does the language work. Collavibe provides the durable coordination layer:

1. Inspect the current Git repository and prior teammate sessions.
2. Offer the user concrete features or branches to continue.
3. Record the chosen feature and its completion checklist before code changes begin.
4. Accept an agent-authored session summary at the end of the chat.
5. Independently verify commits and changed files against the starting Git snapshot.
6. Publish the result to a readable project map.

Collavibe never commits, pushes, or edits project source code.

## Current MCP surface

| Capability | MCP primitive | Purpose |
| --- | --- | --- |
| `get_project_context` | Tool | Refresh repository, feature, and session context. |
| `start_collaboration_session` | Tool | Capture starting Git state and generate work choices. |
| `choose_work_item` | Tool | Claim an existing feature or define a new one with a checklist. |
| `get_sync_template` | Tool | Tell the agent exactly what to summarize from the chat. |
| `sync_collaboration_session` | Tool | Save the summary and reconcile it with verified Git changes. |
| `start` | Prompt | Client-visible start workflow; appears as a slash command in clients that support MCP prompts. |
| `sync` | Prompt | Client-visible end-of-session workflow. |

## Run locally

```bash
npm install
npm run start
```

The Streamable HTTP endpoint is `http://localhost:4317/mcp`. A local stdio client can run:

```bash
npm run mcp
```

Run all contract and workflow tests with:

```bash
npm run check
```

State is stored at `.collavibe/state.json` by default and is not committed. Set `COLLAVIBE_DATA_PATH` to use a central or test-specific location.

The HTTP server binds to `127.0.0.1` by default so repository metadata is not exposed to the local network. Set `HOST` deliberately when testing from another machine; a shared deployment still requires authentication and a transactional database.

Open `http://localhost:4317/` for the read-only project map. See [client integration](docs/INTEGRATION.md) for Claude Code, Claude Desktop, Codex, and generic MCP clients, [architecture](docs/ARCHITECTURE.md) for the trust boundary and data flow, [testing](docs/TESTING.md) for the repeatable verification matrix, and [QA results](docs/TEST_RESULTS.md) for the latest executed evidence.

## Important boundary

The end-of-session summary is written by the coding agent from its conversation context. Collavibe stores that summary as a claim and displays it separately from Git-verified commits and files. This prevents a fluent summary from becoming false evidence of work that is not present in the repository.

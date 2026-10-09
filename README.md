# Collavibe

Collavibe is an agent-agnostic MCP server for collaborative coding. It gives an AI coding agent shared project context at the start of a chat and turns the end of that chat into a structured team handoff.

Hosted workspace: **https://collavibe.vercel.app**

The agent does the language work. Collavibe provides the durable coordination layer:

1. Let the coding agent inspect the current Git repository and load prior teammate sessions.
2. Offer the user concrete features or branches to continue.
3. Record the chosen feature and its completion checklist before code changes begin.
4. Accept an agent-authored session summary at the end of the chat.
5. Record the sanitized Git snapshot and changed files attested by the coding agent.
6. Publish the result to a readable project map.

Collavibe never commits, pushes, or edits project source code.

## Team onboarding

The hosted preview includes Supabase-backed account and team onboarding:

1. Sign up with a name, email, and password.
2. Create a named team or join an existing team using its eight-character invite code.
3. Copy the team code from the workspace header and give it to the coding agent when starting Collavibe.
4. Every MCP session attached with that code appears in the same team workspace.

Supabase Auth stores account credentials, browser sessions use `HttpOnly`, `SameSite=Strict` cookies, and team/project state lives in Postgres with row-level security enabled. The browser never receives the backend secret key. The team code is also the current agent capability, so treat it like an invitation and share it only with intended teammates.

## Current MCP surface

| Capability | MCP primitive | Purpose |
| --- | --- | --- |
| `get_project_context` | Tool | Load hosted team, project, feature, and session context using a team code. |
| `start_collaboration_session` | Tool | Record the agent-supplied starting Git state and generate work choices. |
| `choose_work_item` | Tool | Claim an existing feature or define a new one with a checklist. |
| `get_sync_template` | Tool | Tell the agent exactly what to summarize from the chat. |
| `sync_collaboration_session` | Tool | Save the summary and agent-attested final Git changes. |
| `start` | Prompt | Client-visible start workflow; appears as a slash command in clients that support MCP prompts. |
| `sync` | Prompt | Client-visible end-of-session workflow. |

## Connect an agent

The production Streamable HTTP endpoint is:

```text
https://collavibe.vercel.app/mcp
```

No Collavibe process needs to run on the developer's laptop. Add that URL to an MCP-compatible client, copy the team code from the hosted workspace, and ask the agent to start a Collavibe session. The agent uses its normal repository tools to create the sanitized Git snapshot that the hosted MCP stores.

This repository includes a project-scoped `.mcp.json` already pointed at the production endpoint. See [client integration](docs/INTEGRATION.md) for Codex, Claude Code, and generic clients.

## Local development

```bash
npm install
npm run start
```

The development Streamable HTTP endpoint is `http://localhost:4317/mcp`. The original local stdio implementation remains available for development and compatibility testing:

```bash
npm run mcp
```

Run all contract and workflow tests with:

```bash
npm run check
```

State is stored at `.collavibe/state.json` by default and is not committed. Set `COLLAVIBE_DATA_PATH` to use a central or test-specific location.

To run the hosted dashboard backend locally, copy `.env.example` to `.env.local`, add the Supabase values, and start it with:

```bash
node --env-file=.env.local --import tsx server/http.ts
```

The local HTTP server binds to `127.0.0.1` by default. Set `HOST` deliberately when testing from another machine.

Open `http://localhost:4317/` to sign in, create or join a team, and view its read-only project map. See [client integration](docs/INTEGRATION.md) for Claude Code, Claude Desktop, Codex, and generic MCP clients, [architecture](docs/ARCHITECTURE.md) for the trust boundary and data flow, [testing](docs/TESTING.md) for the repeatable verification matrix, and [QA results](docs/TEST_RESULTS.md) for the latest executed evidence.

## Important boundary

The hosted service cannot independently read a developer's laptop. The conversation summary and Git snapshot are supplied by the coding agent, and the website labels remote repository evidence as **agent-attested**. The local development transport can still compute an independently observed local Git delta. Those two evidence levels are deliberately not presented as equivalent.

This is a classroom-ready preview, not a production security release. Before broad public use, replace persistent team-code agent access with revocable scoped tokens and add rate limiting, audit logs, and repository-provider authorization.

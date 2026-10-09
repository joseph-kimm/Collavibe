# Testing Collavibe

## Automated suite

Run the complete local suite:

```bash
npm run check
npm audit --omit=dev
```

The suite covers:

- MCP tool and prompt discovery.
- Streamable HTTP initialization with two independent clients.
- Streamable HTTP content-negotiation enforcement.
- Hosted tool schemas that require team and repository snapshots instead of local filesystem paths.
- State recovery after restarting the HTTP server.
- Concurrent writes from four separate MCP processes.
- Repository refresh without duplicate projects.
- Exact filenames, including rename-like names containing `->`.
- Pre-existing dirty files remaining unattributed until their contents change.
- New commits on top of a teammate branch without claiming the teammate's older commits.
- Branch switches without false commit or file attribution.
- False agent-reported files appearing as unverified.
- Rejection of incomplete `done` claims, ambiguous feature selection, duplicate sync, and post-sync selection.
- Removal of credentials embedded in Git remote URLs.
- Removal of internal working-tree fingerprints from MCP and browser responses.
- Account signup and login with scrypt password verification.
- Team creation, unique invite codes, idempotent joining, and member-scoped dashboards.
- Repository attachment through both the browser flow and MCP `teamCode` input.
- Authentication enforcement on browser project-state endpoints.
- Redaction of team capabilities and internal working-file fingerprints before hosted publishing.
- Hosted Supabase signup, team creation, invite join, agent sync, and member dashboard flow.

## MCP Inspector

With `npm run start` running, validate the Streamable HTTP contract:

```bash
npx @modelcontextprotocol/inspector --cli \
  http://127.0.0.1:4317/mcp \
  --transport http \
  --method tools/list \
  --strict
```

Validate the stdio contract:

```bash
npx @modelcontextprotocol/inspector --cli \
  npx tsx server/stdio.ts \
  --transport stdio \
  --method tools/list \
  --strict
```

For release testing, use Inspector to call every tool with both representative and invalid inputs.

## Hosted production smoke test

With the Supabase server credentials loaded locally, run the official external MCP-client workflow against a deployment:

```bash
COLLAVIBE_SMOKE_URL=https://collavibe.vercel.app \
  node --env-file=.env.local --import tsx scripts/hosted-smoke.ts
```

The script creates a disposable user and team, connects to the remote `/mcp` endpoint, discovers five tools, completes start, choose, template, and sync across stateless requests, and confirms that the project, completed checklist, and `agent_attested` evidence appear in the dashboard. Its `finally` block removes the disposable session, feature, project, team, and account.

## Real-agent smoke test

Configure Collavibe as a local stdio MCP and ask the coding agent to:

1. Call `start_collaboration_session` and report the returned choices.
2. Call `choose_work_item` with a test feature.
3. Call `get_sync_template`.
4. Call `sync_collaboration_session` with `featureStatus: review` and no reported files.

The test passes when the agent completes the sequence and Collavibe reports a synced session with no fabricated Git evidence. Run this test read-only and use a disposable `COLLAVIBE_DATA_PATH`.

## Browser checks

Open `http://127.0.0.1:4317/` and verify:

- signup and login lead to the correct next step;
- creating a team produces a copyable eight-character code;
- a second account can join with that code and see only the team workspace;
- an MCP session started with `teamCode` appears in that workspace;
- the repository head matches `git rev-parse HEAD`;
- feature selection updates the detail pane and its pressed state;
- refresh updates the connection timestamp without console errors;
- agent summaries remain visually separate from agent-attested or locally verified commits and files;
- the layout remains readable at a 390 by 844 viewport;
- completed checklist items have both a visual check and screen-reader text.

## Production boundary

The automated suite validates the local collaboration workflow and hosted tool contract. The live smoke test validates the public Vercel MCP, Supabase Auth/Postgres persistence, dashboard projection, and cleanup end to end. Broader production use still needs repository authorization, revocable agent credentials, rate limits, structured logs, and deployment-level load and recovery tests.

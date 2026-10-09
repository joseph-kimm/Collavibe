# Collavibe

Collavibe is a shared learning workspace for teams building software with AI coding agents. It makes project intent, decisions, evidence, reviews, and handoffs visible so that fast generation does not replace understanding or accountability.

## Current vertical slice

- A responsive project workspace with a feature ledger and evidence inspector
- Feature claiming and structured work sessions
- Decision and evidence records
- Peer-review gates and handoffs
- A shared file-backed development store
- A streamable HTTP MCP server at `/mcp`
- Focused tools for project state, feature ownership, sessions, decisions, evidence, reviews, status, and handoffs

## Run locally

```bash
npm install
npm run dev
```

The web workspace runs at `http://localhost:3000`. The MCP endpoint runs at `http://localhost:3001/mcp`, with a health check at `http://localhost:3001/health`.

Run the complete verification suite with:

```bash
npm run check
```

## MCP tools

| Tool | Purpose |
| --- | --- |
| `get_project_state` | Read features, ownership, active sessions, evidence, decisions, reviews, and handoffs. |
| `create_feature` | Add a scoped feature with a user story, criteria, and risk. |
| `claim_feature` | Assign unclaimed work before an agent session begins. |
| `start_session` | Record the learner’s plan and expected evidence. |
| `record_decision` | Preserve a choice, rationale, alternatives, and affected components. |
| `attach_evidence` | Link an inspectable test, preview, screenshot, log, or explanation to a claim. |
| `request_review` | Ask a different teammate to review work against criteria and evidence. |
| `resolve_review` | Let the assigned reviewer accept evidence or request specific changes. |
| `update_feature` | Move work through the workflow; Done requires passing evidence and accepted review. |
| `finish_session` | Close a work period and create a complete handoff. |

The local store is created in `.collavibe/data.json` and is intentionally ignored by Git. Set `COLLAVIBE_DATA_PATH` to use a different location.

This is a local course-project prototype with synthetic people and data. Before any real deployment, add authenticated project membership, per-tool authorization, a production database, rate limits, and an audit-retention policy.

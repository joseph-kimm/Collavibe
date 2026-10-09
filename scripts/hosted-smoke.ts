import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getSupabaseAdmin, throwSupabaseError } from "../src/supabase.js";

const baseUrl = (process.env.COLLAVIBE_SMOKE_URL || "https://collavibe.vercel.app").replace(/\/$/, "");
const runId = randomUUID().slice(0, 8);
const email = `collavibe-smoke-${runId}@example.com`;
const password = `Smoke-${randomUUID()}-9x!`;
const repoKey = `https://github.com/collavibe-smoke/${runId}.git`;
const startHead = "1".repeat(40);
const endHead = "2".repeat(40);

let authCookie = "";
let userId: string | undefined;
let teamId: string | undefined;
let projectId: string | undefined;
let client: Client | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function structured<T>(response: { isError?: boolean; structuredContent?: unknown }, label: string): T {
  assert(response.isError !== true, `${label} returned an MCP error.`);
  assert(response.structuredContent && typeof response.structuredContent === "object", `${label} did not return structured content.`);
  return response.structuredContent as T;
}

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (authCookie) headers.set("cookie", authCookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} failed with ${response.status}: ${await response.text()}`);
  return response;
}

async function cleanup() {
  const admin = getSupabaseAdmin();
  if (projectId) {
    for (const table of ["collaboration_sessions", "features", "team_projects"] as const) {
      const result = await admin.from(table).delete().eq("project_id", projectId);
      throwSupabaseError(result.error);
    }
    const project = await admin.from("projects").delete().eq("id", projectId);
    throwSupabaseError(project.error);
  }
  if (teamId) {
    const members = await admin.from("team_members").delete().eq("team_id", teamId);
    throwSupabaseError(members.error);
    const team = await admin.from("teams").delete().eq("id", teamId);
    throwSupabaseError(team.error);
  }
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    throwSupabaseError(deleted.error);
  }
}

try {
  const signup = await api("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name: "Hosted MCP Smoke Test", email, password }),
  });
  authCookie = signup.headers.get("set-cookie")?.split(";")[0] || "";
  assert(authCookie, "Signup did not return an authentication cookie.");
  const signupBody = await signup.json() as { user: { id: string } };
  userId = signupBody.user.id;

  const createdTeam = await (await api("/api/teams", {
    method: "POST",
    body: JSON.stringify({ name: `Hosted MCP Smoke ${runId}` }),
  })).json() as { team: { id: string; joinCode: string } };
  teamId = createdTeam.team.id;
  const teamCode = createdTeam.team.joinCode;

  client = new Client({ name: "collavibe-production-smoke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));

  const tools = await client.listTools();
  assert(tools.tools.length === 5, `Expected five hosted tools, received ${tools.tools.length}.`);
  assert(tools.tools.some((tool) => tool.name === "sync_collaboration_session"), "Hosted sync tool is missing.");

  const startedResponse = await client.callTool({
    name: "start_collaboration_session",
    arguments: {
      teamCode,
      participant: "External MCP Client",
      intent: "Verify the deployed hosted workflow.",
      project: {
        key: repoKey,
        name: `Smoke Repository ${runId}`,
        remote: repoKey,
        git: {
          branch: "feature/hosted-smoke",
          head: startHead,
          dirty: false,
          workingFiles: [],
          branches: [{ name: "feature/hosted-smoke", head: startHead.slice(0, 7), fullHead: startHead, current: true }],
          recentCommits: [{ hash: startHead, shortHash: startHead.slice(0, 7), author: "Smoke Test", authoredAt: new Date().toISOString(), subject: "Starting snapshot" }],
          trackedFiles: ["README.md"],
        },
      },
    },
  });
  const started = structured<{ started: { session: { id: string }; project: { id: string } } }>(startedResponse, "start_collaboration_session").started;
  projectId = started.project.id;

  const chosenResponse = await client.callTool({
    name: "choose_work_item",
    arguments: {
      teamCode,
      sessionId: started.session.id,
      newFeature: {
        title: "Hosted smoke workflow",
        description: "Exercise the production MCP across independent stateless requests.",
        checklist: ["Start, choose, and sync through the hosted MCP"],
      },
      intendedBranch: "feature/hosted-smoke",
    },
  });
  const chosen = structured<{ selected: { feature: { checklist: Array<{ id: string }> } } }>(chosenResponse, "choose_work_item").selected;
  const checklistId = chosen.feature.checklist[0]?.id;
  assert(checklistId, "choose_work_item did not return a checklist item.");

  const templateResponse = await client.callTool({
    name: "get_sync_template",
    arguments: { teamCode, sessionId: started.session.id },
  });
  structured(templateResponse, "get_sync_template");

  const syncedResponse = await client.callTool({
    name: "sync_collaboration_session",
    arguments: {
      teamCode,
      sessionId: started.session.id,
      summary: "The external MCP client completed the hosted start, choose, template, and sync workflow.",
      workCompleted: ["Called all hosted workflow tools successfully"],
      decisions: ["Used a stateless Streamable HTTP client"],
      blockers: [],
      nextSteps: [],
      changedFiles: ["README.md"],
      endGit: {
        branch: "feature/hosted-smoke",
        head: endHead,
        dirty: false,
        workingFiles: [],
        branches: [{ name: "feature/hosted-smoke", head: endHead.slice(0, 7), fullHead: endHead, current: true }],
        recentCommits: [
          { hash: endHead, shortHash: endHead.slice(0, 7), author: "Smoke Test", authoredAt: new Date().toISOString(), subject: "Finish hosted smoke test" },
          { hash: startHead, shortHash: startHead.slice(0, 7), author: "Smoke Test", authoredAt: new Date().toISOString(), subject: "Starting snapshot" },
        ],
        trackedFiles: ["README.md"],
      },
      completedChecklistItemIds: [checklistId],
      featureStatus: "done",
    },
  });
  const synced = structured<{ synced: { attestation: { source: string; changedFiles: string[] } } }>(syncedResponse, "sync_collaboration_session").synced;
  assert(synced.attestation.source === "agent_attested", "Remote evidence was not labeled agent_attested.");
  assert(synced.attestation.changedFiles.includes("README.md"), "Synced evidence did not contain the changed file.");

  const dashboard = await (await api(`/api/dashboard?teamId=${encodeURIComponent(teamId)}`)).json() as {
    projects: Array<{ id: string }>;
    features: Array<{ status: string; checklist: Array<{ done: boolean }> }>;
    sessions: Array<{ id: string; status: string; sync?: { verified?: { source?: string } } }>;
  };
  assert(dashboard.projects.some((project) => project.id === projectId), "The hosted project is missing from the dashboard.");
  assert(dashboard.features.some((feature) => feature.status === "done" && feature.checklist.every((item) => item.done)), "The completed feature is missing from the dashboard.");
  assert(dashboard.sessions.some((session) => session.id === started.session.id && session.status === "synced" && session.sync?.verified?.source === "agent_attested"), "The synced session is missing from the dashboard.");

  console.log(JSON.stringify({
    ok: true,
    endpoint: `${baseUrl}/mcp`,
    tools: tools.tools.map((tool) => tool.name),
    workflow: ["signup", "create_team", "start", "choose", "template", "sync", "dashboard"],
    evidence: "agent_attested",
    cleanup: "pending",
  }, null, 2));
} finally {
  await client?.close().catch(() => undefined);
  await cleanup();
  console.log("Disposable hosted smoke-test data removed.");
}

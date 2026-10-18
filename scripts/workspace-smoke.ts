import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getSupabaseAdmin, throwSupabaseError } from "../src/supabase.js";
import type { Feature, Project } from "../src/types.js";

const base = (process.env.COLLAVIBE_SMOKE_URL || "http://127.0.0.1:4321").replace(/\/$/, "");
const db = getSupabaseAdmin(), run = randomUUID();
const users: string[] = [], teams: string[] = [], projects: string[] = [];
let client: Client | undefined;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function request(cookie: string, path: string, method = "GET", body?: unknown) {
  return fetch(base + path, { method, headers: { cookie, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function json(response: Response) { const body = await response.json(); assert(response.ok, `HTTP ${response.status}: ${body.error}`); return body; }
async function account(label: string) {
  const email = `collavibe-lifecycle-${label}-${run}@example.com`, password = "QA-" + randomUUID();
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Lifecycle ${label}` } }); throwSupabaseError(created.error); users.push(created.data.user!.id);
  const response = await request("", "/api/auth/login", "POST", { email, password }); const result = await json(response);
  return { id: result.user.id, name: result.user.name, email, password, cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
async function tool(name: string, args: Record<string, unknown>, success = true) {
  const result = await client!.callTool({ name, arguments: args });
  assert(Boolean(result.isError) !== success, `${name}: unexpected ${result.isError ? "failure" : "success"}`);
  return result.structuredContent as any;
}
const git = { branch: "feature/lifecycle", head: "a".repeat(40), dirty: false, workingFiles: [], branches: [], recentCommits: [], trackedFiles: ["README.md"] };
try {
  const owner = await account("owner"), member = await account("member"), outsider = await account("outsider");
  const team = (await json(await request(owner.cookie, "/api/teams", "POST", { name: "Lifecycle QA " + run }))).team; teams.push(team.id);
  await json(await request(member.cookie, "/api/teams/join", "POST", { joinCode: team.joinCode }));
  const root = `/api/teams/${team.id}`;
  let project: Project = (await json(await request(owner.cookie, root + "/projects", "POST", { name: "Lifecycle repository", repositoryUrl: `https://github.com/collavibe-lifecycle/${run}` }))).project; projects.push(project.id);
  const direct = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const bypass = { target_team: team.id, actor: owner.id, pid: project.id, kind: "project", document: { ...project, name: "Direct RPC bypass" }, expected: project.updatedAt };
  assert((await direct.rpc("mutate_workspace", bypass)).error?.code === "42501", "Anonymous client could execute service-only workspace transactions.");
  throwSupabaseError((await direct.auth.signInWithPassword({ email: owner.email, password: owner.password })).error);
  assert((await direct.rpc("mutate_workspace", bypass)).error?.code === "42501", "Browser user could bypass the application through its transaction RPC.");
  await direct.auth.signOut({ scope: "local" });
  const projectRoute = root + "/projects/" + project.id;
  let feature: Feature = (await json(await request(member.cookie, projectRoute + "/features", "POST", { title: "Test lifecycle", priority: "urgent", dueDate: "2026-12-15", checklist: [{ text: "Preserve context" }] }))).feature;
  assert(feature.priority === "urgent" && feature.dueDate === "2026-12-15", "Planning metadata was lost.");
  assert((await request(owner.cookie, projectRoute + "/features", "POST", { title: "Invalid date", dueDate: "2027-02-29" })).status === 400, "Impossible date accepted.");
  const featureRoute = root + "/features/" + feature.id;
  const action = (cookie: string, body: unknown) => request(cookie, featureRoute + "/actions", "POST", body);
  assert((await action(outsider.cookie, { action: "comment", text: "Unauthorized" })).status === 403, "Outsider posted a comment.");
  const comments = await Promise.all([action(owner.cookie, { action: "comment", text: "Owner's context", userId: member.id, author: "Forged" }), action(member.cookie, { action: "comment", text: "Member's context" })]);
  for (const response of comments) await json(response);
  const dashboard = async () => json(await request(owner.cookie, "/api/dashboard?teamId=" + team.id));
  feature = (await dashboard()).features.find((item: Feature) => item.id === feature.id);
  assert(feature.comments?.length === 2 && feature.comments.some((item) => item.userId === owner.id && item.author === owner.name), "Concurrent comments or author binding failed.");
  const ownerComment = feature.comments.find((item) => item.userId === owner.id)!;
  assert((await action(member.cookie, { action: "remove-comment", commentId: ownerComment.id })).status === 403, "Member deleted someone else's comment.");
  const stale = { ...feature, expectedUpdatedAt: feature.updatedAt };
  feature = (await json(await action(member.cookie, { action: "comment", text: "A later decision" }))).feature;
  assert((await request(owner.cookie, featureRoute, "PATCH", stale)).status === 409, "Edit erased a newer discussion.");
  feature = (await json(await request(owner.cookie, featureRoute, "PATCH", { ...feature, title: "Updated lifecycle", expectedUpdatedAt: feature.updatedAt, comments: [] }))).feature;
  assert(feature.comments?.length === 3, "Ordinary editing erased comments.");
  feature = (await json(await action(owner.cookie, { action: "remove-comment", commentId: feature.comments.find((item) => item.userId === member.id)!.id }))).feature;
  assert(feature.comments?.length === 2, "Owner moderation failed.");
  const key = await json(await request(owner.cookie, root + "/agent-connections", "POST", { label: "Lifecycle QA" }));
  client = new Client({ name: "collavibe-lifecycle-qa", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { authorization: "Bearer " + key.token } } }));
  const start = () => tool("start_collaboration_session", { project: { key: project.root, name: "Agent name", git }, intent: "Verify lifecycle" });
  const first = (await start()).started;
  feature = (await json(await action(owner.cookie, { action: "archive", archived: true, expectedUpdatedAt: feature.updatedAt }))).feature;
  await tool("choose_work_item", { sessionId: first.session.id, featureId: feature.id }, false);
  const context = await tool("get_project_context", { projectKey: project.root });
  assert(!JSON.stringify(context).includes(feature.id), "Archived feature offered to agent.");
  assert((await action(member.cookie, { action: "comment", text: "Archived write" })).status === 409, "Archived discussion writable.");
  feature = (await json(await action(member.cookie, { action: "archive", archived: false, expectedUpdatedAt: feature.updatedAt }))).feature;
  const selected = (await tool("choose_work_item", { sessionId: first.session.id, featureId: feature.id })).selected;
  feature = selected.feature;
  assert(feature.priority === "urgent" && feature.comments.length === 2, "MCP claim lost website metadata.");
  assert((await action(owner.cookie, { action: "archive", archived: true, expectedUpdatedAt: feature.updatedAt })).status === 409, "Feature archived with active session.");
  project = (await dashboard()).projects.find((item: Project) => item.id === project.id);
  assert((await request(owner.cookie, projectRoute, "PATCH", { name: project.name, archived: true, expectedUpdatedAt: project.updatedAt })).status === 409, "Project archived with active session.");
  await tool("sync_collaboration_session", { sessionId: first.session.id, summary: "Lifecycle verified", workCompleted: ["Tested collaboration"], decisions: [], blockers: [], nextSteps: [], changedFiles: ["README.md"], endGit: git, featureStatus: "review" });
  console.log("Workspace smoke: metadata, concurrent comments, permissions, revision protection, MCP archive guards passed.");
  project = (await dashboard()).projects.find((item: Project) => item.id === project.id);
  const patch = { name: "Renamed lifecycle project", archived: true, expectedUpdatedAt: project.updatedAt };
  assert((await request(member.cookie, projectRoute, "PATCH", patch)).status === 403, "Member changed owner settings.");
  assert((await request(outsider.cookie, projectRoute, "PATCH", patch)).status === 403, "Outsider changed project.");
  project = (await json(await request(owner.cookie, projectRoute, "PATCH", patch))).project;
  assert((await request(owner.cookie, projectRoute, "PATCH", patch)).status === 409, "Stale project edit accepted.");
  assert((await request(member.cookie, projectRoute + "/features", "POST", { title: "Archived write" })).status === 409, "Archived project writable.");
  await tool("start_collaboration_session", { project: { key: project.root, name: project.name, git } }, false);
  const archivedContext = await tool("get_project_context", { projectKey: project.root });
  assert(!JSON.stringify(archivedContext).includes(project.id), "Archived project offered to agent.");
  project = (await json(await request(owner.cookie, projectRoute, "PATCH", { name: project.name, archived: false, expectedUpdatedAt: project.updatedAt }))).project;
  const restored = await dashboard();
  assert(restored.sessions.some((item: any) => item.id === first.session.id && item.status === "synced"), "Restoration lost session history.");
  assert(restored.features.find((item: Feature) => item.id === feature.id).comments.length === 2, "Restoration lost discussion.");
  // A claim racing an archive must produce one winner and no hidden active work.
  const second = (await start()).started;
  feature = restored.features.find((item: Feature) => item.id === feature.id);
  const [archiving, claiming] = await Promise.all([action(owner.cookie, { action: "archive", archived: true, expectedUpdatedAt: feature.updatedAt }), client.callTool({ name: "choose_work_item", arguments: { sessionId: second.session.id, featureId: feature.id } })]);
  assert(Number(archiving.ok) + Number(!claiming.isError) === 1, "Archive/claim race did not have exactly one winner.");
  const final = await dashboard();
  const finalFeature = final.features.find((item: Feature) => item.id === feature.id);
  assert(!(finalFeature.archivedAt && final.sessions.some((item: any) => item.featureId === feature.id && item.status === "active")), "Race left hidden active work.");
  if (!claiming.isError) await tool("sync_collaboration_session", { sessionId: second.session.id, summary: "Race check finished", workCompleted: [], decisions: [], blockers: [], nextSteps: [], changedFiles: [], endGit: git, featureStatus: "review" });
  if (finalFeature.archivedAt) await json(await action(owner.cookie, { action: "archive", archived: false, expectedUpdatedAt: finalFeature.updatedAt }));
  const third = (await start()).started;
  project = (await dashboard()).projects.find((item: Project) => item.id === project.id);
  const [projectArchive, projectClaim] = await Promise.all([
    request(owner.cookie, projectRoute, "PATCH", { name: project.name, archived: true, expectedUpdatedAt: project.updatedAt }),
    client.callTool({ name: "choose_work_item", arguments: { sessionId: third.session.id, featureId: feature.id } }),
  ]);
  assert(Number(projectArchive.ok) + Number(!projectClaim.isError) === 1, "Project archive/claim race did not have exactly one winner.");
  const afterRace = await dashboard();
  assert(!(afterRace.projects.find((item: Project) => item.id === project.id).archivedAt && afterRace.sessions.some((item: any) => item.status === "active")), "Project archive hid active work.");
  console.log("Workspace smoke: owner project settings, archive/restore persistence, feature and project archive-versus-claim races passed.");
} finally {
  await client?.close().catch(() => undefined);
  for (const id of projects) {
    for (const table of ["collaboration_sessions", "features", "team_projects"] as const) throwSupabaseError((await db.from(table).delete().eq("project_id", id)).error);
    throwSupabaseError((await db.from("projects").delete().eq("id", id)).error);
  }
  for (const id of teams) { throwSupabaseError((await db.from("team_members").delete().eq("team_id", id)).error); throwSupabaseError((await db.from("teams").delete().eq("id", id)).error); }
  for (const id of users) throwSupabaseError((await db.auth.admin.deleteUser(id)).error);
  console.log("Workspace smoke: disposable records removed.");
}

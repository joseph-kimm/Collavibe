import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdmin, throwSupabaseError } from "./supabase.js";
import type { CollaborationSession, Feature, FeatureStatus, GitSnapshot, Project, VerifiedDelta, WorkOption } from "./types.js";

export interface HostedProjectInput {
  key: string;
  name: string;
  remote?: string;
  git: GitSnapshot;
}

function normalizeTeamCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function safeRepositoryKey(value: string) {
  const key = value.trim();
  if (!key) throw new Error("A stable repository key is required.");
  try {
    const url = new URL(key);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return key;
  }
}

function hostedProjectId(key: string) {
  return `project_${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

async function resolveTeam(teamCode: string) {
  const result = await getSupabaseAdmin().from("teams").select("id,name").eq("join_code", normalizeTeamCode(teamCode)).maybeSingle();
  throwSupabaseError(result.error);
  if (!result.data) throw new Error("That team code is not valid.");
  return result.data as { id: string; name: string };
}

async function requireTeamProject(teamId: string, projectId: string) {
  const result = await getSupabaseAdmin().from("team_projects").select("project_id").eq("team_id", teamId).eq("project_id", projectId).maybeSingle();
  throwSupabaseError(result.error);
  if (!result.data) throw new Error("That session does not belong to this team.");
}

function buildWorkOptions(project: Project, features: Feature[], participant: string): WorkOption[] {
  const options: WorkOption[] = features.filter((feature) => feature.status !== "done").map((feature) => ({
    id: `feature:${feature.id}`,
    kind: "feature",
    title: feature.title,
    detail: `${feature.status}${feature.owner ? ` · owned by ${feature.owner}` : " · unclaimed"} · ${feature.checklist.filter((item) => item.done).length}/${feature.checklist.length} checklist items`,
    featureId: feature.id,
    branch: feature.branch,
  }));
  for (const branch of project.latestGit.branches.filter((item) => !item.current && !item.name.startsWith("origin/") && item.name !== "main" && item.name !== "master")) {
    if (!features.some((feature) => feature.branch === branch.name)) {
      options.push({ id: `branch:${branch.name}`, kind: "branch", title: `Continue ${branch.name}`, detail: `Existing branch at ${branch.head}`, branch: branch.name });
    }
  }
  if (project.latestGit.dirty) {
    options.unshift({ id: "current:dirty", kind: "current_work", title: `Continue current work on ${project.latestGit.branch}`, detail: `${project.latestGit.workingFiles.length} uncommitted file(s) reported by ${participant}`, branch: project.latestGit.branch });
  }
  options.push({ id: "new", kind: "new_feature", title: "Define a new feature", detail: "Describe the user-facing outcome and add a concrete completion checklist." });
  return options;
}

function projectFromRow(row: any): Project {
  return { id: row.id, name: row.name, root: row.root, remote: row.remote || undefined, latestGit: row.latest_git, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getHostedTeamContext(input: { teamCode: string; projectKey?: string }) {
  const team = await resolveTeam(input.teamCode);
  const links = await getSupabaseAdmin().from("team_projects").select("project_id").eq("team_id", team.id);
  throwSupabaseError(links.error);
  let projectIds = (links.data || []).map((row) => row.project_id as string);
  if (input.projectKey) {
    const requestedId = hostedProjectId(safeRepositoryKey(input.projectKey));
    projectIds = projectIds.filter((id) => id === requestedId);
  }
  if (!projectIds.length) return { team, projects: [], features: [], sessions: [] };
  const [projects, features, sessions] = await Promise.all([
    getSupabaseAdmin().from("projects").select("*").in("id", projectIds),
    getSupabaseAdmin().from("features").select("payload").in("project_id", projectIds),
    getSupabaseAdmin().from("collaboration_sessions").select("payload").in("project_id", projectIds),
  ]);
  throwSupabaseError(projects.error); throwSupabaseError(features.error); throwSupabaseError(sessions.error);
  return {
    team,
    projects: (projects.data || []).map(projectFromRow),
    features: (features.data || []).map((row) => row.payload as Feature),
    sessions: (sessions.data || []).map((row) => row.payload as CollaborationSession).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  };
}

export async function startHostedSession(input: { teamCode: string; participant: string; intent?: string; project: HostedProjectInput }) {
  const team = await resolveTeam(input.teamCode);
  const key = safeRepositoryKey(input.project.key);
  const id = hostedProjectId(key);
  const existingLink = await getSupabaseAdmin().from("team_projects").select("team_id").eq("project_id", id).maybeSingle();
  throwSupabaseError(existingLink.error);
  if (existingLink.data && existingLink.data.team_id !== team.id) throw new Error("This repository is already connected to another team.");
  const now = new Date().toISOString();
  const existingProject = await getSupabaseAdmin().from("projects").select("*").eq("id", id).maybeSingle();
  throwSupabaseError(existingProject.error);
  const project: Project = existingProject.data
    ? { ...projectFromRow(existingProject.data), name: input.project.name, root: key, remote: input.project.remote, latestGit: input.project.git, updatedAt: now }
    : { id, name: input.project.name, root: key, remote: input.project.remote, latestGit: input.project.git, createdAt: now, updatedAt: now };
  const projectWrite = await getSupabaseAdmin().from("projects").upsert({ id, name: project.name, root: key, remote: project.remote || null, latest_git: project.latestGit, created_at: project.createdAt, updated_at: now });
  throwSupabaseError(projectWrite.error);
  const linkWrite = await getSupabaseAdmin().from("team_projects").upsert({ team_id: team.id, project_id: id }, { onConflict: "team_id,project_id" });
  throwSupabaseError(linkWrite.error);
  const [featureRows, sessionRows] = await Promise.all([
    getSupabaseAdmin().from("features").select("payload").eq("project_id", id),
    getSupabaseAdmin().from("collaboration_sessions").select("payload").eq("project_id", id),
  ]);
  throwSupabaseError(featureRows.error); throwSupabaseError(sessionRows.error);
  const features = (featureRows.data || []).map((row) => row.payload as Feature);
  const priorSessions = (sessionRows.data || []).map((row) => row.payload as CollaborationSession).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const session: CollaborationSession = {
    id: `session_${randomUUID()}`,
    projectId: id,
    repoPath: key,
    participant: input.participant,
    intent: input.intent,
    status: "choosing",
    startSnapshot: input.project.git,
    startedAt: now,
  };
  const sessionWrite = await getSupabaseAdmin().from("collaboration_sessions").insert({ id: session.id, project_id: id, payload: session, updated_at: now });
  throwSupabaseError(sessionWrite.error);
  return {
    session,
    project,
    team,
    teammates: priorSessions.slice(0, 8),
    workOptions: buildWorkOptions(project, features, input.participant),
    agentInstructions: "Present the returned work options and ask the user to choose. After the user decides, call choose_work_item with this team code before editing code.",
  };
}

async function hostedSession(teamCode: string, sessionId: string) {
  const team = await resolveTeam(teamCode);
  const row = await getSupabaseAdmin().from("collaboration_sessions").select("payload").eq("id", sessionId).maybeSingle();
  throwSupabaseError(row.error);
  if (!row.data) throw new Error(`Unknown collaboration session: ${sessionId}`);
  const session = row.data.payload as CollaborationSession;
  await requireTeamProject(team.id, session.projectId);
  return { team, session };
}

export async function chooseHostedWorkItem(input: { teamCode: string; sessionId: string; featureId?: string; newFeature?: { title: string; description: string; checklist: string[] }; intendedBranch?: string }) {
  const { session } = await hostedSession(input.teamCode, input.sessionId);
  if (session.status === "synced") throw new Error("This session has already been synced.");
  if (session.status === "active") throw new Error("This session already has selected work.");
  if (Boolean(input.featureId) === Boolean(input.newFeature)) throw new Error("Choose exactly one existing feature or one new feature.");
  let feature: Feature;
  if (input.featureId) {
    const found = await getSupabaseAdmin().from("features").select("payload").eq("id", input.featureId).eq("project_id", session.projectId).maybeSingle();
    throwSupabaseError(found.error);
    if (!found.data) throw new Error("The selected feature does not belong to this project.");
    feature = found.data.payload as Feature;
  } else {
    if (!input.newFeature?.checklist.length) throw new Error("A feature needs at least one completion checklist item.");
    const now = new Date().toISOString();
    feature = {
      id: `feature_${randomUUID()}`,
      projectId: session.projectId,
      title: input.newFeature.title,
      description: input.newFeature.description,
      checklist: input.newFeature.checklist.map((text) => ({ id: `check_${randomUUID()}`, text, done: false })),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
  }
  feature.owner = session.participant;
  feature.status = "active";
  feature.branch = input.intendedBranch || feature.branch || session.startSnapshot.branch;
  feature.updatedAt = new Date().toISOString();
  session.featureId = feature.id;
  session.status = "active";
  const [featureWrite, sessionWrite] = await Promise.all([
    getSupabaseAdmin().from("features").upsert({ id: feature.id, project_id: session.projectId, payload: feature, updated_at: feature.updatedAt }),
    getSupabaseAdmin().from("collaboration_sessions").update({ payload: session, updated_at: feature.updatedAt }).eq("id", session.id),
  ]);
  throwSupabaseError(featureWrite.error); throwSupabaseError(sessionWrite.error);
  return { session, feature, agentInstructions: `Work only on the selected feature. Before ending the chat, inspect the final Git state and call sync_collaboration_session with sessionId ${session.id} and this team code.` };
}

export async function getHostedSyncTemplate(input: { teamCode: string; sessionId: string }) {
  await hostedSession(input.teamCode, input.sessionId);
  return {
    sessionId: input.sessionId,
    summary: "Two or three factual sentences explaining the outcome and current state.",
    workCompleted: ["Concrete behavior implemented or investigated"],
    decisions: ["Decision and brief rationale"],
    blockers: ["Unresolved blocker, or an empty array"],
    nextSteps: ["Specific continuation step"],
    changedFiles: ["Repository-relative file changed during this session"],
    completedChecklistItemIds: ["IDs returned by choose_work_item"],
    featureStatus: "review",
  };
}

export async function syncHostedSession(input: {
  teamCode: string;
  sessionId: string;
  summary: string;
  workCompleted: string[];
  decisions: string[];
  blockers: string[];
  nextSteps: string[];
  changedFiles: string[];
  endGit: GitSnapshot;
  completedChecklistItemIds?: string[];
  featureStatus?: FeatureStatus;
}) {
  const { session } = await hostedSession(input.teamCode, input.sessionId);
  if (session.status === "synced") throw new Error("This session has already been synced.");
  const now = new Date().toISOString();
  const startingCommits = new Set(session.startSnapshot.recentCommits.map((commit) => commit.hash));
  const commits = session.startSnapshot.head === input.endGit.head ? [] : input.endGit.recentCommits.filter((commit) => !startingCommits.has(commit.hash));
  const changedFiles = [...new Set(input.changedFiles)].sort();
  const attested: VerifiedDelta = {
    source: "agent_attested",
    startHead: session.startSnapshot.head,
    endHead: input.endGit.head,
    startBranch: session.startSnapshot.branch,
    endBranch: input.endGit.branch,
    commits,
    changedFiles,
    workingFiles: input.endGit.workingFiles,
    reportedButUnverified: [],
  };
  session.status = "synced";
  session.syncedAt = now;
  session.sync = {
    summary: input.summary,
    workCompleted: input.workCompleted,
    decisions: input.decisions,
    blockers: input.blockers,
    nextSteps: input.nextSteps,
    agentReportedFiles: changedFiles,
    verified: attested,
  };
  let feature: Feature | undefined;
  if (session.featureId) {
    const featureRow = await getSupabaseAdmin().from("features").select("payload").eq("id", session.featureId).maybeSingle();
    throwSupabaseError(featureRow.error);
    feature = featureRow.data?.payload as Feature | undefined;
    if (feature) {
      for (const item of feature.checklist) if (input.completedChecklistItemIds?.includes(item.id)) item.done = true;
      if (input.featureStatus === "done" && (!changedFiles.length || feature.checklist.some((item) => !item.done))) {
        throw new Error("Done requires agent-attested changed files and every checklist item completed.");
      }
      feature.status = input.featureStatus || (input.blockers.length ? "blocked" : "review");
      feature.updatedAt = now;
    }
  }
  const projectRow = await getSupabaseAdmin().from("projects").select("*").eq("id", session.projectId).single();
  throwSupabaseError(projectRow.error);
  const project = projectFromRow(projectRow.data);
  project.latestGit = { ...input.endGit, root: project.root, remote: project.remote };
  project.updatedAt = now;
  const writes = [
    getSupabaseAdmin().from("collaboration_sessions").update({ payload: session, updated_at: now }).eq("id", session.id),
    getSupabaseAdmin().from("projects").update({ latest_git: project.latestGit, updated_at: now }).eq("id", project.id),
  ];
  if (feature) writes.push(getSupabaseAdmin().from("features").update({ payload: feature, updated_at: now }).eq("id", feature.id));
  const results = await Promise.all(writes);
  for (const result of results) throwSupabaseError(result.error);
  return {
    session,
    feature,
    attestation: attested,
    agentInstructions: "Confirm the session was synced. Say clearly that remote Git evidence was supplied by the coding agent and was not independently read from the developer's filesystem.",
  };
}

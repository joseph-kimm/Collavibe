import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectDelta, inspectRepository } from "./git.js";
import type { CollaborationSession, CollavibeState, Feature, FeatureStatus, Project, WorkOption } from "./types.js";

const emptyState = (): CollavibeState => ({ projects: [], features: [], sessions: [] });
const statePath = () => process.env.COLLAVIBE_DATA_PATH || path.join(process.cwd(), ".collavibe", "state.json");
let writeQueue: Promise<unknown> = Promise.resolve();

async function save(state: CollavibeState) {
  const file = statePath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await rename(temporary, file);
}

export async function readState(): Promise<CollavibeState> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ statePath(), "utf8")) as CollavibeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return emptyState();
  }
}

async function mutate<T>(operation: (state: CollavibeState) => Promise<T> | T): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const state = await readState();
    result = await operation(state);
    await save(state);
  });
  await writeQueue;
  return result;
}

function projectId(remote: string | undefined, root: string) {
  return `project_${createHash("sha256").update(remote || root).digest("hex").slice(0, 12)}`;
}

function findSession(state: CollavibeState, sessionId: string) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error(`Unknown collaboration session: ${sessionId}`);
  return session;
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
  for (const branch of project.latestGit.branches.filter((item) => !item.current && item.name !== "main" && item.name !== "master")) {
    if (!features.some((feature) => feature.branch === branch.name)) {
      options.push({ id: `branch:${branch.name}`, kind: "branch", title: `Continue ${branch.name}`, detail: `Existing branch at ${branch.head}`, branch: branch.name });
    }
  }
  if (project.latestGit.dirty) {
    options.unshift({ id: "current:dirty", kind: "current_work", title: `Continue current work on ${project.latestGit.branch}`, detail: `${project.latestGit.workingFiles.length} uncommitted file(s) detected for ${participant}`, branch: project.latestGit.branch });
  }
  options.push({ id: "new", kind: "new_feature", title: "Define a new feature", detail: "Describe the user-facing outcome and add a concrete completion checklist." });
  return options;
}

export async function getProjectContext(repoPath: string) {
  const git = await inspectRepository(repoPath);
  return mutate((state) => {
    const id = projectId(git.remote, git.root);
    let project = state.projects.find((item) => item.id === id);
    const timestamp = new Date().toISOString();
    if (!project) {
      project = { id, name: path.basename(git.root), root: git.root, remote: git.remote, latestGit: git, createdAt: timestamp, updatedAt: timestamp };
      state.projects.push(project);
    } else {
      project.latestGit = git;
      project.remote = git.remote;
      project.root = git.root;
      project.updatedAt = timestamp;
    }
    const features = state.features.filter((item) => item.projectId === id);
    const sessions = state.sessions.filter((item) => item.projectId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return { project, features, sessions };
  });
}

export async function startCollaborationSession(input: { repoPath: string; participant: string; intent?: string }) {
  const context = await getProjectContext(input.repoPath);
  return mutate((state) => {
    const session: CollaborationSession = {
      id: `session_${randomUUID()}`,
      projectId: context.project.id,
      repoPath: context.project.root,
      participant: input.participant,
      intent: input.intent,
      status: "choosing",
      startSnapshot: context.project.latestGit,
      startedAt: new Date().toISOString(),
    };
    state.sessions.push(session);
    const teammates = state.sessions.filter((item) => item.projectId === context.project.id && item.id !== session.id).slice(-8).reverse();
    return {
      session,
      project: context.project,
      teammates,
      workOptions: buildWorkOptions(context.project, context.features, input.participant),
      agentInstructions: "Briefly summarize the repository and recent teammate activity. Present 3 to 6 concrete work options, including Define a new feature. Ask the user to choose or refine one. After the user decides, call choose_work_item before editing code.",
    };
  });
}

export async function chooseWorkItem(input: { sessionId: string; featureId?: string; newFeature?: { title: string; description: string; checklist: string[] }; intendedBranch?: string }) {
  return mutate((state) => {
    const session = findSession(state, input.sessionId);
    if (session.status === "synced") throw new Error("This session has already been synced.");
    let feature: Feature | undefined;
    if (input.featureId) {
      feature = state.features.find((item) => item.id === input.featureId && item.projectId === session.projectId);
      if (!feature) throw new Error("The selected feature does not belong to this project.");
    } else if (input.newFeature) {
      if (!input.newFeature.checklist.length) throw new Error("A feature needs at least one completion checklist item.");
      const timestamp = new Date().toISOString();
      feature = {
        id: `feature_${randomUUID()}`,
        projectId: session.projectId,
        title: input.newFeature.title,
        description: input.newFeature.description,
        checklist: input.newFeature.checklist.map((text) => ({ id: `check_${randomUUID()}`, text, done: false })),
        status: "active",
        owner: session.participant,
        branch: input.intendedBranch || session.startSnapshot.branch,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.features.push(feature);
    } else {
      throw new Error("Choose an existing feature or define a new feature.");
    }
    feature.owner = session.participant;
    feature.status = "active";
    feature.branch = input.intendedBranch || feature.branch || session.startSnapshot.branch;
    feature.updatedAt = new Date().toISOString();
    session.featureId = feature.id;
    session.status = "active";
    return {
      session,
      feature,
      agentInstructions: `Work only on the selected feature. Keep its checklist visible in your plan. Before ending the chat, summarize what happened and call sync_collaboration_session with sessionId ${session.id}.`,
    };
  });
}

export async function syncCollaborationSession(input: {
  sessionId: string;
  summary: string;
  workCompleted: string[];
  decisions: string[];
  blockers: string[];
  nextSteps: string[];
  agentReportedFiles: string[];
  completedChecklistItemIds?: string[];
  featureStatus?: FeatureStatus;
}) {
  const state = await readState();
  const existing = findSession(state, input.sessionId);
  if (existing.status === "synced") throw new Error("This session has already been synced.");
  const current = await inspectRepository(existing.repoPath);
  const verified = await inspectDelta(existing.startSnapshot, current, input.agentReportedFiles);

  return mutate((latest) => {
    const session = findSession(latest, input.sessionId);
    if (session.status === "synced") throw new Error("This session has already been synced.");
    session.status = "synced";
    session.syncedAt = new Date().toISOString();
    session.sync = {
      summary: input.summary,
      workCompleted: input.workCompleted,
      decisions: input.decisions,
      blockers: input.blockers,
      nextSteps: input.nextSteps,
      agentReportedFiles: input.agentReportedFiles,
      verified,
    };

    const feature = session.featureId ? latest.features.find((item) => item.id === session.featureId) : undefined;
    if (feature) {
      for (const item of feature.checklist) {
        if (input.completedChecklistItemIds?.includes(item.id)) item.done = true;
      }
      if (input.featureStatus === "done" && (verified.changedFiles.length === 0 || feature.checklist.some((item) => !item.done))) {
        throw new Error("Done requires Git-verified changes and every checklist item completed.");
      }
      feature.status = input.featureStatus || (input.blockers.length ? "blocked" : "review");
      feature.updatedAt = session.syncedAt;
    }

    const project = latest.projects.find((item) => item.id === session.projectId)!;
    project.latestGit = current;
    project.updatedAt = session.syncedAt;
    return {
      session,
      feature,
      verification: verified,
      agentInstructions: verified.reportedButUnverified.length
        ? `Tell the user that ${verified.reportedButUnverified.length} reported file(s) were not visible in Git and list them clearly. Do not claim they were synced.`
        : "Confirm the session was synced and distinguish the agent-authored summary from the Git-verified commits and files.",
    };
  });
}

export async function resetStateForTests() {
  await save(emptyState());
}

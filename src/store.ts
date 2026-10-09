import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { inspectDelta, inspectRepository } from "./git.js";
import type { CollaborationSession, CollavibeState, Feature, FeatureStatus, Project, Team, User, WorkOption } from "./types.js";

const emptyState = (): CollavibeState => ({
  projects: [], features: [], sessions: [], users: [], teams: [], memberships: [], authSessions: [], teamProjects: [],
});
const statePath = () => process.env.COLLAVIBE_DATA_PATH || path.join(process.cwd(), ".collavibe", "state.json");
let writeQueue: Promise<unknown> = Promise.resolve();
const scryptAsync = promisify(scrypt);
const AUTH_SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const TEAM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 10_000;
const STALE_LOCK_MS = 30_000;

async function withStateLock<T>(operation: () => Promise<T>): Promise<T> {
  const file = statePath();
  const lockFile = `${file}.lock`;
  const lockToken = `${process.pid}:${randomUUID()}`;
  await mkdir(path.dirname(file), { recursive: true });
  const startedAt = Date.now();
  let handle;

  while (!handle) {
    try {
      handle = await open(lockFile, "wx");
      await handle.writeFile(lockToken, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;

      try {
        const lock = await stat(lockFile);
        if (Date.now() - lock.mtimeMs > STALE_LOCK_MS) {
          await unlink(lockFile);
          continue;
        }
      } catch (inspectionError) {
        if ((inspectionError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw inspectionError;
      }

      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for Collavibe state lock: ${lockFile}`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close();
    try {
      if (await readFile(lockFile, "utf8") === lockToken) await unlink(lockFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function save(state: CollavibeState) {
  const file = statePath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await rename(temporary, file);
}

export async function readState(): Promise<CollavibeState> {
  try {
    const stored = JSON.parse(await readFile(/* turbopackIgnore: true */ statePath(), "utf8")) as Partial<CollavibeState>;
    return { ...emptyState(), ...stored };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return emptyState();
  }
}

function publicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeTeamCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function newTeamCode(existing: Set<string>) {
  for (;;) {
    const bytes = randomBytes(8);
    const code = Array.from(bytes, (byte) => TEAM_CODE_ALPHABET[byte % TEAM_CODE_ALPHABET.length]).join("");
    if (!existing.has(code)) return code;
  }
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scryptAsync(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function issueAuthSession(state: CollavibeState, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  state.authSessions = state.authSessions.filter((session) => new Date(session.expiresAt) > now);
  state.authSessions.push({
    id: `auth_${randomUUID()}`,
    tokenHash: tokenHash(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AUTH_SESSION_MS).toISOString(),
  });
  return token;
}

export async function signUpUser(input: { name: string; email: string; password: string }) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length < 2 || name.length > 120) throw new Error("Name must be between 2 and 120 characters.");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  if (input.password.length < 10 || input.password.length > 256) throw new Error("Password must be at least 10 characters.");
  const passwordHash = await hashPassword(input.password);
  return mutate((state) => {
    if (state.users.some((user) => user.email === email)) throw new Error("An account with this email already exists.");
    const user: User = { id: `user_${randomUUID()}`, name, email, passwordHash, createdAt: new Date().toISOString() };
    state.users.push(user);
    return { user: publicUser(user), token: issueAuthSession(state, user.id) };
  });
}

export async function loginUser(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const state = await readState();
  const user = state.users.find((candidate) => candidate.email === email);
  if (!user || !await verifyPassword(input.password, user.passwordHash)) throw new Error("Email or password is incorrect.");
  return mutate((latest) => {
    const current = latest.users.find((candidate) => candidate.id === user.id);
    if (!current) throw new Error("Email or password is incorrect.");
    return { user: publicUser(current), token: issueAuthSession(latest, current.id) };
  });
}

export async function logoutUser(token: string) {
  return mutate((state) => {
    const before = state.authSessions.length;
    const hash = tokenHash(token);
    state.authSessions = state.authSessions.filter((session) => session.tokenHash !== hash);
    return before !== state.authSessions.length;
  });
}

export async function getUserForToken(token: string | undefined) {
  if (!token) return undefined;
  const state = await readState();
  const hash = tokenHash(token);
  const auth = state.authSessions.find((session) => session.tokenHash === hash && new Date(session.expiresAt) > new Date());
  const user = auth && state.users.find((candidate) => candidate.id === auth.userId);
  return user ? publicUser(user) : undefined;
}

function teamSummary(state: CollavibeState, team: Team) {
  return {
    id: team.id,
    name: team.name,
    joinCode: team.joinCode,
    ownerUserId: team.ownerUserId,
    memberCount: state.memberships.filter((membership) => membership.teamId === team.id).length,
    projectCount: state.teamProjects.filter((link) => link.teamId === team.id).length,
    createdAt: team.createdAt,
  };
}

function requireMembership(state: CollavibeState, userId: string, teamId: string) {
  const membership = state.memberships.find((item) => item.userId === userId && item.teamId === teamId);
  if (!membership) throw new Error("You are not a member of this team.");
  return membership;
}

export async function createTeam(input: { userId: string; name: string; repoPath?: string }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Team name must be between 2 and 120 characters.");
  const projectContext = input.repoPath?.trim() ? await getProjectContext(input.repoPath.trim()) : undefined;
  return mutate((state) => {
    if (!state.users.some((user) => user.id === input.userId)) throw new Error("Unknown user.");
    if (projectContext && state.teamProjects.some((link) => link.projectId === projectContext.project.id)) {
      throw new Error("This project already belongs to another team.");
    }
    const timestamp = new Date().toISOString();
    const team: Team = {
      id: `team_${randomUUID()}`,
      name,
      joinCode: newTeamCode(new Set(state.teams.map((item) => item.joinCode))),
      ownerUserId: input.userId,
      createdAt: timestamp,
    };
    state.teams.push(team);
    state.memberships.push({ id: `member_${randomUUID()}`, teamId: team.id, userId: input.userId, role: "owner", joinedAt: timestamp });
    if (projectContext) {
      state.teamProjects.push({ teamId: team.id, projectId: projectContext.project.id, addedByUserId: input.userId, addedAt: timestamp });
    }
    return teamSummary(state, team);
  });
}

export async function joinTeam(input: { userId: string; joinCode: string }) {
  const joinCode = normalizeTeamCode(input.joinCode);
  return mutate((state) => {
    const team = state.teams.find((candidate) => candidate.joinCode === joinCode);
    if (!team) throw new Error("That team code is not valid.");
    if (!state.memberships.some((item) => item.teamId === team.id && item.userId === input.userId)) {
      state.memberships.push({ id: `member_${randomUUID()}`, teamId: team.id, userId: input.userId, role: "member", joinedAt: new Date().toISOString() });
    }
    return teamSummary(state, team);
  });
}

export async function addProjectToTeam(input: { userId: string; teamId: string; repoPath: string }) {
  const context = await getProjectContext(input.repoPath);
  return mutate((state) => {
    requireMembership(state, input.userId, input.teamId);
    const existing = state.teamProjects.find((link) => link.projectId === context.project.id);
    if (existing && existing.teamId !== input.teamId) throw new Error("This project already belongs to another team.");
    if (!existing) state.teamProjects.push({ teamId: input.teamId, projectId: context.project.id, addedByUserId: input.userId, addedAt: new Date().toISOString() });
    return context.project;
  });
}

export async function getDashboard(userId: string, requestedTeamId?: string) {
  const state = await readState();
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Unknown user.");
  const memberships = state.memberships.filter((item) => item.userId === userId);
  const teams = memberships.map((membership) => state.teams.find((team) => team.id === membership.teamId)).filter((team): team is Team => Boolean(team));
  const selectedTeam = teams.find((team) => team.id === requestedTeamId) || teams[0];
  const projectIds = new Set(state.teamProjects.filter((link) => link.teamId === selectedTeam?.id).map((link) => link.projectId));
  return {
    user: publicUser(user),
    teams: teams.map((team) => teamSummary(state, team)),
    selectedTeam: selectedTeam ? teamSummary(state, selectedTeam) : undefined,
    projects: state.projects.filter((project) => projectIds.has(project.id)),
    features: state.features.filter((feature) => projectIds.has(feature.projectId)),
    sessions: state.sessions.filter((session) => projectIds.has(session.projectId)),
    defaultRepoPath: process.cwd(),
  };
}

async function mutate<T>(operation: (state: CollavibeState) => Promise<T> | T): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    await withStateLock(async () => {
      const state = await readState();
      result = await operation(state);
      await save(state);
    });
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
  for (const branch of project.latestGit.branches.filter((item) => !item.current && !item.name.startsWith("origin/") && item.name !== "main" && item.name !== "master")) {
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

export async function getProjectContext(repoPath: string, teamCode?: string) {
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
    let team = state.teamProjects.find((link) => link.projectId === id);
    if (teamCode) {
      const requestedTeam = state.teams.find((candidate) => candidate.joinCode === normalizeTeamCode(teamCode));
      if (!requestedTeam) throw new Error("That team code is not valid.");
      if (team && team.teamId !== requestedTeam.id) throw new Error("This project already belongs to another team.");
      if (!team) {
        team = { teamId: requestedTeam.id, projectId: id, addedAt: timestamp };
        state.teamProjects.push(team);
      }
    }
    const linkedTeam = team ? state.teams.find((candidate) => candidate.id === team.teamId) : undefined;
    const features = state.features.filter((item) => item.projectId === id);
    const sessions = state.sessions.filter((item) => item.projectId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return { project, features, sessions, team: linkedTeam ? { id: linkedTeam.id, name: linkedTeam.name } : undefined };
  });
}

export async function startCollaborationSession(input: { repoPath: string; participant: string; intent?: string; teamCode?: string }) {
  const context = await getProjectContext(input.repoPath, input.teamCode);
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
      team: context.team,
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
    if (session.status === "active") throw new Error("This session already has selected work.");
    if (Boolean(input.featureId) === Boolean(input.newFeature)) {
      throw new Error("Choose exactly one existing feature or one new feature.");
    }
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

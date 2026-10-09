export type FeatureStatus = "planned" | "active" | "review" | "done" | "blocked";

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  authoredAt: string;
  subject: string;
}

export interface GitBranch {
  name: string;
  head: string;
  fullHead?: string;
  current: boolean;
  upstream?: string;
}

export interface GitSnapshot {
  root: string;
  remote?: string;
  branch: string;
  head: string;
  dirty: boolean;
  workingFiles: string[];
  workingFileFingerprints?: Record<string, string>;
  branches: GitBranch[];
  recentCommits: GitCommit[];
  trackedFiles: string[];
  capturedAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Feature {
  id: string;
  projectId: string;
  title: string;
  description: string;
  checklist: ChecklistItem[];
  status: FeatureStatus;
  owner?: string;
  branch?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerifiedDelta {
  source?: "local_git" | "agent_attested";
  startHead: string;
  endHead: string;
  startBranch: string;
  endBranch: string;
  commits: GitCommit[];
  changedFiles: string[];
  workingFiles: string[];
  reportedButUnverified: string[];
}

export interface SessionSync {
  summary: string;
  workCompleted: string[];
  decisions: string[];
  blockers: string[];
  nextSteps: string[];
  agentReportedFiles: string[];
  verified: VerifiedDelta;
}

export interface CollaborationSession {
  id: string;
  projectId: string;
  repoPath: string;
  participant: string;
  intent?: string;
  featureId?: string;
  status: "choosing" | "active" | "synced";
  startSnapshot: GitSnapshot;
  startedAt: string;
  syncedAt?: string;
  sync?: SessionSync;
  /** Local-only capability used to publish this session to its hosted team. */
  teamCode?: string;
}

export interface Project {
  id: string;
  name: string;
  root: string;
  remote?: string;
  latestGit: GitSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  joinCode: string;
  ownerUserId: string;
  createdAt: string;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: string;
}

export interface AuthSession {
  id: string;
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface TeamProject {
  teamId: string;
  projectId: string;
  addedByUserId?: string;
  addedAt: string;
}

export interface CollavibeState {
  projects: Project[];
  features: Feature[];
  sessions: CollaborationSession[];
  users: User[];
  teams: Team[];
  memberships: TeamMembership[];
  authSessions: AuthSession[];
  teamProjects: TeamProject[];
}

export interface WorkOption {
  id: string;
  kind: "feature" | "branch" | "current_work" | "new_feature";
  title: string;
  detail: string;
  featureId?: string;
  branch?: string;
}

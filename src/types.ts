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
  startHead: string;
  endHead: string;
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

export interface CollavibeState {
  projects: Project[];
  features: Feature[];
  sessions: CollaborationSession[];
}

export interface WorkOption {
  id: string;
  kind: "feature" | "branch" | "current_work" | "new_feature";
  title: string;
  detail: string;
  featureId?: string;
  branch?: string;
}

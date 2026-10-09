export type FeatureStatus = "queued" | "active" | "review" | "done" | "blocked";
export type Role = "product" | "systems" | "verification" | "integration";
export type EvidenceType = "test" | "preview" | "screenshot" | "log" | "explanation";

export interface Member {
  id: string;
  name: string;
  initials: string;
  role: Role;
}

export interface Feature {
  id: string;
  title: string;
  userStory: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  status: FeatureStatus;
  ownerId?: string;
  risk: "low" | "medium" | "high";
  updatedAt: string;
}

export interface WorkSession {
  id: string;
  featureId: string;
  memberId: string;
  plan: string;
  expectedEvidence: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
}

export interface Decision {
  id: string;
  featureId: string;
  memberId: string;
  decision: string;
  rationale: string;
  alternatives: string;
  affectedComponents: string[];
  createdAt: string;
}

export interface Evidence {
  id: string;
  featureId: string;
  memberId: string;
  type: EvidenceType;
  title: string;
  result: "pass" | "fail" | "inconclusive";
  details: string;
  url?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  featureId: string;
  requesterId: string;
  reviewerId: string;
  status: "requested" | "changes_requested" | "accepted";
  notes?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface Handoff {
  id: string;
  featureId: string;
  memberId: string;
  intent: string;
  changes: string;
  evidenceSummary: string;
  uncertainty: string;
  nextAction: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  shortName: string;
  audience: string;
  problem: string;
  definitionOfDone: string[];
  safetyConstraints: string[];
}

export interface ProjectState {
  project: Project;
  currentMemberId: string;
  members: Member[];
  features: Feature[];
  sessions: WorkSession[];
  decisions: Decision[];
  evidence: Evidence[];
  reviews: Review[];
  handoffs: Handoff[];
}

export interface FeatureSummary extends Feature {
  owner?: Member;
  evidenceCount: number;
  openReview?: Review;
  activeSession?: WorkSession;
}

export interface ProjectView extends ProjectState {
  featureSummaries: FeatureSummary[];
  counts: Record<FeatureStatus, number>;
}

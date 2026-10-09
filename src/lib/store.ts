import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { seedState } from "./seed";
import type {
  Decision,
  Evidence,
  EvidenceType,
  Feature,
  FeatureStatus,
  Handoff,
  ProjectState,
  ProjectView,
  Review,
  WorkSession,
} from "./types";

const dataPath = () => process.env.COLLAVIBE_DATA_PATH || path.join(process.cwd(), ".collavibe", "data.json");

const cloneSeed = (): ProjectState => JSON.parse(JSON.stringify(seedState)) as ProjectState;

async function persist(state: ProjectState) {
  const file = dataPath();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), "utf8");
  await rename(temp, file);
}

export async function readState(): Promise<ProjectState> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ dataPath(), "utf8")) as ProjectState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const seeded = cloneSeed();
    await persist(seeded);
    return seeded;
  }
}

async function mutate<T>(operation: (state: ProjectState) => T | Promise<T>): Promise<T> {
  const state = await readState();
  const result = await operation(state);
  await persist(state);
  return result;
}

export async function getProjectView(): Promise<ProjectView> {
  const state = await readState();
  const featureSummaries = state.features.map((feature) => ({
    ...feature,
    owner: state.members.find((member) => member.id === feature.ownerId),
    evidenceCount: state.evidence.filter((item) => item.featureId === feature.id).length,
    openReview: state.reviews.find((review) => review.featureId === feature.id && review.status !== "accepted"),
    activeSession: state.sessions.find((session) => session.featureId === feature.id && !session.endedAt),
  }));

  const counts = { queued: 0, active: 0, review: 0, done: 0, blocked: 0 } satisfies Record<FeatureStatus, number>;
  for (const feature of state.features) counts[feature.status] += 1;
  return { ...state, featureSummaries, counts };
}

function requireFeature(state: ProjectState, featureId: string) {
  const feature = state.features.find((item) => item.id === featureId);
  if (!feature) throw new Error(`Unknown feature: ${featureId}`);
  return feature;
}

function requireMember(state: ProjectState, memberId: string) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) throw new Error(`Unknown member: ${memberId}`);
  return member;
}

export async function createFeature(input: { title: string; userStory: string; acceptanceCriteria: string[]; risk: Feature["risk"] }) {
  return mutate((state) => {
    const timestamp = new Date().toISOString();
    const feature: Feature = {
      id: `feature_${randomUUID()}`,
      title: input.title,
      userStory: input.userStory,
      acceptanceCriteria: input.acceptanceCriteria,
      dependencies: [],
      status: "queued",
      risk: input.risk,
      updatedAt: timestamp,
    };
    state.features.push(feature);
    return feature;
  });
}

export async function claimFeature(featureId: string, memberId: string) {
  return mutate((state) => {
    const feature = requireFeature(state, featureId);
    requireMember(state, memberId);
    if (feature.ownerId && feature.ownerId !== memberId) throw new Error("Feature is already owned by another teammate.");
    feature.ownerId = memberId;
    if (feature.status === "queued") feature.status = "active";
    feature.updatedAt = new Date().toISOString();
    return feature;
  });
}

export async function startSession(input: { featureId: string; memberId: string; plan: string; expectedEvidence: string }) {
  return mutate((state) => {
    const feature = requireFeature(state, input.featureId);
    requireMember(state, input.memberId);
    if (feature.ownerId !== input.memberId) throw new Error("Claim the feature before starting a session.");
    if (state.sessions.some((session) => session.featureId === input.featureId && !session.endedAt)) throw new Error("This feature already has an active session.");
    const session: WorkSession = { id: `session_${randomUUID()}`, ...input, startedAt: new Date().toISOString() };
    state.sessions.push(session);
    feature.status = "active";
    feature.updatedAt = session.startedAt;
    return session;
  });
}

export async function recordDecision(input: Omit<Decision, "id" | "createdAt">) {
  return mutate((state) => {
    requireFeature(state, input.featureId);
    requireMember(state, input.memberId);
    if (!input.alternatives.trim()) throw new Error("Record an alternative or explain why none was considered.");
    const decision: Decision = { id: `decision_${randomUUID()}`, ...input, createdAt: new Date().toISOString() };
    state.decisions.push(decision);
    return decision;
  });
}

export async function attachEvidence(input: { featureId: string; memberId: string; type: EvidenceType; title: string; result: Evidence["result"]; details: string; url?: string }) {
  return mutate((state) => {
    requireFeature(state, input.featureId);
    requireMember(state, input.memberId);
    const evidence: Evidence = { id: `evidence_${randomUUID()}`, ...input, createdAt: new Date().toISOString() };
    state.evidence.push(evidence);
    return evidence;
  });
}

export async function requestReview(input: { featureId: string; requesterId: string; reviewerId: string }) {
  return mutate((state) => {
    const feature = requireFeature(state, input.featureId);
    requireMember(state, input.requesterId);
    requireMember(state, input.reviewerId);
    if (input.requesterId === input.reviewerId) throw new Error("Creators cannot approve their own work.");
    if (!state.evidence.some((item) => item.featureId === input.featureId)) throw new Error("Attach evidence before requesting review.");
    const review: Review = { id: `review_${randomUUID()}`, ...input, status: "requested", createdAt: new Date().toISOString() };
    state.reviews.push(review);
    feature.status = "review";
    feature.updatedAt = review.createdAt;
    return review;
  });
}

export async function resolveReview(input: { reviewId: string; reviewerId: string; status: "accepted" | "changes_requested"; notes: string }) {
  return mutate((state) => {
    const review = state.reviews.find((item) => item.id === input.reviewId);
    if (!review) throw new Error(`Unknown review: ${input.reviewId}`);
    requireMember(state, input.reviewerId);
    if (review.reviewerId !== input.reviewerId) throw new Error("Only the assigned reviewer can resolve this review.");
    if (review.status === "accepted") throw new Error("This review has already been accepted.");
    const feature = requireFeature(state, review.featureId);
    review.status = input.status;
    review.notes = input.notes;
    review.resolvedAt = new Date().toISOString();
    feature.status = input.status === "accepted" ? "review" : "active";
    feature.updatedAt = review.resolvedAt;
    return review;
  });
}

export async function updateFeature(input: { featureId: string; status: FeatureStatus }) {
  return mutate((state) => {
    const feature = requireFeature(state, input.featureId);
    if (input.status === "done") {
      const hasEvidence = state.evidence.some((item) => item.featureId === input.featureId && item.result === "pass");
      const hasAcceptedReview = state.reviews.some((item) => item.featureId === input.featureId && item.status === "accepted");
      if (!hasEvidence || !hasAcceptedReview) throw new Error("Done requires passing evidence and an accepted peer review.");
    }
    feature.status = input.status;
    feature.updatedAt = new Date().toISOString();
    return feature;
  });
}

export async function finishSession(input: { sessionId: string; summary: string; handoff: Omit<Handoff, "id" | "createdAt" | "memberId" | "featureId"> }) {
  return mutate((state) => {
    const session = state.sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`Unknown session: ${input.sessionId}`);
    if (session.endedAt) throw new Error("Session is already finished.");
    session.endedAt = new Date().toISOString();
    session.summary = input.summary;
    const handoff: Handoff = {
      id: `handoff_${randomUUID()}`,
      featureId: session.featureId,
      memberId: session.memberId,
      ...input.handoff,
      createdAt: session.endedAt,
    };
    state.handoffs.push(handoff);
    return { session, handoff };
  });
}

export async function resetStoreForTests() {
  await persist(cloneSeed());
}

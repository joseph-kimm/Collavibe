import { createHash } from "node:crypto";
import { z } from "zod";
import { collaborationScope, findRecord, newRecord, readRecords, reviseRecord, saveRecord, type Actor, type CollaborationRecord } from "./collaboration-records.js";
import { publicText, publicUrl } from "./portfolios.js";
import { WorkspaceError } from "./workspace-model.js";

const version = z.number().int().positive();
const link = publicUrl.default("");
const discussionFields = z.object({
  category: z.enum(["update", "question", "comparison"]),
  title: z.string().trim().min(4).max(140),
  body: z.string().trim().min(12).max(4000),
  evidenceUrl: link,
});
const replyFields = z.object({ body: z.string().trim().min(3).max(2500) });
const projectIds = ["first-build", "two-api", "reliable-data", "final-project"] as const;
const projectFields = z.object({
  assignmentId: z.enum(projectIds),
  title: z.string().trim().min(2).max(140),
  problem: z.string().trim().min(5).max(1000),
  tools: z.string().trim().min(2).max(600),
  decision: z.string().trim().min(5).max(1600),
  evidence: z.string().trim().min(5).max(1200),
  projectUrl: link,
  demoUrl: link,
});
const profileFields = z.object({
  title: z.string().trim().min(3).max(140),
  introduction: z.string().trim().max(1200).default(""),
  projects: z.array(projectFields).max(4).refine(
    projects => new Set(projects.map(project => project.assignmentId)).size === projects.length,
    "Add one entry per course project.",
  ),
});
type PortfolioContent = z.infer<typeof profileFields>;

function visible(row: CollaborationRecord, teamId: string, kind: "post" | "reply", entry: string) {
  return row.teamId === teamId && row.projectId === null && row.kind === kind
    && row.payload.courseEntry === entry && !row.payload.removed && !row.deletedAt;
}

function discussionView(row: CollaborationRecord, actor: Actor, organizer: boolean) {
  return {
    id: row.id,
    version: row.version,
    authorName: row.authorName,
    createdAt: row.createdAt,
    body: String(row.payload.body),
    canRemove: organizer || row.authorId === actor.id,
  };
}

export async function courseDiscussions(actor: Actor, teamId: string) {
  const { owner } = await collaborationScope(actor, teamId);
  const [posts, replies] = await Promise.all([
    readRecords(teamId, null, "post", "discussion"),
    readRecords(teamId, null, "reply", "discussion-reply"),
  ]);
  const byThread = new Map<string, ReturnType<typeof discussionView>[]>();
  for (const reply of replies) {
    if (!visible(reply, teamId, "reply", "discussion-reply")) continue;
    const parentId = String(reply.payload.parentId);
    const thread = byThread.get(parentId) ?? [];
    thread.push(discussionView(reply, actor, owner));
    byThread.set(parentId, thread);
  }
  return posts.filter(row => visible(row, teamId, "post", "discussion"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(row => ({
      ...discussionView(row, actor, owner),
      category: row.payload.category,
      title: row.payload.title,
      evidenceUrl: row.payload.evidenceUrl,
      replies: byThread.get(row.id) ?? [],
    }));
}

export async function addCourseDiscussion(actor: Actor, teamId: string, raw: unknown) {
  const input = discussionFields.parse(raw);
  await collaborationScope(actor, teamId);
  const row = newRecord(actor, teamId, null, "post", { ...input, courseEntry: "discussion" });
  await saveRecord(actor, row, null);
  return row.id;
}

async function discussionThread(teamId: string, id: string) {
  const row = await findRecord(id);
  if (!row || !visible(row, teamId, "post", "discussion")) throw new WorkspaceError("Discussion not found.", 404);
  return row;
}

export async function addDiscussionReply(actor: Actor, teamId: string, id: string, raw: unknown) {
  const input = replyFields.parse(raw);
  await collaborationScope(actor, teamId);
  await discussionThread(teamId, id);
  const row = newRecord(actor, teamId, null, "reply", { ...input, parentId: id, courseEntry: "discussion-reply" });
  await saveRecord(actor, row, null);
  return row.id;
}

export async function removeDiscussionEntry(actor: Actor, teamId: string, threadId: string, raw: unknown, replyId?: string) {
  const { expectedVersion } = z.object({ expectedVersion: version }).parse(raw);
  const { owner } = await collaborationScope(actor, teamId);
  const thread = await discussionThread(teamId, threadId);
  const row = replyId ? await findRecord(replyId) : thread;
  if (!row || (replyId && (!visible(row, teamId, "reply", "discussion-reply") || row.payload.parentId !== threadId))) {
    throw new WorkspaceError("Reply not found.", 404);
  }
  if (!owner && row.authorId !== actor.id) throw new WorkspaceError("Only the author or course organizer can remove this.", 403);
  if (row.version !== expectedVersion) throw new WorkspaceError("This discussion changed. Reload and try again.", 409);
  await saveRecord(actor, reviseRecord(row, { ...row.payload, removed: true }), expectedVersion);
}

function profileId(teamId: string, authorId: string) {
  // A stable ID makes concurrent first saves conflict instead of creating two portfolios.
  return "learner_" + createHash("sha256").update(JSON.stringify([teamId, authorId])).digest("hex");
}

async function privateProfile(actor: Actor, teamId: string) {
  await collaborationScope(actor, teamId);
  const row = await findRecord(profileId(teamId, actor.id));
  return row && row.authorId === actor.id && visible(row, teamId, "post", "learner-portfolio") ? row : null;
}

function profileView(row: CollaborationRecord | null) {
  return row && {
    version: row.version,
    content: row.payload.content as PortfolioContent,
    publicId: row.payload.snapshot ? row.id : null,
  };
}

export async function ownLearnerPortfolio(actor: Actor, teamId: string) {
  return profileView(await privateProfile(actor, teamId));
}

export async function saveLearnerPortfolio(actor: Actor, teamId: string, raw: unknown) {
  const { expectedVersion, ...content } = profileFields.extend({ expectedVersion: version.optional() }).parse(raw);
  const current = await privateProfile(actor, teamId);
  if (current?.version !== expectedVersion) throw new WorkspaceError("Your portfolio changed. Reload before saving.", 409);
  const payload = { ...current?.payload, courseEntry: "learner-portfolio", content };
  const row = current ? reviseRecord(current, payload) : newRecord(actor, teamId, null, "post", payload);
  if (!current) row.id = profileId(teamId, actor.id);
  return profileView(await saveRecord(actor, row, current?.version ?? null));
}

function portfolioPreview(row: CollaborationRecord) {
  const content = profileFields.parse(row.payload.content);
  if (!content.projects.length) throw new WorkspaceError("Save at least one project before publishing.", 400);
  const snapshot = {
    title: publicText(content.title, 140),
    authorName: publicText(row.authorName, 120),
    introduction: publicText(content.introduction, 1200),
    projects: content.projects.map(project => ({
      assignmentId: project.assignmentId,
      title: publicText(project.title, 140),
      problem: publicText(project.problem, 1000),
      tools: publicText(project.tools, 600),
      decision: publicText(project.decision, 1600),
      evidence: publicText(project.evidence, 1200),
      projectUrl: project.projectUrl,
      demoUrl: project.demoUrl,
    })),
  };
  const previewHash = createHash("sha256").update(JSON.stringify([row.version, snapshot])).digest("hex");
  return { snapshot, version: row.version, previewHash };
}

async function requiredProfile(actor: Actor, teamId: string) {
  const row = await privateProfile(actor, teamId);
  if (!row) throw new WorkspaceError("Save your portfolio first.", 404);
  return row;
}

export async function previewLearnerPortfolio(actor: Actor, teamId: string) {
  return portfolioPreview(await requiredProfile(actor, teamId));
}

export async function publishLearnerPortfolio(actor: Actor, teamId: string, raw: unknown) {
  const input = z.object({ expectedVersion: version, previewHash: z.string().regex(/^[a-f0-9]{64}$/), consent: z.literal(true) }).parse(raw);
  const row = await requiredProfile(actor, teamId);
  const preview = portfolioPreview(row);
  if (input.expectedVersion !== row.version || input.previewHash !== preview.previewHash) {
    throw new WorkspaceError("Review the latest portfolio preview before publishing.", 409);
  }
  return profileView(await saveRecord(actor, reviseRecord(row, { ...row.payload, snapshot: preview.snapshot }), row.version));
}

export async function unpublishLearnerPortfolio(actor: Actor, teamId: string, raw: unknown) {
  const { expectedVersion } = z.object({ expectedVersion: version }).parse(raw);
  const row = await requiredProfile(actor, teamId);
  if (row.version !== expectedVersion) throw new WorkspaceError("Your portfolio changed. Reload before unpublishing.", 409);
  return profileView(await saveRecord(actor, reviseRecord(row, { ...row.payload, snapshot: null }), row.version));
}

export async function publicLearnerPortfolio(id: string) {
  if (!/^learner_[a-f0-9]{64}$/.test(id)) throw new WorkspaceError("Portfolio not found.", 404);
  const row = await findRecord(id);
  if (!row || !visible(row, row.teamId, "post", "learner-portfolio") || !row.payload.snapshot) {
    throw new WorkspaceError("Portfolio not found.", 404);
  }
  return row.payload.snapshot;
}

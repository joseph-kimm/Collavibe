import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Feature, Project } from "./types.js";

const priorityField = z.enum(["low", "normal", "high", "urgent"]);
const dueDateField = z.union([z.iso.date(), z.literal("")]);

export const featureFields = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).default(""),
  status: z.enum(["planned", "active", "review", "done", "blocked"]).default("planned"),
  owner: z.string().trim().max(120).default(""),
  branch: z.string().trim().max(255).default(""),
  priority: priorityField.default("normal"),
  dueDate: dueDateField.default(""),
  checklist: z.array(z.object({ id: z.string().min(1).max(128).optional(), text: z.string().trim().min(1).max(500), done: z.boolean().default(false) })).max(100).default([]),
});
export const featurePatchSchema = featureFields.extend({ priority: priorityField.optional(), dueDate: dueDateField.optional(), expectedUpdatedAt: z.string().min(1).max(100) });
export type FeatureFields = z.infer<typeof featureFields>;
export const projectPatchSchema = z.object({ name: z.string().trim().min(2).max(200), archived: z.boolean(), expectedUpdatedAt: z.iso.datetime({ offset: true }) });
export const featureActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), archived: z.boolean(), expectedUpdatedAt: z.string().min(1).max(100) }),
  z.object({ action: z.literal("comment"), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("remove-comment"), commentId: z.string().min(1).max(128) }),
]);
export type FeatureAction = z.infer<typeof featureActionSchema>;
export function nextRevision(previous: string) { return new Date(Math.max(Date.now(), new Date(previous).getTime() + 1)).toISOString(); }

export function applyFeatureAction(current: Feature, input: FeatureAction, actor: { id: string; name: string; owner: boolean }, activeSession: boolean): Feature {
  const updated = structuredClone(current);
  if (input.action === "archive") {
    if (input.expectedUpdatedAt !== current.updatedAt) throw new WorkspaceError("This feature changed. Refresh before archiving or restoring.", 409);
    if (input.archived && activeSession) throw new WorkspaceError("An agent is working on this feature. Sync that session before archiving it.", 409);
    updated.archivedAt = input.archived ? new Date().toISOString() : undefined;
  } else {
    if (current.archivedAt) throw new WorkspaceError("Restore this feature before changing it.", 409);
    if (input.action === "comment") {
      if ((current.comments?.length || 0) >= 200) throw new WorkspaceError("This discussion has reached 200 comments. Remove older comments before adding more.", 409);
      updated.comments = [...(current.comments || []), { id: `comment_${randomUUID()}`, userId: actor.id, author: actor.name, text: input.text, createdAt: new Date().toISOString() }];
    } else {
      const comment = current.comments?.find((item) => item.id === input.commentId);
      if (!comment) throw new WorkspaceError("Comment not found.", 404);
      if (comment.userId !== actor.id && !actor.owner) throw new WorkspaceError("Only the author or team owner can remove a comment.", 403);
      updated.comments = current.comments!.filter((item) => item.id !== input.commentId);
    }
  }
  updated.updatedAt = nextRevision(current.updatedAt);
  return updated;
}

export class WorkspaceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function repositoryKey(value: string) {
  const clean = value.trim();
  const ssh = /^git@([^:]+):(.+)$/.exec(clean);
  const url = new URL(ssh ? `https://${ssh[1]}/${ssh[2]}` : clean);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTPS Git repository URL without credentials or query parameters.");
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.pathname.split("/").filter(Boolean).length < 2) throw new Error("Include the repository owner and name in the URL.");
  if (!url.pathname.endsWith(".git")) url.pathname += ".git";
  return url.toString();
}

export function makeProject(input: { name: string; repositoryUrl: string }, namespace = ""): Project {
  const key = repositoryKey(input.repositoryUrl);
  const name = z.string().trim().min(2).max(200).parse(input.name);
  const now = new Date().toISOString();
  return {
    id: `project_${createHash("sha256").update(namespace ? namespace + ":" + key : key).digest("hex").slice(0, namespace ? 20 : 12)}`,
    name, root: key, remote: key, createdAt: now, updatedAt: now,
    latestGit: { root: key, remote: key, branch: "", head: "", dirty: false, workingFiles: [], branches: [], recentCommits: [], trackedFiles: [], capturedAt: now },
  };
}

export function makeFeature(projectId: string, input: FeatureFields): Feature {
  const fields = featureFields.parse(input);
  if (fields.status === "done" && fields.checklist.some((item) => !item.done)) throw new Error("Complete the checklist before marking this feature done.");
  const now = new Date().toISOString();
  return { ...fields, id: `feature_${randomUUID()}`, projectId, checklist: fields.checklist.map((item) => ({ ...item, id: `check_${randomUUID()}` })), createdAt: now, updatedAt: now };
}

export function editFeature(current: Feature, input: z.input<typeof featurePatchSchema>): Feature {
  if (current.archivedAt) throw new WorkspaceError("Restore this feature before changing it.", 409);
  if (input.expectedUpdatedAt !== current.updatedAt) throw new WorkspaceError("This feature changed while you were editing. Reload the latest version before saving.", 409);
  // An already-open older browser may omit newly introduced fields. Preserve
  // those values; an explicit empty due date still clears the date.
  const fields = featureFields.parse({ ...input, priority: input.priority ?? current.priority ?? "normal", dueDate: input.dueDate ?? current.dueDate ?? "" });
  const existingIds = new Set(current.checklist.map((item) => item.id));
  const ids = fields.checklist.flatMap((item) => item.id ? [item.id] : []);
  if (new Set(ids).size !== ids.length || ids.some((id) => !existingIds.has(id))) throw new Error("Invalid checklist items. Reload the feature and try again.");
  if (fields.status === "done" && fields.checklist.some((item) => !item.done)) throw new Error("Complete the checklist before marking this feature done.");
  const updatedAt = nextRevision(current.updatedAt);
  return { ...current, ...fields, ownerUserId: fields.owner === current.owner ? current.ownerUserId : undefined, checklist: fields.checklist.map((item) => ({ ...item, id: item.id || `check_${randomUUID()}` })), updatedAt };
}

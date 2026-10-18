import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Feature, Project } from "./types.js";

export const featureFields = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).default(""),
  status: z.enum(["planned", "active", "review", "done", "blocked"]).default("planned"),
  owner: z.string().trim().max(120).default(""),
  branch: z.string().trim().max(255).default(""),
  checklist: z.array(z.object({ id: z.string().min(1).max(128).optional(), text: z.string().trim().min(1).max(500), done: z.boolean().default(false) })).max(100).default([]),
});
export const featurePatchSchema = featureFields.extend({ expectedUpdatedAt: z.string().min(1).max(100) });
export type FeatureFields = z.infer<typeof featureFields>;

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
  if (input.expectedUpdatedAt !== current.updatedAt) throw new WorkspaceError("This feature changed while you were editing. Reload the latest version before saving.", 409);
  const fields = featureFields.parse(input);
  const existingIds = new Set(current.checklist.map((item) => item.id));
  const ids = fields.checklist.flatMap((item) => item.id ? [item.id] : []);
  if (new Set(ids).size !== ids.length || ids.some((id) => !existingIds.has(id))) throw new Error("Invalid checklist items. Reload the feature and try again.");
  if (fields.status === "done" && fields.checklist.some((item) => !item.done)) throw new Error("Complete the checklist before marking this feature done.");
  const updatedAt = new Date(Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1)).toISOString();
  return { ...current, ...fields, ownerUserId: fields.owner === current.owner ? current.ownerUserId : undefined, checklist: fields.checklist.map((item) => ({ ...item, id: item.id || `check_${randomUUID()}` })), updatedAt };
}

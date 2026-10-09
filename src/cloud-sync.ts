import type { CollaborationSession, Feature, Project } from "./types.js";
import { withoutInternalGitEvidence } from "./public.js";

export interface CloudSyncPayload {
  teamCode: string;
  project: Project;
  features: Feature[];
  sessions: CollaborationSession[];
}

export function cloudSyncUrl() {
  return process.env.COLLAVIBE_CLOUD_URL?.trim().replace(/\/$/, "");
}

export async function publishCloudState(payload: CloudSyncPayload) {
  const baseUrl = cloudSyncUrl();
  if (!baseUrl) return { published: false as const, reason: "COLLAVIBE_CLOUD_URL is not configured" };
  const publicState = withoutInternalGitEvidence({ project: payload.project, features: payload.features, sessions: payload.sessions });
  const publicPayload: CloudSyncPayload = { teamCode: payload.teamCode, ...publicState };
  const response = await fetch(`${baseUrl}/api/agent/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(publicPayload),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || `Cloud sync failed with HTTP ${response.status}.`);
  return { published: true as const, result };
}

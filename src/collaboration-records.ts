import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDashboard, listTeamMembers, mutate, readState } from "./store.js";
import { cloudDashboard, getSupabaseAdmin, isSupabaseConfigured, throwSupabaseError } from "./supabase.js";
import { cloudMembers } from "./cloud-workspace.js";
import { nextRevision, WorkspaceError } from "./workspace-model.js";

export type Actor = { id: string; name: string; email?: string; createdAt?: string };
export const recordKind = z.enum(["reflection", "reply", "ticket", "meeting", "portfolio", "feedback", "intake", "post", "course_settings", "course_submission"]);
export type RecordKind = z.infer<typeof recordKind>;
export interface CollaborationRecord {
  id: string; teamId: string; projectId: string | null; kind: RecordKind;
  authorId: string; authorName: string; createdAt: string; updatedAt: string;
  version: number; payload: Record<string, unknown>; deletedAt?: string;
}

export async function collaborationScope(actor: Actor, teamId: string, projectId?: string) {
  const dashboard = isSupabaseConfigured()
    ? await cloudDashboard({ ...actor, email: actor.email || "", createdAt: actor.createdAt || new Date().toISOString() }, teamId)
    : await getDashboard(actor.id, teamId);
  if (dashboard.selectedTeam?.id !== teamId) throw new WorkspaceError("You do not have access to this team.", 403);
  const project = projectId ? dashboard.projects.find(item => item.id === projectId) : undefined;
  if (projectId && !project) throw new WorkspaceError("Project not found in this team.", 404);
  return { ...dashboard, project, owner: dashboard.selectedTeam.ownerUserId === actor.id };
}

export async function collaborationMembers(actor: Actor, teamId: string) {
  return isSupabaseConfigured() ? cloudMembers(actor.id, teamId) : listTeamMembers(actor.id, teamId);
}

// Reads here are internal. Every HTTP/MCP caller must enforce its own projection
// and scope before returning records. Anonymous callers never receive this list.
export async function readRecords(teamId?: string, projectId?: string | null, kind?: RecordKind, courseEntry?: string | null): Promise<CollaborationRecord[]> {
  if (!isSupabaseConfigured()) {
    return (await readState()).collaborationRecords?.filter(row =>
      (!teamId || row.teamId === teamId) &&
      (projectId === undefined || row.projectId === projectId) &&
      (!kind || row.kind === kind) &&
      (courseEntry === undefined || (row.payload.courseEntry ?? null) === courseEntry)
    ) || [];
  }
  let query = getSupabaseAdmin().from("collaboration_records").select("payload");
  if (teamId) query = query.eq("team_id", teamId);
  if (projectId !== undefined) query = projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);
  if (kind) query = query.eq("kind", kind);
  if (courseEntry === null) query = query.is("payload->payload->>courseEntry", null);
  if (typeof courseEntry === "string") query = query.eq("payload->payload->>courseEntry", courseEntry);
  const rows = await query.order("created_at");
  if (rows.error?.code === "42P01" || rows.error?.code === "PGRST205") throw new WorkspaceError("Collaboration features need the November 2 database migration before they can be used.", 503);
  throwSupabaseError(rows.error);
  return (rows.data || []).map(row => row.payload as CollaborationRecord);
}

export async function findRecord(id: string): Promise<CollaborationRecord | undefined> {
  if (!isSupabaseConfigured()) return (await readState()).collaborationRecords?.find(row => row.id === id);
  const row = await getSupabaseAdmin().from("collaboration_records").select("payload").eq("id", id).maybeSingle();
  throwSupabaseError(row.error);
  return row.data?.payload as CollaborationRecord | undefined;
}

export function newRecord(actor: Actor, teamId: string, projectId: string | null, kind: RecordKind, payload: Record<string, unknown>): CollaborationRecord {
  const now = new Date().toISOString();
  return { id: `${kind}_${randomUUID()}`, teamId, projectId, kind, authorId: actor.id, authorName: actor.name, createdAt: now, updatedAt: now, version: 1, payload };
}

export function reviseRecord(row: CollaborationRecord, payload: Record<string, unknown>): CollaborationRecord {
  return { ...row, payload, version: row.version + 1, updatedAt: nextRevision(row.updatedAt) };
}

export async function saveRecord(actor: Actor, row: CollaborationRecord, expected: number | null): Promise<CollaborationRecord> {
  if (JSON.stringify(row).length > 500_000) throw new WorkspaceError("This record is too large.", 413);
  if (isSupabaseConfigured()) {
    const result = await getSupabaseAdmin().rpc("save_collaboration_record", { actor_id: actor.id, document: row, expected_version: expected });
    if (result.error) {
      const status = ({ PT409: 409, PT404: 404, "42501": 403 } as Record<string, number>)[result.error.code];
      if (status) throw new WorkspaceError(result.error.message, status);
      throwSupabaseError(result.error);
    }
    return row;
  }
  return mutate(state => {
    const rows = state.collaborationRecords ||= [];
    const current = rows.find(item => item.id === row.id);
    if ((current?.version ?? null) !== expected) throw new WorkspaceError("This record changed. Reload it before saving.", 409);
    if (current && (current.teamId !== row.teamId || current.projectId !== row.projectId || current.authorId !== row.authorId || current.kind !== row.kind)) throw new WorkspaceError("Record identity cannot change.", 403);
    const member = state.memberships.some(item => item.userId === actor.id && item.teamId === row.teamId);
    const published = rows.find(item => item.id === row.payload.portfolioId && item.kind === "portfolio" && item.payload.published === true && !item.deletedAt);
    if (!member && !(row.kind === "feedback" && published?.teamId === row.teamId && published.projectId === row.projectId)) throw new WorkspaceError("You do not have access to this team.", 403);
    if (row.projectId && !state.teamProjects.some(item => item.teamId === row.teamId && item.projectId === row.projectId)) throw new WorkspaceError("Project not found in this team.", 404);
    if (current) rows[rows.indexOf(current)] = structuredClone(row); else rows.push(structuredClone(row));
    return row;
  });
}

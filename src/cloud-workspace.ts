import { randomBytes } from "node:crypto";
import { getSupabaseAdmin, throwSupabaseError } from "./supabase.js";
import { editFeature, makeFeature, makeProject, WorkspaceError, type FeatureFields } from "./workspace-model.js";
import type { Feature } from "./types.js";

const db = getSupabaseAdmin;
const check = throwSupabaseError;

export async function cloudRequireMember(userId: string, teamId: string, owner = false) {
  const team = await db().from("teams").select("id,name,owner_user_id").eq("id", teamId).maybeSingle();
  check(team.error);
  const member = await db().from("team_members").select("user_id").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  check(member.error);
  if (!team.data || !member.data) throw new WorkspaceError("You do not have access to this team.", 403);
  if (owner && team.data.owner_user_id !== userId) throw new WorkspaceError("Only the team owner can change this setting.", 403);
  return team.data;
}

async function requireProject(userId: string, teamId: string, projectId: string) {
  await cloudRequireMember(userId, teamId);
  const link = await db().from("team_projects").select("project_id").eq("team_id", teamId).eq("project_id", projectId).maybeSingle();
  check(link.error);
  if (!link.data) throw new WorkspaceError("Project not found in this team.", 404);
}

export async function cloudMembers(userId: string, teamId: string) {
  await cloudRequireMember(userId, teamId);
  const rows = await db().from("team_members").select("user_id,role,joined_at").eq("team_id", teamId).order("joined_at");
  check(rows.error);
  const ids = (rows.data || []).map((row) => row.user_id);
  const profiles = ids.length ? await db().from("profiles").select("id,name,email").in("id", ids) : { data: [], error: null };
  check(profiles.error);
  return (rows.data || []).map((row) => ({ userId: row.user_id, role: row.role, joinedAt: row.joined_at, name: profiles.data?.find((profile) => profile.id === row.user_id)?.name || "Teammate", email: profiles.data?.find((profile) => profile.id === row.user_id)?.email || "" }));
}

export async function cloudUpdateTeam(userId: string, teamId: string, name: string) {
  await cloudRequireMember(userId, teamId, true);
  check((await db().from("teams").update({ name }).eq("id", teamId)).error);
}

export async function cloudRotateCode(userId: string, teamId: string) {
  await cloudRequireMember(userId, teamId, true);
  return rotateCode(teamId);
}

async function rotateCode(teamId: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
    const result = await db().from("teams").update({ join_code: code }).eq("id", teamId);
    if (result.error?.code === "23505") continue;
    check(result.error);
    return code;
  }
  throw new Error("Could not generate a team code. Try again.");
}

export async function cloudRemoveMember(userId: string, teamId: string, targetId: string) {
  const team = await cloudRequireMember(userId, teamId, targetId !== userId);
  if (team.owner_user_id === targetId) throw new Error("The team owner cannot leave or be removed.");
  // Rotate before removing access so the old MCP capability cannot be retained.
  const code = await rotateCode(teamId);
  const result = await db().from("team_members").delete().eq("team_id", teamId).eq("user_id", targetId);
  check(result.error);
  return code;
}

export async function cloudAddProject(userId: string, teamId: string, input: { name: string; repositoryUrl: string }) {
  await cloudRequireMember(userId, teamId);
  const project = makeProject(input);
  const existing = await db().from("projects").select("id").eq("id", project.id).maybeSingle();
  check(existing.error);
  if (existing.data) {
    const link = await db().from("team_projects").select("team_id").eq("project_id", project.id).maybeSingle();
    check(link.error);
    if (link.data?.team_id === teamId) throw new Error("This repository is already in your team.");
    throw new Error("This repository is already connected to another team.");
  }
  check((await db().from("projects").insert({ id: project.id, name: project.name, root: project.root, remote: project.remote, latest_git: project.latestGit, created_at: project.createdAt, updated_at: project.updatedAt })).error);
  check((await db().from("team_projects").insert({ team_id: teamId, project_id: project.id })).error);
  return project;
}

export async function cloudCreateFeature(userId: string, teamId: string, projectId: string, input: FeatureFields) {
  await requireProject(userId, teamId, projectId);
  const feature = makeFeature(projectId, input);
  check((await db().from("features").insert({ id: feature.id, project_id: projectId, payload: feature, updated_at: feature.updatedAt })).error);
  return feature;
}

export async function cloudEditFeature(userId: string, teamId: string, featureId: string, input: Parameters<typeof editFeature>[1]) {
  const row = await db().from("features").select("project_id,payload").eq("id", featureId).maybeSingle();
  check(row.error);
  if (!row.data) throw new WorkspaceError("Feature not found.", 404);
  await requireProject(userId, teamId, row.data.project_id);
  const current = row.data.payload as Feature;
  const feature = editFeature(current, input);
  const result = await db().from("features").update({ payload: feature, updated_at: feature.updatedAt }).eq("id", featureId).eq("payload->>updatedAt", current.updatedAt).select("id");
  check(result.error);
  if (!result.data?.length) throw new WorkspaceError("This feature changed while you were editing. Reload the latest version before saving.", 409);
  return feature;
}

export async function cloudReadiness() {
  try {
    const result = await db().from("teams").select("id").limit(1).abortSignal(AbortSignal.timeout(5000));
    return !result.error;
  } catch { return false; }
}

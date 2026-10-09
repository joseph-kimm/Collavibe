import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CollaborationSession, Feature, Project } from "./types.js";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface CloudSession { accessToken: string; refreshToken: string }
export interface CloudUser { id: string; name: string; email: string; createdAt: string }

function config() {
  const url = process.env.SUPABASE_URL?.trim();
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !publishable || !serviceRole) throw new Error("Supabase is not fully configured.");
  return { url, publishable, serviceRole };
}

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function client(key: string): SupabaseClient {
  const { url } = config();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function admin() { return client(config().serviceRole); }
function publicClient() { return client(config().publishable); }
function joinCode() { return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join(""); }
function fail(error: { message: string } | null | undefined) { if (error) throw new Error(error.message); }

function cloudUser(user: { id: string; email?: string; created_at: string; user_metadata?: Record<string, unknown> }): CloudUser {
  return {
    id: user.id,
    name: String(user.user_metadata?.name || user.email?.split("@")[0] || "Teammate"),
    email: user.email || "",
    createdAt: user.created_at,
  };
}

export async function cloudSignUp(input: { name: string; email: string; password: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 120) throw new Error("Name must be between 2 and 120 characters.");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  if (input.password.length < 10 || input.password.length > 256) throw new Error("Password must be at least 10 characters.");
  const created = await admin().auth.admin.createUser({ email, password: input.password, email_confirm: true, user_metadata: { name } });
  fail(created.error);
  const signedIn = await publicClient().auth.signInWithPassword({ email, password: input.password });
  fail(signedIn.error);
  if (!created.data.user || !signedIn.data.session) throw new Error("Could not create the account.");
  return { user: cloudUser(created.data.user), session: { accessToken: signedIn.data.session.access_token, refreshToken: signedIn.data.session.refresh_token } };
}

export async function cloudLogin(input: { email: string; password: string }) {
  const signedIn = await publicClient().auth.signInWithPassword({ email: input.email.trim().toLowerCase(), password: input.password });
  fail(signedIn.error);
  if (!signedIn.data.user || !signedIn.data.session) throw new Error("Email or password is incorrect.");
  return { user: cloudUser(signedIn.data.user), session: { accessToken: signedIn.data.session.access_token, refreshToken: signedIn.data.session.refresh_token } };
}

export async function cloudUserForSession(session: CloudSession | undefined) {
  if (!session?.accessToken) return undefined;
  const auth = await admin().auth.getUser(session.accessToken);
  if (auth.data.user) return { user: cloudUser(auth.data.user), session };
  if (!session.refreshToken) return undefined;
  const refreshed = await publicClient().auth.refreshSession({ refresh_token: session.refreshToken });
  if (!refreshed.data.user || !refreshed.data.session) return undefined;
  return {
    user: cloudUser(refreshed.data.user),
    session: { accessToken: refreshed.data.session.access_token, refreshToken: refreshed.data.session.refresh_token },
  };
}

export async function cloudLogout(session: CloudSession | undefined) {
  if (session?.accessToken) await admin().auth.admin.signOut(session.accessToken, "local");
}

async function membership(userId: string, teamId: string) {
  const result = await admin().from("team_members").select("team_id").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  fail(result.error);
  if (!result.data) throw new Error("You are not a member of this team.");
}

export async function cloudCreateTeam(input: { userId: string; name: string }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Team name must be between 2 and 120 characters.");
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = joinCode();
    const created = await admin().from("teams").insert({ name, join_code: code, owner_user_id: input.userId }).select().single();
    if (created.error?.code === "23505") continue;
    fail(created.error);
    const member = await admin().from("team_members").insert({ team_id: created.data.id, user_id: input.userId, role: "owner" });
    fail(member.error);
    return { id: created.data.id, name, joinCode: code, ownerUserId: input.userId, memberCount: 1, projectCount: 0, createdAt: created.data.created_at };
  }
  throw new Error("Could not generate a unique team code.");
}

export async function cloudJoinTeam(input: { userId: string; joinCode: string }) {
  const code = input.joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const found = await admin().from("teams").select("*").eq("join_code", code).maybeSingle();
  fail(found.error);
  if (!found.data) throw new Error("That team code is not valid.");
  const joined = await admin().from("team_members").upsert({ team_id: found.data.id, user_id: input.userId, role: found.data.owner_user_id === input.userId ? "owner" : "member" }, { onConflict: "team_id,user_id" });
  fail(joined.error);
  return cloudTeamSummary(found.data);
}

function cloudTeamSummary(team: any, memberCount = 0, projectCount = 0) {
  return { id: team.id, name: team.name, joinCode: team.join_code, ownerUserId: team.owner_user_id, memberCount, projectCount, createdAt: team.created_at };
}

export async function cloudDashboard(user: CloudUser, requestedTeamId?: string) {
  const memberRows = await admin().from("team_members").select("team_id").eq("user_id", user.id);
  fail(memberRows.error);
  const teamIds = (memberRows.data || []).map((row) => row.team_id);
  if (!teamIds.length) return { user, teams: [], selectedTeam: undefined, projects: [], features: [], sessions: [], deploymentMode: "cloud" as const };
  const [teamsResult, linksResult, allMembers] = await Promise.all([
    admin().from("teams").select("*").in("id", teamIds).order("created_at"),
    admin().from("team_projects").select("team_id,project_id").in("team_id", teamIds),
    admin().from("team_members").select("team_id").in("team_id", teamIds),
  ]);
  fail(teamsResult.error); fail(linksResult.error); fail(allMembers.error);
  const teams = (teamsResult.data || []).map((team) => cloudTeamSummary(
    team,
    (allMembers.data || []).filter((row) => row.team_id === team.id).length,
    (linksResult.data || []).filter((row) => row.team_id === team.id).length,
  ));
  const selectedTeam = teams.find((team) => team.id === requestedTeamId) || teams[0];
  const projectIds = (linksResult.data || []).filter((row) => row.team_id === selectedTeam.id).map((row) => row.project_id);
  if (!projectIds.length) return { user, teams, selectedTeam, projects: [], features: [], sessions: [], deploymentMode: "cloud" as const };
  const [projectsResult, featuresResult, sessionsResult] = await Promise.all([
    admin().from("projects").select("*").in("id", projectIds),
    admin().from("features").select("payload").in("project_id", projectIds),
    admin().from("collaboration_sessions").select("payload").in("project_id", projectIds),
  ]);
  fail(projectsResult.error); fail(featuresResult.error); fail(sessionsResult.error);
  return {
    user, teams, selectedTeam,
    projects: (projectsResult.data || []).map((row) => ({ id: row.id, name: row.name, root: row.root, remote: row.remote, latestGit: row.latest_git, createdAt: row.created_at, updatedAt: row.updated_at })),
    features: (featuresResult.data || []).map((row) => row.payload as Feature),
    sessions: (sessionsResult.data || []).map((row) => row.payload as CollaborationSession),
    deploymentMode: "cloud" as const,
  };
}

export async function cloudAgentSync(input: { teamCode: string; project: Project; features: Feature[]; sessions: CollaborationSession[] }) {
  const code = input.teamCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const team = await admin().from("teams").select("id").eq("join_code", code).maybeSingle();
  fail(team.error);
  if (!team.data) throw new Error("That team code is not valid.");
  const project = input.project;
  const existingLink = await admin().from("team_projects").select("team_id").eq("project_id", project.id).maybeSingle();
  fail(existingLink.error);
  if (existingLink.data && existingLink.data.team_id !== team.data.id) throw new Error("This project already belongs to another team.");
  const projectRow = { id: project.id, name: project.name, root: project.root, remote: project.remote || null, latest_git: project.latestGit, created_at: project.createdAt, updated_at: project.updatedAt };
  fail((await admin().from("projects").upsert(projectRow)).error);
  fail((await admin().from("team_projects").upsert({ team_id: team.data.id, project_id: project.id }, { onConflict: "team_id,project_id" })).error);
  if (input.features.length) fail((await admin().from("features").upsert(input.features.map((feature) => ({ id: feature.id, project_id: project.id, payload: feature, updated_at: feature.updatedAt })))).error);
  if (input.sessions.length) fail((await admin().from("collaboration_sessions").upsert(input.sessions.map((session) => ({ id: session.id, project_id: project.id, payload: { ...session, teamCode: undefined }, updated_at: session.syncedAt || session.startedAt })))).error);
  return { projectId: project.id, teamId: team.data.id, features: input.features.length, sessions: input.sessions.length };
}

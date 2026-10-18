import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin, throwSupabaseError } from "./supabase.js";
import { cloudRequireMember } from "./cloud-workspace.js";
import { WorkspaceError } from "./workspace-model.js";
import { serviceOrigin } from "./service-url.js";

export interface AgentIdentity { userId: string; teamId: string; name: string; tokenId: string; expiresAt?: number }
export const secretHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const newSecret = (prefix = "cv_") => prefix + randomBytes(32).toString("base64url");
const columns = "id,team_id,user_id,label,token_prefix,expires_at,refresh_expires_at,created_at,last_used_at,revoked_at,client_id";

export async function createAgentKey(userId: string, teamId: string, input: { label: string; days?: number }) {
  await cloudRequireMember(userId, teamId);
  const fields = z.object({ label: z.string().trim().min(2).max(120), days: z.number().int().min(1).max(90).default(30) }).parse(input);
  const count = await getSupabaseAdmin().from("agent_connections").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("user_id", userId).is("revoked_at", null).gt("expires_at", new Date().toISOString());
  throwSupabaseError(count.error);
  if ((count.count || 0) >= 20) throw new WorkspaceError("Revoke an unused connection before creating another. You can have 20 active connections per team.", 400);
  const token = newSecret();
  const result = await getSupabaseAdmin().from("agent_connections").insert({ user_id: userId, team_id: teamId, label: fields.label, token_hash: secretHash(token), token_prefix: token.slice(0, 9), resource: serviceOrigin() + "/mcp", expires_at: new Date(Date.now() + fields.days * 86400000).toISOString() }).select(columns).single();
  throwSupabaseError(result.error);
  return { connection: result.data, token };
}

export async function listAgentConnections(userId: string, teamId: string) {
  await cloudRequireMember(userId, teamId);
  const result = await getSupabaseAdmin().from("agent_connections").select(columns).eq("user_id", userId).eq("team_id", teamId).order("created_at", { ascending: false });
  throwSupabaseError(result.error);
  return result.data || [];
}

export async function revokeAgentConnection(userId: string, teamId: string, id: string) {
  await cloudRequireMember(userId, teamId);
  const result = await getSupabaseAdmin().from("agent_connections").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).eq("team_id", teamId).select("id");
  throwSupabaseError(result.error);
  if (!result.data?.length) throw new WorkspaceError("Connection not found.", 404);
}

export async function verifyAgentKey(token: string): Promise<AgentIdentity> {
  if (!/^cv_[A-Za-z0-9_-]{43}$/.test(token)) throw new WorkspaceError("Connect your agent or create a personal agent key in Collavibe.", 401);
  const result = await getSupabaseAdmin().from("agent_connections").select("id,user_id,team_id,expires_at,revoked_at,last_used_at,resource").eq("token_hash", secretHash(token)).maybeSingle();
  throwSupabaseError(result.error);
  const record = result.data;
  if (!record || record.resource !== serviceOrigin() + "/mcp" || record.revoked_at || new Date(record.expires_at).getTime() <= Date.now()) throw new WorkspaceError("This agent connection expired or was revoked. Reconnect in Collavibe.", 401);
  await cloudRequireMember(record.user_id, record.team_id);
  const profile = await getSupabaseAdmin().from("profiles").select("name").eq("id", record.user_id).single();
  throwSupabaseError(profile.error);
  if (!record.last_used_at || Date.now() - new Date(record.last_used_at).getTime() > 60000) {
    throwSupabaseError((await getSupabaseAdmin().from("agent_connections").update({ last_used_at: new Date().toISOString() }).eq("id", record.id)).error);
  }
  return { userId: record.user_id, teamId: record.team_id, name: profile.data!.name, tokenId: record.id, expiresAt: Math.floor(new Date(record.expires_at).getTime() / 1000) };
}

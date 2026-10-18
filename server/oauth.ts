import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidScopeError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Response } from "express";
import { getSupabaseAdmin, throwSupabaseError } from "../src/supabase.js";
import { cloudRequireMember } from "../src/cloud-workspace.js";
import { newSecret, secretHash, verifyAgentKey } from "../src/agent-access.js";
import { WorkspaceError } from "../src/workspace-model.js";
import { serviceOrigin } from "../src/service-url.js";
export { serviceOrigin } from "../src/service-url.js";

const db = getSupabaseAdmin;
const check = throwSupabaseError;
const scope = "collavibe:work";
export const OAUTH_BROWSER_COOKIE = "collavibe_oauth_browser";
const resourceUrl = () => serviceOrigin() + "/mcp";
function validateResource(resource?: URL) {
  if (resource && resource.href !== resourceUrl()) throw new InvalidRequestError("This authorization is only valid for the Collavibe MCP resource.");
}
function validateScopes(scopes?: string[]) {
  if (scopes?.some((value) => value !== scope)) throw new InvalidScopeError("Only collavibe:work is supported.");
}
function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const key = Buffer.from(secretHash(process.env.SUPABASE_SERVICE_ROLE_KEY!), "hex");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64url");
}
function decryptSecret(value: string) {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(secretHash(process.env.SUPABASE_SERVICE_ROLE_KEY!), "hex"), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8");
}
function validRedirect(value: string) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)));
  } catch { return false; }
}
interface Grant { clientId: string; redirectUri: string; codeChallenge: string; userId: string; teamId: string; label: string; resource: string }

export async function authorizationRequest(id: string, browserSecret: string | undefined) {
  if (!browserSecret) throw new WorkspaceError("Open the connection link from your coding agent again.", 400);
  const found = await db().from("oauth_requests").select("payload,expires_at,consumed_at").eq("id", id).eq("browser_hash", secretHash(browserSecret)).maybeSingle();
  check(found.error);
  if (!found.data || found.data.consumed_at || new Date(found.data.expires_at).getTime() <= Date.now()) throw new WorkspaceError("This connection request expired or was already used. Start again from your agent.", 400);
  return found.data.payload as { clientId: string; clientName: string; redirectUri: string; codeChallenge: string; state?: string; resource: string };
}

export async function approveAuthorization(userId: string, requestId: string, browserSecret: string | undefined, teamId: string, allow: boolean) {
  const request = await authorizationRequest(requestId, browserSecret);
  if (allow) await cloudRequireMember(userId, teamId);
  const consumed = await db().from("oauth_requests").update({ consumed_at: new Date().toISOString() }).eq("id", requestId).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("id");
  check(consumed.error);
  if (!consumed.data?.length) throw new WorkspaceError("This request was already used. Start again from your agent.", 409);
  const redirect = new URL(request.redirectUri);
  if (request.state) redirect.searchParams.set("state", request.state);
  if (!allow) { redirect.searchParams.set("error", "access_denied"); return redirect.href; }
  const code = newSecret("code_");
  const grant: Grant = { clientId: request.clientId, redirectUri: request.redirectUri, codeChallenge: request.codeChallenge, userId, teamId, label: request.clientName, resource: request.resource };
  check((await db().from("oauth_codes").insert({ code_hash: secretHash(code), payload: grant, expires_at: new Date(Date.now() + 300000).toISOString() })).error);
  redirect.searchParams.set("code", code);
  return redirect.href;
}

export class CollavibeOAuthProvider implements OAuthServerProvider {
  clientsStore = {
    async getClient(id: string): Promise<OAuthClientInformationFull | undefined> {
      if (id.length > 300) return undefined;
      const found = await db().from("oauth_clients").select("payload,secret_ciphertext").eq("id", id).maybeSingle();
      check(found.error);
      if (!found.data) return undefined;
      const client = found.data.payload as OAuthClientInformationFull;
      if (found.data.secret_ciphertext) client.client_secret = decryptSecret(found.data.secret_ciphertext);
      return client;
    },
    async registerClient(input: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">): Promise<OAuthClientInformationFull> {
      if (!input.redirect_uris.length || input.redirect_uris.length > 10 || input.redirect_uris.some((uri) => !validRedirect(uri))) throw new InvalidClientMetadataError("Use HTTPS redirect URLs or HTTP loopback URLs for native apps.");
      if (input.token_endpoint_auth_method && !["none", "client_secret_post", "client_secret_basic"].includes(input.token_endpoint_auth_method)) throw new InvalidClientMetadataError("Unsupported token authentication method.");
      const client: OAuthClientInformationFull = { ...input, client_name: (input.client_name || "Coding agent").slice(0, 120), client_id: randomUUID(), client_id_issued_at: Math.floor(Date.now() / 1000) };
      check((await db().from("oauth_clients").insert({ id: client.client_id, payload: { ...client, client_secret: undefined }, secret_ciphertext: client.client_secret ? encryptSecret(client.client_secret) : null })).error);
      return client;
    },
  };

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    validateResource(params.resource); validateScopes(params.scopes);
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new InvalidRequestError("Use an S256 PKCE challenge.");
    if ((params.state?.length || 0) > 2000) throw new InvalidRequestError("State is too long.");
    const browserSecret = newSecret("browser_");
    const pending = await db().from("oauth_requests").insert({ browser_hash: secretHash(browserSecret), payload: { clientId: client.client_id, clientName: client.client_name || "Coding agent", redirectUri: params.redirectUri, codeChallenge: params.codeChallenge, state: params.state, resource: resourceUrl() }, expires_at: new Date(Date.now() + 600000).toISOString() }).select("id").single();
    check(pending.error);
    res.cookie(OAUTH_BROWSER_COOKIE, browserSecret, { httpOnly: true, secure: serviceOrigin().startsWith("https:"), sameSite: "lax", path: "/", maxAge: 600000 });
    res.redirect(302, serviceOrigin() + "/?authorize=" + pending.data!.id);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string) {
    const grant = await this.readCode(client, code);
    return grant.codeChallenge;
  }
  private async readCode(client: OAuthClientInformationFull, code: string) {
    if (code.length > 200) throw new InvalidGrantError("Invalid authorization code.");
    const found = await db().from("oauth_codes").select("payload,expires_at").eq("code_hash", secretHash(code)).maybeSingle();
    check(found.error);
    if (!found.data || new Date(found.data.expires_at).getTime() <= Date.now() || found.data.payload.clientId !== client.client_id) throw new InvalidGrantError("Authorization code expired, was used, or belongs to another client.");
    return found.data.payload as Grant;
  }
  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, verifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    validateResource(resource);
    const grant = await this.readCode(client, code);
    if (redirectUri !== grant.redirectUri) throw new InvalidGrantError("Redirect URI does not match.");
    // The SDK validates S256 before calling this method, then omits the verifier.
    // If another caller supplies one, validate it here as well.
    if (verifier !== undefined) {
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new InvalidGrantError("Invalid PKCE verifier.");
      const challenge = Buffer.from(secretHash(verifier), "hex").toString("base64url");
      if (challenge.length !== grant.codeChallenge.length || !timingSafeEqual(Buffer.from(challenge), Buffer.from(grant.codeChallenge))) throw new InvalidGrantError("PKCE verifier does not match.");
    }
    await cloudRequireMember(grant.userId, grant.teamId);
    const consumed = await db().rpc("consume_oauth_code", { request_hash: secretHash(code) });
    check(consumed.error);
    if (!consumed.data) throw new InvalidGrantError("This authorization code has already been used.");
    const token = newSecret(), refresh = newSecret("cvr_");
    check((await db().from("agent_connections").insert({ user_id: grant.userId, team_id: grant.teamId, label: grant.label, client_id: client.client_id, resource: grant.resource, token_hash: secretHash(token), token_prefix: token.slice(0, 9), expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_hash: secretHash(refresh), refresh_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() })).error);
    return { access_token: token, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope };
  }
  async exchangeRefreshToken(client: OAuthClientInformationFull, token: string, scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    validateResource(resource); validateScopes(scopes);
    if (!/^cvr_[A-Za-z0-9_-]{43}$/.test(token)) throw new InvalidGrantError("Invalid refresh token.");
    const found = await db().from("agent_connections").select("id,user_id,team_id,refresh_expires_at,revoked_at,resource").eq("refresh_hash", secretHash(token)).eq("client_id", client.client_id).maybeSingle();
    check(found.error);
    const row = found.data;
    if (!row || row.resource !== resourceUrl() || row.revoked_at || !row.refresh_expires_at || new Date(row.refresh_expires_at).getTime() <= Date.now()) throw new InvalidGrantError("Connection expired or was revoked. Reconnect from your agent.");
    await cloudRequireMember(row.user_id, row.team_id);
    const access = newSecret(), refresh = newSecret("cvr_");
    const changed = await db().from("agent_connections").update({ token_hash: secretHash(access), token_prefix: access.slice(0, 9), refresh_hash: secretHash(refresh), expires_at: new Date(Date.now() + 3600000).toISOString() }).eq("id", row.id).eq("refresh_hash", secretHash(token)).is("revoked_at", null).select("id");
    check(changed.error);
    if (!changed.data?.length) throw new InvalidGrantError("Refresh token was already used.");
    return { access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope };
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const actor = await verifyAgentKey(token);
      return { token, clientId: actor.tokenId, scopes: [scope], expiresAt: actor.expiresAt, resource: new URL(resourceUrl()), extra: { ...actor } };
    } catch (error) {
      if (error instanceof WorkspaceError) throw new InvalidTokenError("Agent access expired, was revoked, or no longer belongs to this team.");
      throw error;
    }
  }
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    const hash = secretHash(request.token);
    const column = request.token.startsWith("cvr_") ? "refresh_hash" : "token_hash";
    check((await db().from("agent_connections").update({ revoked_at: new Date().toISOString() }).eq("client_id", client.client_id).eq(column, hash)).error);
  }
}

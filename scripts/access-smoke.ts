import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getSupabaseAdmin, throwSupabaseError } from "../src/supabase.js";

const base = (process.env.COLLAVIBE_SMOKE_URL || "http://127.0.0.1:4321").replace(/\/$/, "");
const run = randomUUID();
const db = getSupabaseAdmin();
const users: string[] = [], teams: string[] = [], projects: string[] = [], clients: string[] = [], requests: string[] = [];
const liveClients: Client[] = [];
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function api(path: string, cookie = "", method = "GET", body?: unknown) {
  return fetch(base + path, { method, headers: { cookie, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
}
async function body(response: Response) { const value = await response.json(); assert(response.ok, `Request failed (${response.status}): ${value.error || "unknown error"}`); return value; }
async function account(label: string) {
  const email = `collavibe-access-${label}-${run}@example.com`, password = "Access-" + randomUUID();
  const fixture = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Access Test " + label } }); throwSupabaseError(fixture.error);
  users.push(fixture.data.user!.id);
  const response = await api("/api/auth/login", "", "POST", { email, password });
  const result = await body(response);
  return { id: result.user.id as string, email, password, cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
class TestOAuthClient implements OAuthClientProvider {
  info?: OAuthClientInformationMixed; saved?: OAuthTokens; verifier = ""; authorizeUrl?: URL;
  readonly expectedState = randomUUID();
  constructor(readonly confidential = false) {}
  get redirectUrl() { return "http://127.0.0.1:59399/callback"; }
  get clientMetadata() { return { client_name: "Collavibe access smoke " + run, redirect_uris: [this.redirectUrl], token_endpoint_auth_method: this.confidential ? "client_secret_post" as const : "none" as const, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }; }
  state() { return this.expectedState; }
  clientInformation() { return this.info; }
  saveClientInformation(value: OAuthClientInformationMixed) { this.info = value; clients.push(value.client_id); }
  tokens() { return this.saved; }
  saveTokens(value: OAuthTokens) { this.saved = value; }
  redirectToAuthorization(value: URL) { this.authorizeUrl = value; }
  saveCodeVerifier(value: string) { this.verifier = value; }
  codeVerifier() { return this.verifier; }
}
async function authorize(provider: TestOAuthClient, cookie: string, teamId: string, allow = true) {
  assert(await auth(provider, { serverUrl: base + "/mcp", scope: "collavibe:work", resourceMetadataUrl: new URL(base + "/.well-known/oauth-protected-resource/mcp") }) === "REDIRECT", "SDK did not begin OAuth discovery and registration.");
  assert(provider.authorizeUrl, "SDK did not provide an authorization URL.");
  const response = await fetch(provider.authorizeUrl, { redirect: "manual" });
  assert(response.status === 302, "Authorization did not open browser consent.");
  const location = new URL(response.headers.get("location")!);
  const id = location.searchParams.get("authorize")!; requests.push(id);
  const browserCookie = response.headers.get("set-cookie")!.split(";")[0];
  const combined = cookie + "; " + browserCookie;
  assert((await api("/api/oauth/request/" + id, cookie)).status === 400, "An authorization request was not bound to its browser.");
  const pending = await body(await api("/api/oauth/request/" + id, combined));
  assert(pending.redirectOrigin === "http://127.0.0.1:59399", "Consent hid the destination.");
  const approved = await body(await api("/api/oauth/approve", combined, "POST", { requestId: id, teamId, allow }));
  const callback = new URL(approved.redirect);
  assert(callback.searchParams.get("state") === provider.expectedState, "OAuth state was lost.");
  assert((await api("/api/oauth/approve", combined, "POST", { requestId: id, teamId, allow })).status === 400, "Consent request was reusable.");
  if (!allow) { assert(callback.searchParams.get("error") === "access_denied", "Denial did not return access_denied."); return; }
  const code = callback.searchParams.get("code")!;
  const tokenParams = (verifier: string, resource = base + "/mcp") => new URLSearchParams({ grant_type: "authorization_code", client_id: provider.info!.client_id, ...(provider.info!.client_secret ? { client_secret: provider.info!.client_secret } : {}), code, code_verifier: verifier, redirect_uri: provider.redirectUrl, resource });
  const tokenRequest = (params: URLSearchParams) => fetch(base + "/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  assert((await tokenRequest(tokenParams("x".repeat(43)))).status === 400, "Wrong PKCE verifier was accepted.");
  assert((await tokenRequest(tokenParams(provider.verifier, "https://other.example/mcp"))).status === 400, "A token could be issued for a different resource.");
  assert(await auth(provider, { serverUrl: base + "/mcp", authorizationCode: code, resourceMetadataUrl: new URL(base + "/.well-known/oauth-protected-resource/mcp") }) === "AUTHORIZED", "Official SDK could not complete OAuth.");
  assert(provider.saved?.access_token && provider.saved.refresh_token, "OAuth did not issue access and refresh tokens.");
  assert((await tokenRequest(tokenParams(provider.verifier))).status === 400, "Authorization code could be replayed.");
}
async function connect(token: string) {
  const client = new Client({ name: "access-smoke", version: "1" }); liveClients.push(client);
  client.onerror = (error) => console.error("MCP client error:", error.message);
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { authorization: "Bearer " + token } }, fetch: process.env.COLLAVIBE_SMOKE_TRACE ? async (input, init) => {
    const request = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    console.log("MCP send:", request.id, request.method, request.params?.name || "");
    const response = await fetch(input, init);
    if (response.headers.get("content-type")?.includes("application/json")) {
      const result = await response.clone().json();
      console.log("MCP response:", response.status, "id", result.id, "toolError", result.result?.isError, "rpcError", result.error?.code);
    }
    return response;
  } : undefined }));
  return client;
}
async function mcpStatus(token: string) {
  return (await fetch(base + "/mcp", { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).status;
}
const git = { branch: "feature/access-smoke", head: "a".repeat(40), dirty: false, workingFiles: [], branches: [], recentCommits: [], trackedFiles: ["README.md"] };
try {
  const owner = await account("owner"), member = await account("member");
  const team = (await body(await api("/api/teams", owner.cookie, "POST", { name: "Access Smoke " + run }))).team;
  teams.push(team.id);
  await body(await api("/api/teams/join", member.cookie, "POST", { joinCode: team.joinCode }));
  const otherTeam = (await body(await api("/api/teams", member.cookie, "POST", { name: "Other Access Smoke " + run }))).team; teams.push(otherTeam.id);
  const key = (await body(await api(`/api/teams/${team.id}/agent-connections`, owner.cookie, "POST", { label: "Owner test key" })));
  const memberKey = (await body(await api(`/api/teams/${team.id}/agent-connections`, member.cookie, "POST", { label: "Member test key" })));
  const preflight = await fetch(base + "/mcp", { method: "OPTIONS", headers: { origin: "https://claude.ai", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
  assert(preflight.status === 204 && preflight.headers.get("access-control-allow-origin") === "https://claude.ai", "Trusted browser client cannot preflight MCP.");
  const foreign = await fetch(base + "/mcp", { method: "OPTIONS", headers: { origin: "https://attacker.example" } });
  assert(foreign.status === 403, "Untrusted browser origin was accepted.");
  throwSupabaseError((await db.from("agent_connections").update({ resource: "https://other.example/mcp" }).eq("id", key.connection.id)).error);
  assert(await mcpStatus(key.token) === 401, "A credential for another resource authorized this MCP endpoint.");
  throwSupabaseError((await db.from("agent_connections").update({ resource: base + "/mcp" }).eq("id", key.connection.id)).error);
  assert((await api(`/api/teams/${team.id}/agent-connections/${key.connection.id}`, member.cookie, "DELETE")).status === 404, "Member could revoke another user's connection.");
  const unsafe = await api("/register", "", "POST", { client_name: "Unsafe", redirect_uris: ["http://attacker.example/callback"], token_endpoint_auth_method: "none" });
  assert(unsafe.status === 400, "Non-loopback insecure redirect was accepted.");
  console.log("Access smoke: accounts, team membership and key creation passed.");
  const oauth = new TestOAuthClient(); await authorize(oauth, owner.cookie, team.id);
  console.log("Access smoke: public-client OAuth passed.");
  const confidential = new TestOAuthClient(true); await authorize(confidential, owner.cookie, team.id);
  await authorize(new TestOAuthClient(), owner.cookie, team.id, false);
  console.log("Access smoke: confidential-client OAuth and denial passed.");
  const client = await connect(oauth.saved!.access_token), teammate = await connect(memberKey.token);
  const repo = `https://github.com/collavibe-access/${run}`;
  const planned = (await body(await api(`/api/teams/${team.id}/projects`, owner.cookie, "POST", { name: "Access test repository", repositoryUrl: repo }))).project; projects.push(planned.id);
  const second = (await body(await api(`/api/teams/${otherTeam.id}/projects`, member.cookie, "POST", { name: "Independent copy", repositoryUrl: repo }))).project; projects.push(second.id);
  assert(planned.id !== second.id, "Independent teams cannot track the same public repository.");
  const privateFeature = (await body(await api(`/api/teams/${otherTeam.id}/projects/${second.id}/features`, member.cookie, "POST", { title: "Private other-team feature" }))).feature;
  const privateSessionId = "session_" + randomUUID();
  throwSupabaseError((await db.from("collaboration_sessions").insert({ id: privateSessionId, project_id: second.id, payload: { id: privateSessionId, projectId: second.id, participant: "Private teammate", userId: member.id, repoPath: repo, status: "choosing", startSnapshot: { ...git, root: repo, capturedAt: new Date().toISOString() }, startedAt: new Date().toISOString() } })).error);
  const publicDb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const ownerAuth = await publicDb.auth.signInWithPassword({ email: owner.email, password: owner.password }); throwSupabaseError(ownerAuth.error);
  const leaked = await publicDb.from("features").select("id").eq("id", privateFeature.id); throwSupabaseError(leaked.error);
  assert(leaked.data?.length === 0, "Database RLS leaked another team's feature.");
  const directSecrets = await publicDb.from("agent_connections").select("id");
  assert(directSecrets.error, "Authenticated clients can read the credential table directly.");
  console.log("Access smoke: direct database RLS and credential-table isolation passed.");
  const feature = (await body(await api(`/api/teams/${team.id}/projects/${planned.id}/features`, owner.cookie, "POST", { title: "Concurrent feature claim", checklist: [{ text: "Verify one winner" }] }))).feature;
  const start = async (agent: Client) => {
    const result = await agent.callTool({ name: "start_collaboration_session", arguments: { project: { key: repo, name: "Agent label", git } } });
    assert(!result.isError, "Agent session failed to start.");
    return (result.structuredContent as any).started.session;
  };
  const one = await start(client), two = await start(teammate);
  console.log("Access smoke: both account-bound MCP sessions started.");
  assert(one.userId === owner.id && one.participant === "Access Test owner", "Session identity was not account-bound.");
  assert((await teammate.callTool({ name: "get_sync_template", arguments: { sessionId: one.id } })).isError === true, "A member could hijack another member's session.");
  const claims = await Promise.all([client.callTool({ name: "choose_work_item", arguments: { sessionId: one.id, featureId: feature.id } }), teammate.callTool({ name: "choose_work_item", arguments: { sessionId: two.id, featureId: feature.id } })]);
  console.log("Access smoke: concurrent claims returned.");
  assert(claims.filter((result) => !result.isError).length === 1, "Concurrent claims did not produce exactly one winner.");
  const winner = claims[0].isError ? teammate : client, session = claims[0].isError ? two : one;
  const syncArgs = { sessionId: session.id, summary: "Verified atomic concurrency in the access smoke test.", workCompleted: ["Tested claim ownership"], decisions: [], blockers: [], nextSteps: [], changedFiles: ["README.md"], endGit: git, completedChecklistItemIds: [feature.checklist[0].id], featureStatus: "review" };
  const invalid = await winner.callTool({ name: "sync_collaboration_session", arguments: { ...syncArgs, completedChecklistItemIds: ["check_unknown_identifier"] } });
  assert(invalid.isError === true, "Unknown checklist IDs were accepted.");
  const syncs = await Promise.all([winner.callTool({ name: "sync_collaboration_session", arguments: syncArgs }), winner.callTool({ name: "sync_collaboration_session", arguments: syncArgs })]);
  console.log("Access smoke: concurrent syncs returned.");
  assert(syncs.filter((result) => !result.isError).length === 1, "Concurrent syncs were not atomic.");
  const records = (await body(await api(`/api/teams/${team.id}/agent-connections`, owner.cookie))).connections;
  assert(!JSON.stringify(records).includes(oauth.saved!.access_token) && !JSON.stringify(records).includes("token_hash") && !JSON.stringify(records).includes("refresh_hash"), "Connection list exposed credential material.");
  const sessionsRls = await publicDb.from("collaboration_sessions").select("id").eq("id", privateSessionId); throwSupabaseError(sessionsRls.error);
  assert(sessionsRls.data?.length === 0, "Database RLS leaked another team's session.");
  const oldRefresh = oauth.saved!.refresh_token!;
  const refreshed = await body(await apiTokenRefresh(oauth.info!, oldRefresh));
  assert(refreshed.refresh_token !== oldRefresh && refreshed.access_token !== oauth.saved!.access_token, "Refresh did not rotate credentials.");
  assert((await apiTokenRefresh(oauth.info!, oldRefresh)).status === 400, "Old refresh token remained usable.");
  assert(await mcpStatus(oauth.saved!.access_token) === 401, "Old access token remained usable after refresh.");
  assert(await mcpStatus(refreshed.access_token) === 200, "Refreshed token did not authorize MCP.");
  const connection = (await body(await api(`/api/teams/${team.id}/agent-connections`, owner.cookie))).connections.find((row: any) => row.client_id === oauth.info!.client_id);
  assert((await api(`/api/teams/${team.id}/agent-connections/${connection.id}`, owner.cookie, "DELETE")).ok, "Connection revocation request failed.");
  assert(await mcpStatus(refreshed.access_token) === 401, "Revocation did not invalidate OAuth access.");
  const revokedRefresh = await apiTokenRefresh(oauth.info!, refreshed.refresh_token);
  assert(revokedRefresh.status === 400, `Expected invalid-grant after revocation; got HTTP ${revokedRefresh.status}. A 429 means the test exhausted the configured rate budget.`);
  assert((await api(`/api/teams/${team.id}/members/${member.id}`, owner.cookie, "DELETE")).ok, "Member removal request failed.");
  assert(await mcpStatus(memberKey.token) === 401, "Removed member retained agent access.");
  assert(await mcpStatus(key.token) === 200, "Member removal broke the owner's agent connection.");
  const outsider = await api(`/api/teams/${team.id}/agent-connections`, member.cookie);
  assert(outsider.status === 403, "Removed member retained connection-management access.");
  // Database persistence, not a warm Vercel process, enforces rate budgets.
  const bucket = "smoke-" + run;
  for (let i = 0; i < 3; i++) {
    const result = await db.rpc("consume_request_limit", { bucket, budget: 2, seconds: 60 }); throwSupabaseError(result.error);
    assert(result.data === (i < 2), "Distributed request limit failed.");
  }
  throwSupabaseError((await db.from("request_limits").delete().eq("key", bucket)).error);
  console.log(JSON.stringify({ ok: true, endpoint: base, verified: ["official_sdk_oauth_discovery", "dynamic_registration", "public_and_confidential_clients", "browser_bound_consent", "consent_denial", "pkce", "resource_binding", "code_replay_rejection", "database_rls_isolation", "account_bound_sessions", "cross_session_isolation", "same_repo_independent_teams", "concurrent_claim_one_winner", "concurrent_sync_one_winner", "invalid_checklist_rollback", "refresh_rotation", "revocation", "member_removal", "connection_secret_redaction", "distributed_rate_limits"] }, null, 2));
} finally {
  await Promise.all(liveClients.map((client) => client.close().catch(() => undefined)));
  for (const id of projects) { throwSupabaseError((await db.from("projects").delete().eq("id", id)).error); }
  for (const id of teams) { throwSupabaseError((await db.from("teams").delete().eq("id", id)).error); }
  for (const id of users) { throwSupabaseError((await db.auth.admin.deleteUser(id)).error); }
  for (const id of requests) { throwSupabaseError((await db.from("oauth_requests").delete().eq("id", id)).error); }
  for (const id of new Set(clients)) {
    const codes = await db.from("oauth_codes").delete().eq("payload->>clientId", id); throwSupabaseError(codes.error);
    throwSupabaseError((await db.from("oauth_clients").delete().eq("id", id)).error);
  }
  console.log("Disposable access-smoke records removed.");
}
function apiTokenRefresh(client: OAuthClientInformationMixed, token: string) {
  return fetch(base + "/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.client_id, ...(client.client_secret ? { client_secret: client.client_secret } : {}), refresh_token: token, resource: base + "/mcp" }) });
}

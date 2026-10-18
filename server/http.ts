import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCollavibeMcpServer } from "./mcp.js";
import { createHostedCollavibeMcpServer } from "./hosted-mcp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { CollavibeOAuthProvider, OAUTH_BROWSER_COOKIE, serviceOrigin, authorizationRequest, approveAuthorization } from "./oauth.js";
import { createAgentKey, listAgentConnections, revokeAgentConnection, type AgentIdentity } from "../src/agent-access.js";
import { requestLimit } from "./request-limits.js";
import { addProjectToTeam, createTeam, getDashboard, getUserForToken, joinTeam, loginUser, logoutUser, signUpUser } from "../src/store.js";
import { withoutInternalGitEvidence } from "../src/public.js";
import { cloudCreateTeam, cloudDashboard, cloudJoinTeam, cloudLogin, cloudLogout, cloudSignUp, cloudUserForSession, isSupabaseConfigured, type CloudSession } from "../src/supabase.js";
import type { NextFunction, Request, Response } from "express";
import { addRemoteProject, createPlannedFeature, listTeamMembers, removeTeamMember, rotateTeamCode, updatePlannedFeature, updateTeamName } from "../src/store.js";
import { cloudAddProject, cloudCreateFeature, cloudEditFeature, cloudMembers, cloudReadiness, cloudRemoveMember, cloudRotateCode, cloudUpdateTeam } from "../src/cloud-workspace.js";
import { featureFields, featurePatchSchema, WorkspaceError } from "../src/workspace-model.js";

export const app = express();
app.disable("x-powered-by");
if (process.env.COLLAVIBE_QA_TRACE === "1") app.use((req, res, next) => {
  const started = Date.now();
  const pathname = req.path;
  res.on("finish", () => console.log(JSON.stringify({ method: req.method, path: pathname, status: res.statusCode, durationMs: Date.now() - started })));
  next();
});
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path === "/mcp" && req.headers.origin) {
    // Browser MCP clients use bearer auth, never browser session cookies here.
    // Keep the unauthenticated local-development transport same-origin only.
    const allowed = isSupabaseConfigured()
      ? [serviceOrigin(), "https://chatgpt.com", "https://claude.ai", ...(process.env.COLLAVIBE_MCP_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)]
      : [`${req.protocol}://${req.get("host")}`];
    if (!allowed.includes(req.headers.origin)) return void res.status(403).json({ error: "Untrusted browser origin." });
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.vary("Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID");
    res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Session-Id");
  }
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
    // Browser writes require the caller's own origin; native MCP calls use /mcp.
    const origin = req.headers.origin;
    if (origin && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      try { if (new URL(origin).host !== req.get("host")) return void res.status(403).json({ error: "This request must come from Collavibe." }); }
      catch { return void res.status(403).json({ error: "Invalid request origin." }); }
    }
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.options("/mcp", (_req, res) => res.status(204).end());

const AUTH_COOKIE = "collavibe_session";
const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 30, path: "/" };

function cookie(req: Request, name: string) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) { try { return decodeURIComponent(value.join("=")); } catch { return undefined; } }
  }
  return undefined;
}

type AuthenticatedRequest = Request & { collavibeUser?: { id: string; name: string; email: string; createdAt: string } };

function cloudSession(req: Request): CloudSession | undefined {
  try {
    const value = cookie(req, AUTH_COOKIE);
    return value ? JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CloudSession : undefined;
  } catch {
    return undefined;
  }
}

function setCloudSession(res: Response, session: CloudSession) {
  res.cookie(AUTH_COOKIE, Buffer.from(JSON.stringify(session)).toString("base64url"), cookieOptions);
}

async function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (isSupabaseConfigured()) {
      const result = await cloudUserForSession(cloudSession(req));
      if (!result) return void res.status(401).json({ error: "Sign in to continue." });
      req.collavibeUser = result.user;
      setCloudSession(res, result.session);
      return next();
    }
    const user = await getUserForToken(cookie(req, AUTH_COOKIE));
    if (!user) return void res.status(401).json({ error: "Sign in to continue." });
    req.collavibeUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

const api = (handler: (req: AuthenticatedRequest, res: Response) => Promise<void>) => async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

app.post("/api/auth/signup", requestLimit("signup", 20, 3600), api(async (req, res) => {
  if (isSupabaseConfigured()) {
    const result = await cloudSignUp({ name: String(req.body?.name || ""), email: String(req.body?.email || ""), password: String(req.body?.password || "") });
    setCloudSession(res, result.session);
    res.status(201).json({ user: result.user });
    return;
  }
  const result = await signUpUser({ name: String(req.body?.name || ""), email: String(req.body?.email || ""), password: String(req.body?.password || "") });
  res.cookie(AUTH_COOKIE, result.token, cookieOptions).status(201).json({ user: result.user });
}));

app.post("/api/auth/login", requestLimit("login", 30, 900), api(async (req, res) => {
  if (isSupabaseConfigured()) {
    const result = await cloudLogin({ email: String(req.body?.email || ""), password: String(req.body?.password || "") });
    setCloudSession(res, result.session);
    res.json({ user: result.user });
    return;
  }
  const result = await loginUser({ email: String(req.body?.email || ""), password: String(req.body?.password || "") });
  res.cookie(AUTH_COOKIE, result.token, cookieOptions).json({ user: result.user });
}));

app.post("/api/auth/logout", api(async (req, res) => {
  if (isSupabaseConfigured()) {
    await cloudLogout(cloudSession(req));
    res.clearCookie(AUTH_COOKIE, { path: "/" }).status(204).end();
    return;
  }
  const token = cookie(req, AUTH_COOKIE);
  if (token) await logoutUser(token);
  res.clearCookie(AUTH_COOKIE, { path: "/" }).status(204).end();
}));

app.get("/api/auth/status", api(async (req, res) => {
  if (isSupabaseConfigured()) {
    const result = await cloudUserForSession(cloudSession(req));
    if (!result) {
      res.json({ authenticated: false });
      return;
    }
    setCloudSession(res, result.session);
    res.json({ authenticated: true });
    return;
  }
  const user = await getUserForToken(cookie(req, AUTH_COOKIE));
  res.json({ authenticated: Boolean(user) });
}));

app.get("/api/dashboard", requireUser, api(async (req, res) => {
  const dashboard = isSupabaseConfigured()
    ? await cloudDashboard(req.collavibeUser!, typeof req.query.teamId === "string" ? req.query.teamId : undefined)
    : await getDashboard(req.collavibeUser!.id, typeof req.query.teamId === "string" ? req.query.teamId : undefined);
  res.json(withoutInternalGitEvidence(dashboard));
}));

app.get("/api/state", requireUser, api(async (req, res) => {
  const dashboard = isSupabaseConfigured()
    ? await cloudDashboard(req.collavibeUser!, typeof req.query.teamId === "string" ? req.query.teamId : undefined)
    : await getDashboard(req.collavibeUser!.id, typeof req.query.teamId === "string" ? req.query.teamId : undefined);
  res.json(withoutInternalGitEvidence(dashboard));
}));

app.use("/api/teams", (req, res, next) => ["POST", "PATCH", "DELETE"].includes(req.method) ? requestLimit("workspace-writes", 120, 60)(req, res, next) : next());

app.post("/api/teams", requireUser, api(async (req, res) => {
  const team = isSupabaseConfigured()
    ? await cloudCreateTeam({ userId: req.collavibeUser!.id, name: String(req.body?.name || "") })
    : await createTeam({ userId: req.collavibeUser!.id, name: String(req.body?.name || ""), repoPath: typeof req.body?.repoPath === "string" ? req.body.repoPath : undefined });
  res.status(201).json({ team });
}));

app.post("/api/teams/join", requireUser, requestLimit("join-team", 30, 900), api(async (req, res) => {
  const team = isSupabaseConfigured()
    ? await cloudJoinTeam({ userId: req.collavibeUser!.id, joinCode: String(req.body?.joinCode || "") })
    : await joinTeam({ userId: req.collavibeUser!.id, joinCode: String(req.body?.joinCode || "") });
  res.json({ team });
}));

app.post("/api/teams/:teamId/projects", requireUser, api(async (req, res) => {
  const userId = req.collavibeUser!.id;
  const teamId = String(req.params.teamId);
  if (!isSupabaseConfigured() && req.body?.repoPath) {
    const project = await addProjectToTeam({ userId, teamId, repoPath: String(req.body.repoPath) });
    res.status(201).json({ project: withoutInternalGitEvidence(project) });
    return;
  }
  const input = z.object({ name: z.string().trim().min(2).max(200), repositoryUrl: z.string().trim().min(8).max(2048) }).parse(req.body);
  const project = isSupabaseConfigured() ? await cloudAddProject(userId, teamId, input) : await addRemoteProject(userId, teamId, input);
  res.status(201).json({ project: withoutInternalGitEvidence(project) });
}));

app.get("/api/teams/:teamId/members", requireUser, api(async (req, res) => {
  const members = isSupabaseConfigured() ? await cloudMembers(req.collavibeUser!.id, String(req.params.teamId)) : await listTeamMembers(req.collavibeUser!.id, String(req.params.teamId));
  res.json({ members });
}));

app.patch("/api/teams/:teamId", requireUser, api(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(2).max(120) }).parse(req.body);
  if (isSupabaseConfigured()) await cloudUpdateTeam(req.collavibeUser!.id, String(req.params.teamId), name);
  else await updateTeamName(req.collavibeUser!.id, String(req.params.teamId), name);
  res.status(204).end();
}));

app.post("/api/teams/:teamId/rotate-code", requireUser, api(async (req, res) => {
  const joinCode = isSupabaseConfigured() ? await cloudRotateCode(req.collavibeUser!.id, String(req.params.teamId)) : await rotateTeamCode(req.collavibeUser!.id, String(req.params.teamId));
  res.json({ joinCode });
}));

app.delete("/api/teams/:teamId/members/:userId", requireUser, api(async (req, res) => {
  if (isSupabaseConfigured()) await cloudRemoveMember(req.collavibeUser!.id, String(req.params.teamId), String(req.params.userId));
  else await removeTeamMember(req.collavibeUser!.id, String(req.params.teamId), String(req.params.userId));
  res.status(204).end();
}));

app.post("/api/teams/:teamId/projects/:projectId/features", requireUser, api(async (req, res) => {
  const input = featureFields.parse(req.body);
  const feature = isSupabaseConfigured() ? await cloudCreateFeature(req.collavibeUser!.id, String(req.params.teamId), String(req.params.projectId), input) : await createPlannedFeature(req.collavibeUser!.id, String(req.params.teamId), String(req.params.projectId), input);
  res.status(201).json({ feature });
}));

app.patch("/api/teams/:teamId/features/:featureId", requireUser, api(async (req, res) => {
  const input = featurePatchSchema.parse(req.body);
  const feature = isSupabaseConfigured() ? await cloudEditFeature(req.collavibeUser!.id, String(req.params.teamId), String(req.params.featureId), input) : await updatePlannedFeature(req.collavibeUser!.id, String(req.params.teamId), String(req.params.featureId), input);
  res.json({ feature });
}));

app.get("/api/readiness", api(async (_req, res) => {
  const ready = !isSupabaseConfigured() || await cloudReadiness();
  res.status(ready ? 200 : 503).json({ ok: ready, database: ready ? "available" : "unavailable", message: ready ? "Collavibe is available." : "The database is unavailable. Please try again shortly." });
}));

app.get("/api/teams/:teamId/agent-connections", requireUser, api(async (req, res) => {
  if (!isSupabaseConfigured()) return void res.json({ connections: [], available: false });
  res.json({ connections: await listAgentConnections(req.collavibeUser!.id, String(req.params.teamId)), available: true });
}));
app.post("/api/teams/:teamId/agent-connections", requireUser, requestLimit("agent-key", 30, 3600), api(async (req, res) => {
  if (!isSupabaseConfigured()) throw new WorkspaceError("Agent keys require the hosted service.", 400);
  const input = z.object({ label: z.string().trim().min(2).max(120), days: z.number().int().min(1).max(90).optional() }).parse(req.body);
  res.status(201).json(await createAgentKey(req.collavibeUser!.id, String(req.params.teamId), input));
}));
app.delete("/api/teams/:teamId/agent-connections/:id", requireUser, api(async (req, res) => {
  if (!isSupabaseConfigured()) throw new WorkspaceError("Agent keys require the hosted service.", 400);
  await revokeAgentConnection(req.collavibeUser!.id, String(req.params.teamId), String(req.params.id));
  res.status(204).end();
}));
app.get("/api/oauth/request/:id", requireUser, api(async (req, res) => {
  const request = await authorizationRequest(z.uuid().parse(req.params.id), cookie(req, OAUTH_BROWSER_COOKIE));
  res.json({ clientName: request.clientName, redirectOrigin: new URL(request.redirectUri).origin });
}));
app.post("/api/oauth/approve", requireUser, api(async (req, res) => {
  const input = z.object({ requestId: z.uuid(), teamId: z.uuid().optional(), allow: z.boolean() }).parse(req.body);
  if (input.allow && !input.teamId) throw new WorkspaceError("Choose a team to connect.", 400);
  const redirect = await approveAuthorization(req.collavibeUser!.id, input.requestId, cookie(req, OAUTH_BROWSER_COOKIE), input.teamId || "", input.allow);
  res.clearCookie(OAUTH_BROWSER_COOKIE, { path: "/" });
  res.json({ redirect });
}));

// Bulk state replacement bypassed individual ownership and revisions. Retire it.
app.post("/api/agent/sync", (_req, res) => res.status(410).json({ error: "Bulk publishing has been retired. Connect to /mcp with browser sign-in or a personal agent key and use the session workflow." }));

const oauth = new CollavibeOAuthProvider();
if (isSupabaseConfigured()) {
  app.use(["/authorize", "/token", "/register", "/revoke"], requestLimit("oauth", 120, 900));
  app.use(mcpAuthRouter({ provider: oauth, issuerUrl: new URL(serviceOrigin()), resourceServerUrl: new URL(serviceOrigin() + "/mcp"), resourceName: "Collavibe", scopesSupported: ["collavibe:work"], authorizationOptions: { rateLimit: false }, tokenOptions: { rateLimit: false }, clientRegistrationOptions: { rateLimit: false }, revocationOptions: { rateLimit: false } }));
  app.use("/mcp", requestLimit("mcp", 300, 60), requireBearerAuth({ verifier: oauth, requiredScopes: ["collavibe:work"], expectedResource: new URL(serviceOrigin() + "/mcp"), resourceMetadataUrl: serviceOrigin() + "/.well-known/oauth-protected-resource/mcp" }));
}

app.post("/mcp", async (req, res) => {
  const server = isSupabaseConfigured() ? createHostedCollavibeMcpServer(req.auth!.extra as unknown as AgentIdentity) : createCollavibeMcpServer();
  // Stateless request/response calls don't need a long-lived SSE response stream.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await transport.close();
    await server.close();
  };
  res.on("close", () => void cleanup());
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: error instanceof Error ? error.message : "Internal server error" }, id: null });
    await cleanup();
  }
});

for (const method of ["get", "delete"] as const) {
  app[method]("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed for stateless MCP." }, id: null }));
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "collavibe", version: "0.7.0", mode: isSupabaseConfigured() ? "hosted-mcp" : "local" }));

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
app.use(express.static(publicDirectory));

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if ((error as Error & { type?: string }).type === "entity.parse.failed") return void res.status(400).json({ error: "Send a valid JSON request." });
  if ((error as Error & { type?: string }).type === "entity.too.large") return void res.status(413).json({ error: "This request is too large. Keep snapshots below 1 MB." });
  if (error instanceof WorkspaceError) return void res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError) return void res.status(400).json({ error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
  const message = error instanceof Error ? error.message : "Something went wrong.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(message)) return void res.status(503).json({ error: "The database is unavailable. Please try again shortly." });
  const status = /incorrect|sign in|not a member|unknown user/i.test(message) ? 401 : 400;
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";
if (!process.env.VERCEL) app.listen(port, host, () => console.log(`Collavibe listening on http://${host}:${port}/mcp`));

export default app;

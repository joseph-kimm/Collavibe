import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCollavibeMcpServer } from "./mcp.js";
import { createHostedCollavibeMcpServer } from "./hosted-mcp.js";
import { addProjectToTeam, createTeam, getDashboard, getUserForToken, joinTeam, loginUser, logoutUser, signUpUser } from "../src/store.js";
import { withoutInternalGitEvidence } from "../src/public.js";
import { cloudAgentSync, cloudCreateTeam, cloudDashboard, cloudJoinTeam, cloudLogin, cloudLogout, cloudSignUp, cloudUserForSession, isSupabaseConfigured, type CloudSession } from "../src/supabase.js";
import type { NextFunction, Request, Response } from "express";

export const app = express();
app.use(express.json({ limit: "1mb" }));

const AUTH_COOKIE = "collavibe_session";
const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 30, path: "/" };

function cookie(req: Request, name: string) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
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

app.post("/api/auth/signup", api(async (req, res) => {
  if (isSupabaseConfigured()) {
    const result = await cloudSignUp({ name: String(req.body?.name || ""), email: String(req.body?.email || ""), password: String(req.body?.password || "") });
    setCloudSession(res, result.session);
    res.status(201).json({ user: result.user });
    return;
  }
  const result = await signUpUser({ name: String(req.body?.name || ""), email: String(req.body?.email || ""), password: String(req.body?.password || "") });
  res.cookie(AUTH_COOKIE, result.token, cookieOptions).status(201).json({ user: result.user });
}));

app.post("/api/auth/login", api(async (req, res) => {
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

app.post("/api/teams", requireUser, api(async (req, res) => {
  const team = isSupabaseConfigured()
    ? await cloudCreateTeam({ userId: req.collavibeUser!.id, name: String(req.body?.name || "") })
    : await createTeam({ userId: req.collavibeUser!.id, name: String(req.body?.name || ""), repoPath: typeof req.body?.repoPath === "string" ? req.body.repoPath : undefined });
  res.status(201).json({ team });
}));

app.post("/api/teams/join", requireUser, api(async (req, res) => {
  const team = isSupabaseConfigured()
    ? await cloudJoinTeam({ userId: req.collavibeUser!.id, joinCode: String(req.body?.joinCode || "") })
    : await joinTeam({ userId: req.collavibeUser!.id, joinCode: String(req.body?.joinCode || "") });
  res.json({ team });
}));

app.post("/api/teams/:teamId/projects", requireUser, api(async (req, res) => {
  if (isSupabaseConfigured()) throw new Error("Connect a hosted team from the local MCP using its team code.");
  const project = await addProjectToTeam({ userId: req.collavibeUser!.id, teamId: String(req.params.teamId), repoPath: String(req.body?.repoPath || "") });
  res.status(201).json({ project: withoutInternalGitEvidence(project) });
}));

const agentSyncSchema = z.object({
  teamCode: z.string().min(8).max(16),
  project: z.object({ id: z.string().min(1), name: z.string().min(1), root: z.string(), remote: z.string().optional(), latestGit: z.record(z.string(), z.unknown()), createdAt: z.string(), updatedAt: z.string() }).passthrough(),
  features: z.array(z.object({ id: z.string(), projectId: z.string(), updatedAt: z.string() }).passthrough()).max(500),
  sessions: z.array(z.object({ id: z.string(), projectId: z.string(), participant: z.string(), startedAt: z.string() }).passthrough()).max(1000),
});

app.post("/api/agent/sync", api(async (req, res) => {
  if (!isSupabaseConfigured()) throw new Error("Hosted sync is not configured on this server.");
  const payload = agentSyncSchema.parse(req.body);
  const synced = await cloudAgentSync(payload as unknown as Parameters<typeof cloudAgentSync>[0]);
  res.json({ synced });
}));

app.post("/mcp", async (req, res) => {
  const server = isSupabaseConfigured() ? createHostedCollavibeMcpServer() : createCollavibeMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "collavibe", version: "0.5.0", mode: isSupabaseConfigured() ? "hosted-mcp" : "local" }));

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
app.use(express.static(publicDirectory));

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status = /incorrect|sign in|not a member|unknown user/i.test(message) ? 401 : 400;
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";
if (!process.env.VERCEL) app.listen(port, host, () => console.log(`Collavibe listening on http://${host}:${port}/mcp`));

export default app;

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createCollavibeMcpServer } from "./mcp.js";
import { addProjectToTeam, createTeam, getDashboard, getUserForToken, joinTeam, loginUser, logoutUser, signUpUser } from "../src/store.js";
import { withoutInternalGitEvidence } from "../src/public.js";
import type { NextFunction, Request, Response } from "express";

const app = express();
const transports = new Map<string, StreamableHTTPServerTransport>();
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

async function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
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
  const result = await signUpUser({ name: String(req.body?.name || ""), email: String(req.body?.email || ""), password: String(req.body?.password || "") });
  res.cookie(AUTH_COOKIE, result.token, cookieOptions).status(201).json({ user: result.user });
}));

app.post("/api/auth/login", api(async (req, res) => {
  const result = await loginUser({ email: String(req.body?.email || ""), password: String(req.body?.password || "") });
  res.cookie(AUTH_COOKIE, result.token, cookieOptions).json({ user: result.user });
}));

app.post("/api/auth/logout", api(async (req, res) => {
  const token = cookie(req, AUTH_COOKIE);
  if (token) await logoutUser(token);
  res.clearCookie(AUTH_COOKIE, { path: "/" }).status(204).end();
}));

app.get("/api/dashboard", requireUser, api(async (req, res) => {
  const dashboard = await getDashboard(req.collavibeUser!.id, typeof req.query.teamId === "string" ? req.query.teamId : undefined);
  res.json(withoutInternalGitEvidence(dashboard));
}));

app.get("/api/state", requireUser, api(async (req, res) => {
  const dashboard = await getDashboard(req.collavibeUser!.id, typeof req.query.teamId === "string" ? req.query.teamId : undefined);
  res.json(withoutInternalGitEvidence(dashboard));
}));

app.post("/api/teams", requireUser, api(async (req, res) => {
  const team = await createTeam({
    userId: req.collavibeUser!.id,
    name: String(req.body?.name || ""),
    repoPath: typeof req.body?.repoPath === "string" ? req.body.repoPath : undefined,
  });
  res.status(201).json({ team });
}));

app.post("/api/teams/join", requireUser, api(async (req, res) => {
  const team = await joinTeam({ userId: req.collavibeUser!.id, joinCode: String(req.body?.joinCode || "") });
  res.json({ team });
}));

app.post("/api/teams/:teamId/projects", requireUser, api(async (req, res) => {
  const project = await addProjectToTeam({ userId: req.collavibeUser!.id, teamId: String(req.params.teamId), repoPath: String(req.body?.repoPath || "") });
  res.status(201).json({ project: withoutInternalGitEvidence(project) });
}));

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, transport!); },
    });
    transport.onclose = () => { if (transport?.sessionId) transports.delete(transport.sessionId); };
    await createCollavibeMcpServer().connect(transport);
  }
  if (!transport) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid or missing MCP session." }, id: null });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

for (const method of ["get", "delete"] as const) {
  app[method]("/mcp", async (req, res) => {
    const transport = transports.get(req.headers["mcp-session-id"] as string);
    if (!transport) return void res.status(400).send("Invalid or missing MCP session.");
    await transport.handleRequest(req, res);
  });
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "collavibe", version: "0.3.0" }));

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
app.use(express.static(publicDirectory));

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status = /incorrect|sign in|not a member|unknown user/i.test(message) ? 401 : 400;
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () => console.log(`Collavibe listening on http://${host}:${port}/mcp`));

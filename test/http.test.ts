import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
let serverProcess: ChildProcess;
let tempDirectory: string;
let baseUrl: string;
let testPort: number;
let authCookie = "";

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a test port."));
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the HTTP MCP test server.");
}

function launchServer() {
  serverProcess = spawn(path.join(projectRoot, "node_modules/.bin/tsx"), ["server/http.ts"], {
    cwd: projectRoot,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(testPort), COLLAVIBE_DATA_PATH: path.join(tempDirectory, "state.json") },
    stdio: "ignore",
  });
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => serverProcess.once("exit", () => resolve()));
  serverProcess.kill("SIGTERM");
  await exited;
}

beforeAll(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "collavibe-http-test-"));
  testPort = await availablePort();
  baseUrl = `http://127.0.0.1:${testPort}`;
  launchServer();
  await waitForHealth();
});

afterAll(async () => {
  await stopServer();
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("Streamable HTTP transport", () => {
  it("initializes independent clients and persists shared state", async () => {
    const clientOne = new Client({ name: "http-one", version: "1.0.0" });
    const clientTwo = new Client({ name: "http-two", version: "1.0.0" });
    await Promise.all([
      clientOne.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`))),
      clientTwo.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`))),
    ]);

    const started = await clientOne.callTool({
      name: "start_collaboration_session",
      arguments: { repoPath: projectRoot, participant: "HTTP Test" },
    });
    expect(started.isError).not.toBe(true);
    const context = await clientTwo.callTool({ name: "get_project_context", arguments: { repoPath: projectRoot } });
    expect(context.isError).not.toBe(true);

    const signup = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "HTTP Owner", email: "owner@example.com", password: "a-secure-test-password" }),
    });
    expect(signup.status).toBe(201);
    authCookie = signup.headers.get("set-cookie")!.split(";")[0];
    const team = await fetch(`${baseUrl}/api/teams`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: authCookie },
      body: JSON.stringify({ name: "HTTP Team", repoPath: projectRoot }),
    });
    expect(team.status).toBe(201);

    const stateResponse = await fetch(`${baseUrl}/api/state`, { headers: { cookie: authCookie } });
    const state = await stateResponse.json() as { sessions: unknown[]; projects: Array<{ latestGit: Record<string, unknown> }> };
    expect(state.sessions).toHaveLength(1);
    expect(state.projects[0].latestGit).not.toHaveProperty("workingFileFingerprints");

    await Promise.all([clientOne.close(), clientTwo.close()]);
  });

  it("rejects an MCP request without a valid transport session", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { message: "Invalid or missing MCP session." } });
  });

  it("requires a signed-in account for the team dashboard", async () => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Sign in to continue." });
  });

  it("restores shared project state after a server restart", async () => {
    await stopServer();
    launchServer();
    await waitForHealth();
    const state = await (await fetch(`${baseUrl}/api/state`, { headers: { cookie: authCookie } })).json() as { sessions: unknown[] };
    expect(state.sessions).toHaveLength(1);
  });
});

import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createCollavibeMcpServer } from "./mcp.js";

const app = express();
const transports = new Map<string, StreamableHTTPServerTransport>();
app.use(express.json({ limit: "1mb" }));

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "collavibe", version: "0.2.0" }));

const port = Number(process.env.PORT || 4317);
app.listen(port, () => console.log(`Collavibe listening on http://localhost:${port}/mcp`));

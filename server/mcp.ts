import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { attachEvidence, claimFeature, createFeature, finishSession, getProjectView, recordDecision, requestReview, resolveReview, startSession, updateFeature } from "../src/lib/store";

const sessions = new Map<string, StreamableHTTPServerTransport>();

function result(message: string, structuredContent: Record<string, unknown>) {
  return { structuredContent, content: [{ type: "text" as const, text: message }] };
}

function createServer() {
  const server = new McpServer(
    { name: "collavibe", version: "0.1.0" },
    { instructions: "Read project state before proposing changes. Agents may summarize or propose updates, but learners remain responsible for claims, evidence, reviews, and consequential status changes. Never include secrets or private prompt transcripts." },
  );

  server.registerTool("get_project_state", {
    title: "Get project state",
    description: "Read the shared project, feature ownership, active sessions, evidence, decisions, reviews, and handoffs before planning work.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const state = await getProjectView();
    return result(`Loaded ${state.project.name} with ${state.features.length} features.`, { state });
  });

  server.registerTool("create_feature", {
    title: "Create a feature",
    description: "Add a queued feature with a learner-authored user story, acceptance criteria, and explicit risk level.",
    inputSchema: { title: z.string().min(3), userStory: z.string().min(12), acceptanceCriteria: z.array(z.string().min(4)).min(1), risk: z.enum(["low", "medium", "high"]) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const feature = await createFeature(input);
    return result(`Created ${feature.title} in the queue.`, { feature });
  });

  server.registerTool("claim_feature", {
    title: "Claim a feature",
    description: "Assign an unclaimed feature to a learner before starting agent work.",
    inputSchema: { featureId: z.string(), memberId: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ featureId, memberId }) => {
    const feature = await claimFeature(featureId, memberId);
    return result(`Claimed ${feature.title}.`, { feature });
  });

  server.registerTool("start_session", {
    title: "Start a work session",
    description: "Record the intended change, plan, and expected evidence before coding begins.",
    inputSchema: { featureId: z.string(), memberId: z.string(), plan: z.string().min(8), expectedEvidence: z.string().min(8) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const session = await startSession(input);
    return result("Work session started with an explicit evidence plan.", { session });
  });

  server.registerTool("record_decision", {
    title: "Record a design decision",
    description: "Make a consequential product or technical choice visible with its rationale, alternatives, and affected components.",
    inputSchema: { featureId: z.string(), memberId: z.string(), decision: z.string().min(4), rationale: z.string().min(8), alternatives: z.string().min(3), affectedComponents: z.array(z.string()).min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const decision = await recordDecision(input);
    return result("Decision recorded for team inspection.", { decision });
  });

  server.registerTool("attach_evidence", {
    title: "Attach evidence",
    description: "Attach a test, preview, screenshot, log, or learner explanation to a feature claim. State what it shows and its limits.",
    inputSchema: { featureId: z.string(), memberId: z.string(), type: z.enum(["test", "preview", "screenshot", "log", "explanation"]), title: z.string().min(3), result: z.enum(["pass", "fail", "inconclusive"]), details: z.string().min(8), url: z.url().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const evidence = await attachEvidence(input);
    return result("Evidence attached. This records a claim; it does not independently certify correctness.", { evidence });
  });

  server.registerTool("request_review", {
    title: "Request peer review",
    description: "Ask a different teammate to inspect a feature against its acceptance criteria and attached evidence.",
    inputSchema: { featureId: z.string(), requesterId: z.string(), reviewerId: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const review = await requestReview(input);
    return result("Peer review requested.", { review });
  });

  server.registerTool("resolve_review", {
    title: "Resolve peer review",
    description: "Allow only the assigned reviewer to accept the evidence or request specific changes. Acceptance does not mark the feature Done by itself.",
    inputSchema: { reviewId: z.string(), reviewerId: z.string(), status: z.enum(["accepted", "changes_requested"]), notes: z.string().min(4) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const review = await resolveReview(input);
    return result(`Review ${review.status.replace("_", " ")}.`, { review });
  });

  server.registerTool("update_feature", {
    title: "Update feature status",
    description: "Update feature workflow status. Done is rejected unless passing evidence and an accepted peer review already exist.",
    inputSchema: { featureId: z.string(), status: z.enum(["queued", "active", "review", "done", "blocked"]) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const feature = await updateFeature(input);
    return result(`Feature status is now ${feature.status}.`, { feature });
  });

  server.registerTool("finish_session", {
    title: "Finish a work session",
    description: "Close an active work session and create a handoff containing changes, evidence, uncertainty, and the next action.",
    inputSchema: {
      sessionId: z.string(),
      summary: z.string().min(8),
      intent: z.string().min(4),
      changes: z.string().min(4),
      evidenceSummary: z.string().min(4),
      uncertainty: z.string().min(3),
      nextAction: z.string().min(4),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ sessionId, summary, ...handoff }) => {
    const finished = await finishSession({ sessionId, summary, handoff });
    return result("Session finished and handoff recorded.", finished);
  });

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport!);
      },
    });
    transport.onclose = () => {
      if (transport?.sessionId) sessions.delete(transport.sessionId);
    };
    await createServer().connect(transport);
  }

  if (!transport) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid or missing MCP session." }, id: null });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const transport = sessions.get(req.headers["mcp-session-id"] as string);
  if (!transport) return void res.status(400).send("Invalid or missing MCP session.");
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const transport = sessions.get(req.headers["mcp-session-id"] as string);
  if (!transport) return void res.status(400).send("Invalid or missing MCP session.");
  await transport.handleRequest(req, res);
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "collavibe-mcp", version: "0.1.0" }));

const port = Number(process.env.MCP_PORT || 3001);
app.listen(port, () => console.log(`Collavibe MCP server listening on http://localhost:${port}/mcp`));

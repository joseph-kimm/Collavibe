import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "../src/agent-access.js";
import { listTickets, proposeTickets, ticketFields } from "../src/tickets.js";

export function registerPlanningTools(server: McpServer, actor: AgentIdentity) {
  const user = { id: actor.userId, name: actor.name };
  const respond = (value: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value });
  server.registerTool("get_collaboration_plan", {
    title: "Read planning tickets", description: "Read this project's planning tickets and pending suggestions. Tickets are intentions, not evidence that work was completed. Preserve human choice.",
    inputSchema: { projectId: z.string().min(5).max(128) }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ projectId }) => respond({ tickets: await listTickets(user, actor.teamId, projectId), instruction: "Present approved, relevant work to the user. Do not treat proposed or rejected tickets as assigned work." }));
  server.registerTool("propose_project_tickets", {
    title: "Propose next tasks for human review", description: "Save up to twelve suggested tickets from a session or meeting. These remain unassigned proposals until a human approves them in the website. Never claim approval or invent an assignee.",
    inputSchema: { projectId: z.string().min(5).max(128), requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/), proposals: z.array(ticketFields).min(1).max(12) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ projectId, ...input }) => respond({ proposals: await proposeTickets(user, actor.teamId, projectId, input), instruction: "Suggestions saved for human review, not assigned or approved. The learner makes the decision." }));
}

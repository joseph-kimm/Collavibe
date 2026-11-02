import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { collaborationFixture } from "./helpers/collaboration-fixture.js";
import { changeTicket, createTicket, listTickets, proposeTickets } from "../src/tickets.js";
import { registerPlanningTools } from "../server/planning-tools.js";

let f: Awaited<ReturnType<typeof collaborationFixture>>;
beforeAll(async () => { f = await collaborationFixture(); });
afterAll(async () => { await f.cleanup(); });

describe("planning tickets and human approval", () => {
  it("creates a separate assignable plan without fabricating completed features", async () => {
    const ticket = await createTicket(f.owner, f.teamId, f.projectId, { title: "Handle empty API results", assigneeId: f.member.id, priority: "high", sessionId: f.sessionId });
    expect(ticket.kind).toBe("ticket"); expect(ticket.payload.status).toBe("planned"); expect(ticket.payload.assigneeId).toBe(f.member.id);
    const changed = await changeTicket(f.member, f.teamId, f.projectId, ticket.id, { action: "update", expectedVersion: ticket.version, fields: { ...ticket.payload, status: "done" } });
    expect(changed.payload.status).toBe("done");
    await expect(changeTicket(f.owner, f.teamId, f.projectId, ticket.id, { action: "update", expectedVersion: ticket.version, fields: ticket.payload })).rejects.toMatchObject({ status: 409 });
  });
  it("keeps agent proposals unassigned and unapproved until reviewed by a human", async () => {
    const proposal = await createTicket(f.member, f.teamId, f.projectId, { title: "Add response validation", assigneeId: f.owner.id, status: "done", approvedBy: f.owner.id }, true);
    expect(proposal.payload.status).toBe("proposed"); expect(proposal.payload.assigneeId).toBeNull(); expect(proposal.payload.approvedBy).toBeNull();
    await expect(changeTicket(f.owner, f.teamId, f.projectId, proposal.id, { action: "update", expectedVersion: proposal.version, fields: { title: "Skip review" } })).rejects.toMatchObject({ status: 409 });
    const approved = await changeTicket(f.owner, f.teamId, f.projectId, proposal.id, { action: "approve", expectedVersion: proposal.version });
    expect(approved.payload.status).toBe("planned"); expect(approved.payload.approvedBy).toBe(f.owner.id); expect(approved.payload.assigneeId).toBe(f.owner.id);
    await expect(changeTicket(f.member, f.teamId, f.projectId, proposal.id, { action: "reject", expectedVersion: approved.version })).rejects.toMatchObject({ status: 409 });
  });
  it("supports rejection without assigning a task", async () => {
    const proposal = await createTicket(f.owner, f.teamId, f.projectId, { title: "An irrelevant idea" }, true);
    const rejected = await changeTicket(f.member, f.teamId, f.projectId, proposal.id, { action: "reject", expectedVersion: proposal.version });
    expect(rejected.payload.status).toBe("rejected"); expect(rejected.payload.assigneeId).toBeNull();
  });
  it("rejects outsiders, invalid members, and cross-project source links", async () => {
    await expect(listTickets(f.outsider, f.teamId, f.projectId)).rejects.toMatchObject({ status: 403 });
    await expect(createTicket(f.owner, f.teamId, f.projectId, { title: "Bad assignee", assigneeId: f.outsider.id })).rejects.toMatchObject({ status: 400 });
    await expect(createTicket(f.owner, f.teamId, f.projectId, { title: "Bad source", sourceKind: "session", sourceId: "foreign-session" })).rejects.toMatchObject({ status: 404 });
    await expect(createTicket(f.owner, f.teamId, f.projectId, { title: "Bad linked feature", featureId: "foreign-feature" })).rejects.toMatchObject({ status: 404 });
  });
  it("validates whole proposal batches and makes retries idempotent", async () => {
    const before = (await listTickets(f.owner, f.teamId, f.projectId)).length;
    await expect(proposeTickets(f.owner, f.teamId, f.projectId, { requestId: "invalid_batch_001", proposals: [{ title: "Valid task" }, { title: "Invalid target", assigneeId: f.outsider.id }] })).rejects.toThrow();
    expect(await listTickets(f.owner, f.teamId, f.projectId)).toHaveLength(before);
    const input = { requestId: "valid_batch_001", proposals: [{ title: "A draft next step", sourceKind: "session", sourceId: f.sessionId }] };
    const one = await proposeTickets(f.owner, f.teamId, f.projectId, input);
    const two = await proposeTickets(f.owner, f.teamId, f.projectId, input);
    expect(one.map(row => row.id)).toEqual(two.map(row => row.id));
    await expect(proposeTickets(f.owner, f.teamId, f.projectId, { ...input, proposals: [{ title: "Different task" }] })).rejects.toMatchObject({ status: 409 });
  });
  it("exposes real MCP planning/proposal tools but no agent approval tool", async () => {
    const server = new McpServer({ name: "planning-test", version: "1" });
    registerPlanningTools(server, { userId: f.owner.id, name: f.owner.name, teamId: f.teamId, tokenId: "test-only" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "learner-agent", version: "1" });
    await server.connect(serverTransport); await client.connect(clientTransport);
    try {
      const tools = (await client.listTools()).tools.map(tool => tool.name);
      expect(tools).toEqual(["get_collaboration_plan", "propose_project_tickets"]);
      const proposed = await client.callTool({ name: "propose_project_tickets", arguments: { projectId: f.projectId, requestId: "mcp_proposal_001", proposals: [{ title: "Test the empty state", assigneeId: f.member.id }] } });
      expect(proposed.isError).not.toBe(true);
      const records = (proposed.structuredContent as { proposals: { payload: { status: string; assigneeId: unknown } }[] }).proposals;
      expect(records[0].payload.status).toBe("proposed"); expect(records[0].payload.assigneeId).toBeNull();
      const plan = await client.callTool({ name: "get_collaboration_plan", arguments: { projectId: f.projectId } });
      expect(plan.isError).not.toBe(true);
    } finally { await client.close(); await server.close(); }
  });
});

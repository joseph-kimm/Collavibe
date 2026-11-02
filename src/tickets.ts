import { z } from "zod";
import { createHash } from "node:crypto";
import { collaborationMembers, collaborationScope, newRecord, readRecords, reviseRecord, saveRecord, type Actor, type CollaborationRecord } from "./collaboration-records.js";
import { WorkspaceError } from "./workspace-model.js";

export const ticketFields = z.object({
  title: z.string().trim().min(3).max(200), description: z.string().trim().max(4000).default(""),
  assigneeId: z.string().max(128).nullable().default(null),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueDate: z.union([z.iso.date(), z.literal("")]).default(""),
  status: z.enum(["planned", "active", "review", "blocked", "done"]).default("planned"),
  featureId: z.string().max(128).nullable().default(null), sessionId: z.string().max(128).nullable().default(null),
  sourceKind: z.enum(["manual", "session", "meeting"]).default("manual"), sourceId: z.string().max(128).nullable().default(null),
});
export type TicketFields = z.infer<typeof ticketFields>;
export const ticketChange = z.object({ action: z.enum(["update", "approve", "reject"]), expectedVersion: z.number().int().positive(), fields: ticketFields.optional() });

async function checkLinks(actor: Actor, teamId: string, projectId: string, input: TicketFields) {
  const scope = await collaborationScope(actor, teamId, projectId);
  if (scope.project?.archivedAt) throw new WorkspaceError("Restore this project before changing tickets.", 409);
  if (input.assigneeId && !(await collaborationMembers(actor, teamId)).some(member => member.userId === input.assigneeId)) throw new WorkspaceError("Choose an assignee who belongs to this team.", 400);
  if (input.featureId && !scope.features.some(feature => feature.id === input.featureId && feature.projectId === projectId && !feature.archivedAt)) throw new WorkspaceError("Linked feature not found in this project.", 404);
  if (input.sessionId && !scope.sessions.some(session => session.id === input.sessionId && session.projectId === projectId)) throw new WorkspaceError("Linked session not found in this project.", 404);
  if (input.sourceKind === "session" && !scope.sessions.some(session => session.id === input.sourceId && session.projectId === projectId)) throw new WorkspaceError("Source session not found in this project.", 404);
  if (input.sourceKind === "meeting" && !(await readRecords(teamId, projectId)).some(row => row.id === input.sourceId && row.kind === "meeting" && !row.deletedAt)) throw new WorkspaceError("Source meeting not found in this project.", 404);
  return scope;
}

export async function listTickets(actor: Actor, teamId: string, projectId: string) {
  await collaborationScope(actor, teamId, projectId);
  return (await readRecords(teamId, projectId)).filter(row => row.kind === "ticket" && !row.deletedAt);
}

export async function createTicket(actor: Actor, teamId: string, projectId: string, raw: unknown, proposedByAgent = false) {
  const input = ticketFields.parse(raw);
  await checkLinks(actor, teamId, projectId, input);
  const payload: Record<string, unknown> = { ...input, status: proposedByAgent ? "proposed" : input.status,
    suggestedAssigneeId: proposedByAgent ? input.assigneeId : null, assigneeId: proposedByAgent ? null : input.assigneeId,
    origin: proposedByAgent ? "agent_proposal" : "human", approvedBy: proposedByAgent ? null : actor.id, approvedAt: proposedByAgent ? null : new Date().toISOString() };
  return saveRecord(actor, newRecord(actor, teamId, projectId, "ticket", payload), null);
}

export async function changeTicket(actor: Actor, teamId: string, projectId: string, ticketId: string, raw: unknown) {
  const input = ticketChange.parse(raw);
  const current = (await listTickets(actor, teamId, projectId)).find(row => row.id === ticketId);
  if (!current) throw new WorkspaceError("Ticket not found in this project.", 404);
  if (input.expectedVersion !== current.version) throw new WorkspaceError("This ticket changed. Reload before saving.", 409);
  const proposed = current.payload.status === "proposed";
  if (input.action === "update" && !input.fields) throw new WorkspaceError("Supply the ticket fields to update.", 400);
  if (proposed && input.action === "update") throw new WorkspaceError("Review and approve or reject this proposal first.", 409);
  if (!proposed && input.action !== "update") throw new WorkspaceError("Only pending proposals can be approved or rejected.", 409);
  const fields = ticketFields.parse(input.fields || { ...current.payload, status: "planned", assigneeId: current.payload.suggestedAssigneeId || null });
  await checkLinks(actor, teamId, projectId, fields);
  const payload = input.action === "reject" ? { ...current.payload, status: "rejected", reviewedBy: actor.id }
    : { ...current.payload, ...fields, ...(input.action === "approve" ? { status: "planned", approvedBy: actor.id, approvedAt: new Date().toISOString() } : {}) };
  return saveRecord(actor, reviseRecord(current, payload), current.version);
}

export async function proposeTickets(actor: Actor, teamId: string, projectId: string, raw: unknown) {
  const input = z.object({ proposals: z.array(ticketFields).min(1).max(12), requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/) }).parse(raw);
  await collaborationScope(actor, teamId, projectId);
  // Validate the complete batch before writing any rows. Deterministic IDs make
  // retries idempotent without turning a second call into duplicate assignments.
  for (const proposal of input.proposals) await checkLinks(actor, teamId, projectId, proposal);
  const existing = await listTickets(actor, teamId, projectId);
  const result: CollaborationRecord[] = [];
  for (let i = 0; i < input.proposals.length; i++) {
    const id = `ticket_${createHash("sha256").update([teamId, projectId, actor.id, input.requestId, i].join(":" )).digest("hex").slice(0,40)}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(input.proposals[i])).digest("hex");
    const found = existing.find(row => row.id === id);
    if (found) {
      if (found.payload.proposalFingerprint !== fingerprint) throw new WorkspaceError("This proposal request ID was already used for different tasks.", 409);
      result.push(found); continue;
    }
    const proposal = input.proposals[i];
    const row = newRecord(actor, teamId, projectId, "ticket", { ...proposal, status: "proposed", suggestedAssigneeId: proposal.assigneeId, assigneeId: null, origin: "agent_proposal", approvedBy: null, approvedAt: null, proposalFingerprint: fingerprint });
    row.id = id;
    try { result.push(await saveRecord(actor, row, null)); }
    catch (error) {
      if (!(error instanceof WorkspaceError) || error.status !== 409) throw error;
      const duplicate = (await listTickets(actor, teamId, projectId)).find(item => item.id === id);
      if (!duplicate) throw error;
      result.push(duplicate);
    }
  }
  return result;
}

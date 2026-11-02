import { z } from "zod";
import { collaborationScope, newRecord, readRecords, reviseRecord, saveRecord, type Actor } from "./collaboration-records.js";
import { WorkspaceError } from "./workspace-model.js";

export const reflectionInput = z.object({ text: z.string().trim().min(1).max(8000), publicConsent: z.boolean().default(false), expectedVersion: z.number().int().positive().optional() });
export const replyInput = z.object({ text: z.string().trim().min(1).max(2000), parentId: z.string().min(5).max(128) });

export async function sessionLearning(actor: Actor, teamId: string, projectId: string, sessionId: string) {
  const scope = await collaborationScope(actor, teamId, projectId);
  const session = scope.sessions.find(item => item.id === sessionId && item.projectId === projectId);
  if (!session) throw new WorkspaceError("Session not found in this project.", 404);
  const records = (await readRecords(teamId, projectId)).filter(row => ["reflection", "reply"].includes(row.kind) && row.payload.sessionId === sessionId && !row.deletedAt);
  return { scope, session, records };
}

export async function writeReflection(actor: Actor, teamId: string, projectId: string, sessionId: string, raw: unknown) {
  const input = reflectionInput.parse(raw);
  const { scope, records } = await sessionLearning(actor, teamId, projectId, sessionId);
  if (scope.project?.archivedAt) throw new WorkspaceError("Restore this project before adding reflections.", 409);
  const current = records.find(row => row.kind === "reflection" && row.authorId === actor.id);
  if (current && current.version !== input.expectedVersion) throw new WorkspaceError("Your reflection changed. Reload it before saving.", 409);
  if (!current && input.expectedVersion) throw new WorkspaceError("Reflection not found.", 404);
  const payload = { sessionId, text: input.text, publicConsent: input.publicConsent, humanWritten: true };
  const row = current ? reviseRecord(current, payload) : newRecord(actor, teamId, projectId, "reflection", payload);
  // Deterministic identity prevents two tabs creating duplicate initial entries.
  if (!current) row.id = `reflection_${sessionId}_${actor.id}`;
  return saveRecord(actor, row, current?.version || null);
}

export async function writeSessionReply(actor: Actor, teamId: string, projectId: string, sessionId: string, raw: unknown) {
  const input = replyInput.parse(raw);
  const { scope, records } = await sessionLearning(actor, teamId, projectId, sessionId);
  if (scope.project?.archivedAt) throw new WorkspaceError("Restore this project before replying.", 409);
  const parent = records.find(row => row.id === input.parentId);
  if (!parent) throw new WorkspaceError("Reply target not found in this session.", 404);
  if (records.length >= 500) throw new WorkspaceError("This session discussion is full.", 409);
  const rootId = parent.kind === "reflection" ? parent.id : String(parent.payload.rootId);
  return saveRecord(actor, newRecord(actor, teamId, projectId, "reply", { sessionId, parentId: parent.id, rootId, text: input.text }), null);
}

export async function removeLearningEntry(actor: Actor, teamId: string, projectId: string, sessionId: string, recordId: string, version: number) {
  const { scope, records } = await sessionLearning(actor, teamId, projectId, sessionId);
  const row = records.find(item => item.id === recordId);
  if (!row) throw new WorkspaceError("Entry not found.", 404);
  if (row.authorId !== actor.id && !scope.owner) throw new WorkspaceError("Only the author or team owner can remove an entry.", 403);
  if (row.version !== version) throw new WorkspaceError("This entry changed. Reload before removing it.", 409);
  const removed = reviseRecord(row, { sessionId, text: "[Removed]", ...(row.payload.rootId ? { rootId: row.payload.rootId } : {}), ...(row.payload.parentId ? { parentId: row.payload.parentId } : {}) });
  removed.deletedAt = new Date().toISOString();
  return saveRecord(actor, removed, row.version);
}

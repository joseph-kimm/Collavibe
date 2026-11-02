import { z } from "zod";
import { collaborationScope, newRecord, readRecords, reviseRecord, saveRecord, type Actor } from "./collaboration-records.js";
import { WorkspaceError } from "./workspace-model.js";

const speakerId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).refine(value => !["__proto__", "prototype", "constructor"].includes(value));
export const segmentSchema = z.object({ speaker: speakerId, start: z.number().finite().min(0), end: z.number().finite().min(0), text: z.string().trim().max(4000) }).refine(value => value.end >= value.start, { message: "A segment must end after it starts." });
export const meetingFields = z.object({ title: z.string().trim().min(3).max(200), transcript: z.string().trim().min(1).max(150000),
  segments: z.array(segmentSchema).max(3000).default([]), speakers: z.record(speakerId, z.string().trim().min(1).max(120)).default({}),
  summary: z.string().trim().max(10000).default(""), speakersReviewed: z.boolean().default(false), consentConfirmed: z.literal(true), source: z.enum(["paste", "audio"]).default("paste") });

export async function listMeetings(actor: Actor, teamId: string, projectId: string) {
  await collaborationScope(actor, teamId, projectId);
  return (await readRecords(teamId, projectId)).filter(row => row.kind === "meeting" && !row.deletedAt);
}

export async function getMeeting(actor: Actor, teamId: string, projectId: string, meetingId: string) {
  const row = (await listMeetings(actor, teamId, projectId)).find(row => row.id === meetingId);
  if (!row) throw new WorkspaceError("Meeting not found in this project.", 404);
  return row;
}

export async function createMeeting(actor: Actor, teamId: string, projectId: string, raw: unknown) {
  const fields = meetingFields.parse(raw);
  if (Object.keys(fields.speakers).length > 30) throw new WorkspaceError("Use at most 30 speaker labels.", 400);
  const scope = await collaborationScope(actor, teamId, projectId);
  if (scope.project?.archivedAt) throw new WorkspaceError("Restore this project before adding a meeting.", 409);
  return saveRecord(actor, newRecord(actor, teamId, projectId, "meeting", { ...fields, summarySource: "human", recordingStored: false }), null);
}

export async function editMeeting(actor: Actor, teamId: string, projectId: string, meetingId: string, raw: unknown, agentSummary = false) {
  const current = await getMeeting(actor, teamId, projectId, meetingId);
  const scope = await collaborationScope(actor, teamId, projectId);
  if (scope.project?.archivedAt) throw new WorkspaceError("Restore this project before editing a meeting.", 409);
  if (current.authorId !== actor.id && !scope.owner) throw new WorkspaceError("Only the meeting author or team owner can edit it.", 403);
  const patch = z.object({ expectedVersion: z.number().int().positive(), title: z.string().trim().min(3).max(200).optional(), transcript: z.string().trim().min(1).max(150000).optional(), summary: z.string().trim().max(10000).optional(), speakers: z.record(speakerId, z.string().trim().min(1).max(120)).optional(), speakersReviewed: z.boolean().optional() }).parse(raw);
  if (patch.expectedVersion !== current.version) throw new WorkspaceError("This meeting changed. Reload before saving.", 409);
  if (patch.speakers && Object.keys(patch.speakers).length > 30) throw new WorkspaceError("Use at most 30 speaker labels.", 400);
  const { expectedVersion, ...fields } = patch;
  if (agentSummary && Object.keys(fields).some(key => key !== "summary")) throw new WorkspaceError("Agents may draft a meeting summary, not rewrite speaker identities or transcript evidence.", 403);
  const changedTranscript = patch.transcript !== undefined && patch.transcript !== current.payload.transcript;
  return saveRecord(actor, reviseRecord(current, { ...current.payload, ...fields, ...(changedTranscript ? { segments: [], speakersReviewed: false } : {}), ...(patch.summary !== undefined ? { summarySource: agentSummary ? "agent_draft" : "human" } : {}) }), current.version);
}

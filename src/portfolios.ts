import { createHash } from "node:crypto";
import { z } from "zod";
import { collaborationScope, findRecord, newRecord, readRecords, reviseRecord, saveRecord, type Actor } from "./collaboration-records.js";
import { WorkspaceError } from "./workspace-model.js";

export function publicText(value: unknown, limit = 10000): string {
  return String(value || "").slice(0, limit)
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|cv_[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{12,})\b/g, "[redacted credential]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[private email]")
    .replace(/\/(?:Users|home|private|tmp|var)\/[^\s<>"']+/g, "[private path]")
    .replace(/https?:\/\/[^\s<>"']+/gi, value => { try { const url = new URL(value); if (url.username || url.password || [...url.searchParams.keys()].some(key => /token|secret|password|api.?key|authorization/i.test(key))) return "[private URL]"; } catch { return "[invalid URL]"; } return value; });
}
export const publicUrl = z.string().trim().max(2048).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && ![...url.searchParams.keys()].some(key => /token|secret|password|api.?key|authorization/i.test(key)); } catch { return false; }
}, "Use an HTTPS link without credentials or secret query parameters.");

export const portfolioFields = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().min(12).max(4000), appUrl: publicUrl.default(""),
  sessionIds: z.array(z.string().min(5).max(128)).max(200).default([]), featureIds: z.array(z.string().min(5).max(128)).max(200).default([]), includeReflections: z.boolean().default(false) });
type PublicSession = { id: string; participant: string; featureId: string | null; startedAt: string; summary: string; workCompleted: string[]; decisions: string[]; blockers: string[]; nextSteps: string[]; branch: string; commits: { shortHash: string; subject: string }[]; reflections: { id: string; authorName: string; text: string }[] };
export type Snapshot = { title: string; description: string; appUrl: string; features: { id: string; title: string; description: string; status: string }[]; sessions: PublicSession[]; evidenceNotice: string };

export async function previewPortfolio(actor: Actor, teamId: string, projectId: string, raw: unknown) {
  const input = portfolioFields.parse(raw);
  const scope = await collaborationScope(actor, teamId, projectId);
  if (!scope.owner) throw new WorkspaceError("Only the team owner can prepare a public portfolio.", 403);
  const sessions = scope.sessions.filter(row => row.projectId === projectId && input.sessionIds.includes(row.id));
  const features = scope.features.filter(row => row.projectId === projectId && input.featureIds.includes(row.id));
  if (new Set(input.sessionIds).size !== sessions.length || new Set(input.featureIds).size !== features.length) throw new WorkspaceError("Select only sessions and features from this project.", 400);
  const records = input.includeReflections ? await readRecords(teamId, projectId) : [];
  const strings = (items?: string[]) => (items || []).slice(0,100).map(text => publicText(text, 2000));
  const snapshot: Snapshot = {
    title: publicText(input.title, 200), description: publicText(input.description, 4000), appUrl: input.appUrl,
    features: features.map(row => ({ id: row.id, title: publicText(row.title,200), description: publicText(row.description,4000), status: row.status })),
    sessions: sessions.sort((a,b) => a.startedAt.localeCompare(b.startedAt)).map(row => ({ id: row.id, participant: publicText(row.participant,120), featureId: row.featureId || null, startedAt: row.startedAt,
      summary: publicText(row.sync?.summary || row.intent), workCompleted: strings(row.sync?.workCompleted), decisions: strings(row.sync?.decisions), blockers: strings(row.sync?.blockers), nextSteps: strings(row.sync?.nextSteps),
      branch: publicText(row.sync?.verified.endBranch || row.startSnapshot.branch,255), commits: (row.sync?.verified.commits || []).slice(0,100).map(commit => ({ shortHash: commit.shortHash.slice(0,12), subject: publicText(commit.subject,500) })),
      reflections: records.filter(note => note.kind === "reflection" && note.payload.sessionId === row.id && note.payload.publicConsent === true && !note.deletedAt).map(note => ({ id: note.id, authorName: publicText(note.authorName,120), text: publicText(note.payload.text,8000) })),
    })), evidenceNotice: "Handoffs and Git metadata are supplied by the coding agent. This portfolio does not independently verify code changes or measure anyone’s effort.",
  };
  return { snapshot, previewHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

export async function publishPortfolio(actor: Actor, teamId: string, projectId: string, raw: unknown) {
  const input = portfolioFields.extend({ previewHash: z.string().regex(/^[a-f0-9]{64}$/), consentConfirmed: z.literal(true) }).parse(raw);
  const preview = await previewPortfolio(actor, teamId, projectId, input);
  if (input.previewHash !== preview.previewHash) throw new WorkspaceError("The selected content changed after preview. Review a new preview before publishing.", 409);
  return saveRecord(actor, newRecord(actor, teamId, projectId, "portfolio", { published: true, snapshot: preview.snapshot, publishedAt: new Date().toISOString(), consentConfirmed: true }), null);
}

export async function listPortfolios(actor: Actor, teamId: string, projectId: string) {
  const scope = await collaborationScope(actor, teamId, projectId);
  return (await readRecords(teamId,projectId)).filter(row => row.kind === "portfolio" && !row.deletedAt && (scope.owner || row.payload.published === true)).map(row => ({ id: row.id, version: row.version, published: row.payload.published === true, title: (row.payload.snapshot as Snapshot).title, publishedAt: row.payload.publishedAt }));
}

export async function revokePortfolio(actor: Actor, teamId: string, projectId: string, id: string, expectedVersion: number) {
  const scope = await collaborationScope(actor, teamId, projectId);
  if (!scope.owner) throw new WorkspaceError("Only the team owner can revoke a portfolio.", 403);
  const row = (await readRecords(teamId,projectId)).find(row => row.kind === "portfolio" && row.id === id);
  if (!row) throw new WorkspaceError("Portfolio not found.",404);
  if (row.version !== expectedVersion) throw new WorkspaceError("The portfolio changed. Reload before revoking.",409);
  return saveRecord(actor, reviseRecord(row, { ...row.payload, published: false, revokedAt: new Date().toISOString() }), row.version);
}

async function publishedRecord(id: string) {
  if (!/^portfolio_[0-9a-f-]{36}$/.test(id)) throw new WorkspaceError("Portfolio not found.",404);
  const row = await findRecord(id);
  if (!row || row.kind !== "portfolio" || row.payload.published !== true || row.deletedAt) throw new WorkspaceError("Portfolio not found or no longer shared.",404);
  return row;
}

export async function publicPortfolio(id: string) {
  const row = await publishedRecord(id);
  const records = await readRecords(row.teamId, row.projectId);
  const snapshot = structuredClone(row.payload.snapshot) as Snapshot;
  // Withdrawing a reflection's consent also removes it from already-shared
  // snapshots, rather than leaving an irrevocable personal note public.
  snapshot.sessions.forEach(session => { session.reflections = session.reflections.filter(note => records.some(source => source.id === note.id && source.kind === "reflection" && source.payload.publicConsent === true && !source.deletedAt)); });
  const feedback = records.filter(item => item.kind === "feedback" && item.payload.portfolioId === id && !item.deletedAt).map(item => ({ id: item.id, authorName: publicText(item.authorName,120), text: publicText(item.payload.text,2000), createdAt: item.createdAt, sessionId: item.payload.sessionId || null, parentId: item.payload.parentId || null }));
  return { id: row.id, publishedAt: row.payload.publishedAt, snapshot, feedback };
}

export async function portfolioFeedback(actor: Actor, id: string, raw: unknown) {
  const row = await publishedRecord(id);
  const input = z.object({ text: z.string().trim().min(1).max(2000), sessionId: z.string().max(128).nullable().default(null), parentId: z.string().max(128).nullable().default(null), publicConsent: z.literal(true) }).parse(raw);
  const snapshot = row.payload.snapshot as Snapshot;
  if (input.sessionId && !snapshot.sessions.some(session => session.id === input.sessionId)) throw new WorkspaceError("Choose a session in this public portfolio.",400);
  const records = await readRecords(row.teamId,row.projectId);
  const feedback = records.filter(item => item.kind === "feedback" && item.payload.portfolioId === id && !item.deletedAt);
  if (feedback.length >= 500) throw new WorkspaceError("This portfolio has reached its feedback limit.",409);
  if (input.parentId && !feedback.some(item => item.id === input.parentId && (item.payload.sessionId || null) === input.sessionId)) throw new WorkspaceError("Reply target not found in this portfolio and session.",400);
  return saveRecord(actor, newRecord(actor,row.teamId,row.projectId,"feedback",{ ...input,text:publicText(input.text,2000),portfolioId:id }),null);
}

export async function feedbackPermissions(actor: Actor, id: string) {
  const row = await publishedRecord(id);
  let owner = false;
  try { owner = (await collaborationScope(actor,row.teamId,row.projectId!)).owner; } catch { /* Public visitors need not belong to the team. */ }
  const records = await readRecords(row.teamId,row.projectId);
  return { name: actor.name, canModerate: owner, removableIds: records.filter(item => item.kind === "feedback" && item.payload.portfolioId === id && !item.deletedAt && (item.authorId === actor.id || owner)).map(item => item.id) };
}

export async function removePortfolioFeedback(actor: Actor, id: string, feedbackId: string) {
  const portfolio = await publishedRecord(id);
  const row = (await readRecords(portfolio.teamId,portfolio.projectId)).find(item => item.id === feedbackId && item.kind === "feedback" && item.payload.portfolioId === id && !item.deletedAt);
  if (!row) throw new WorkspaceError("Feedback not found.",404);
  if (!(await feedbackPermissions(actor,id)).removableIds.includes(feedbackId)) throw new WorkspaceError("Only the author or team owner can remove this feedback.",403);
  const removed = reviseRecord(row,{ ...row.payload,text:"[Removed]" }); removed.deletedAt=new Date().toISOString();
  return saveRecord(actor,removed,row.version);
}

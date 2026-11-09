import { z } from "zod";
import { collaborationScope, findRecord, newRecord, readRecords, reviseRecord, saveRecord, type Actor, type CollaborationRecord } from "./collaboration-records.js";
import { publicText, publicUrl } from "./portfolios.js";
import { WorkspaceError } from "./workspace-model.js";
import { courseAccount } from "./course.js";

const fields = z.object({
  teamId: z.string().min(1), publicConsent: z.literal(true),
  body: z.string().trim().min(3).max(4000),
});
const postFields = fields.extend({
  title: z.string().trim().min(4).max(140),
  category: z.enum(["update", "question", "comparison"]),
  groupName: z.string().trim().max(100).default(""),
  evidenceUrl: publicUrl.default(""),
});
function active(row: CollaborationRecord | undefined, entry: string) {
  return row && row.projectId === null && row.payload.courseEntry === entry
    && row.payload.publicConsent === true && !row.payload.removed && !row.deletedAt;
}
async function thread(id: string) {
  const row = await findRecord(id);
  if (!active(row, "public-discussion")) throw new WorkspaceError("Public discussion not found.", 404);
  return row!;
}
function view(row: CollaborationRecord, actor?: Actor, ownedTeams: string[] = []) {
  return { id: row.id, version: row.version, authorName: publicText(row.authorName, 120),
    createdAt: row.createdAt, body: publicText(row.payload.body, 4000),
    canRemove: !!actor && (actor.id === row.authorId || ownedTeams.includes(row.teamId)) };
}
export async function publicForum(actor?: Actor) {
  const account = actor ? await courseAccount(actor) : null;
  const ownedTeams = account?.teams.filter(t => t.organizer).map(t => t.id) || [];
  const [posts, replies] = await Promise.all([
    readRecords(undefined, null, "post", "public-discussion"),
    readRecords(undefined, null, "reply", "public-discussion-reply"),
  ]);
  const byThread = new Map<string, ReturnType<typeof view>[]>();
  for (const row of replies.filter(r => active(r, "public-discussion-reply"))) {
    const id = String(row.payload.parentId);
    const group = byThread.get(id) || [];
    group.push(view(row, actor, ownedTeams)); byThread.set(id, group);
  }
  return posts.filter(r => active(r, "public-discussion"))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(row => ({
      ...view(row, actor, ownedTeams), title: publicText(row.payload.title, 140),
      category: row.payload.category, groupName: publicText(row.payload.groupName, 100),
      evidenceUrl: row.payload.evidenceUrl, replies: byThread.get(row.id) || [],
    }));
}
export async function postPublicDiscussion(actor: Actor, raw: unknown, parentId?: string) {
  const input = parentId ? fields.parse(raw) : postFields.parse(raw);
  await collaborationScope(actor, input.teamId);
  if (parentId) await thread(parentId);
  const { teamId, ...content } = input;
  const row = newRecord(actor, teamId, null, parentId ? "reply" : "post", {
    ...content, ...(parentId ? { parentId } : {}),
    courseEntry: parentId ? "public-discussion-reply" : "public-discussion",
  });
  await saveRecord(actor, row, null);
  return row.id;
}
export async function removePublicDiscussion(actor: Actor, id: string, raw: unknown, replyId?: string) {
  const { expectedVersion } = z.object({ expectedVersion: z.number().int().positive() }).parse(raw);
  const parent = await thread(id);
  const row = replyId ? await findRecord(replyId) : parent;
  if (!row || (replyId && (!active(row, "public-discussion-reply") || row.payload.parentId !== id))) throw new WorkspaceError("Reply not found.", 404);
  const scope = await collaborationScope(actor, row.teamId);
  if (row.authorId !== actor.id && !scope.owner) throw new WorkspaceError("Only the author or their team organizer can remove this post.", 403);
  if (row.version !== expectedVersion) throw new WorkspaceError("This post changed. Refresh before removing it.", 409);
  await saveRecord(actor, reviseRecord(row, { ...row.payload, removed: true }), expectedVersion);
}

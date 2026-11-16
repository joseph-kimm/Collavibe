import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amendHandoff } from "../src/hosted-evidence.js";
import type { CollaborationSession, Project } from "../src/types.js";
const actor = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002", team = "00000000-0000-0000-0000-000000000003", outsider = "00000000-0000-0000-0000-000000000004";
const base = "a".repeat(40), head = "b".repeat(40), now = "2026-11-16T15:00:00.000Z";
const git = { root: "https://github.com/example/test", branch: "main", head, dirty: false, workingFiles: [], branches: [], recentCommits: [], trackedFiles: [], capturedAt: now };
const project: Project = { id: "project_correction", name: "Test", root: git.root, latestGit: git, createdAt: now, updatedAt: now };
const original: CollaborationSession = { id: "session_correction", projectId: project.id, repoPath: git.root, participant: "Shani", userId: actor, featureId: "feature_done", status: "synced", startSnapshot: { ...git, head: base }, startedAt: now, syncedAt: now, sync: { summary: "Original handoff with old context", workCompleted: [], decisions: [], blockers: [], nextSteps: [], agentReportedFiles: ["timer.js"], verified: { source: "agent_attested", startHead: base, endHead: head, startBranch: "main", endBranch: "main", commits: [], changedFiles: ["timer.js"], workingFiles: [], reportedButUnverified: [] } } };
const amended = amendHandoff(original, actor, { expectedRevision: 0, correctionReason: "Replace inferred context with exact Git range evidence.", commitRange: { baseHead: base, head, commits: [{ hash: head, shortHash: head.slice(0,7), author: "Shani", authoredAt: now, subject: "Timer fix" }] } });
let db: PGlite;
const write = (by = actor, expected = original) => db.query("select public.commit_agent_work($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,null,$5::jsonb,null,$6)", [team,by,JSON.stringify(project),JSON.stringify(amended),JSON.stringify(expected),project.updatedAt]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create table team_members(team_id uuid,user_id uuid); create table team_projects(team_id uuid,project_id text,unique(team_id,project_id)); create table projects(id text primary key,name text,root text,remote text,latest_git jsonb,created_at timestamptz,updated_at timestamptz); create table features(id text primary key,project_id text,payload jsonb,updated_at timestamptz); create table collaboration_sessions(id text primary key,project_id text,payload jsonb,updated_at timestamptz); insert into team_members values('${team}','${actor}'),('${team}','${other}');`);
  const migration = await readFile("supabase/migrations/20261018001000_agent_access.sql", "utf8");
  const fn = migration.slice(migration.indexOf("create or replace function public.commit_agent_work("), migration.indexOf("revoke all on function public.consume_request_limit"));
  await db.exec(fn.replaceAll("'40001'", "'PT409'"));
  await db.query("insert into projects values($1,$2,$3,null,$4::jsonb,$5,$5)", [project.id,project.name,project.root,JSON.stringify(git),now]);
  await db.query("insert into team_projects values($1,$2)", [team,project.id]);
  await db.query("insert into features values('feature_done',$1,$2::jsonb,$3)", [project.id,JSON.stringify({status:"done",checklist:[{done:true}]}),now]);
  await db.query("insert into collaboration_sessions values($1,$2,$3::jsonb,$4)", [original.id,project.id,JSON.stringify(original),now]);
},20000);
afterAll(async () => { await db?.close(); });
describe("session correction atomic database boundary", () => {
  it("rejects other team members, outsiders and stale saved-session snapshots", async () => {
    await expect(write(other)).rejects.toMatchObject({code:"42501"});
    await expect(write(outsider)).rejects.toMatchObject({code:"42501"});
    await expect(write(actor,{...original,intent:"stale"})).rejects.toMatchObject({code:"PT409"});
  });
  it("saves the new revision and original audit snapshot without touching Done work or current Git", async () => {
    await write();
    const session = (await db.query<{payload:CollaborationSession}>("select payload from collaboration_sessions")).rows[0].payload;
    expect(session.syncRevision).toBe(1); expect(session.syncHistory?.[0].sync).toEqual(original.sync);
    expect((await db.query<{payload:any}>("select payload from features")).rows[0].payload).toEqual({status:"done",checklist:[{done:true}]});
    expect((await db.query<{latest_git:any}>("select latest_git from projects")).rows[0].latest_git).toEqual(git);
    await expect(write()).rejects.toMatchObject({code:"PT409"});
  });
});

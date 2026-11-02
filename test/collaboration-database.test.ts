import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
const actor="00000000-0000-0000-0000-000000000001",other="00000000-0000-0000-0000-000000000002",team="00000000-0000-0000-0000-000000000003";
let db:PGlite;
const record=(id="ticket_db_test",version=1)=>({id,teamId:team,projectId:"project_db_test",kind:"ticket",authorId:actor,authorName:"Test",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version,payload:{title:"Database verification"}});
const save=(document:unknown,version:number|null=null,by=actor)=>db.query("select public.save_collaboration_record($1::uuid,$2::jsonb,$3::integer)",[by,JSON.stringify(document),version]);
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create table public.teams(id uuid primary key);create table public.profiles(id uuid primary key);create table public.projects(id text primary key);create table public.team_members(team_id uuid,user_id uuid);create table public.team_projects(team_id uuid,project_id text);grant select on all tables in schema public to service_role;insert into teams values('${team}');insert into profiles values('${actor}'),('${other}');insert into projects values('project_db_test');insert into team_members values('${team}','${actor}');insert into team_projects values('${team}','project_db_test');`);
  await db.exec(await readFile("supabase/migrations/20261102001000_collaboration_records.sql","utf8"));
},20000);
afterAll(async()=>{await db?.close();});
describe("actual PostgreSQL collaboration migration",()=>{
  it("creates durable records and rejects stale revisions and identity changes",async()=>{await save(record());await expect(save(record())).rejects.toMatchObject({code:"PT409"});await save(record(undefined,2),1);await expect(save({...record(undefined,3),authorId:other},2)).rejects.toMatchObject({code:"42501"});const result=await db.query<{version:number}>("select version from collaboration_records where id='ticket_db_test'");expect(result.rows[0].version).toBe(2);});
  it("rejects outsiders, wrong-project links and forged authors",async()=>{await expect(save(record("outsider"),null,other)).rejects.toMatchObject({code:"42501"});await expect(save({...record("foreign"),projectId:"other-project"})).rejects.toMatchObject({code:"PT404"});await expect(save({...record("forged"),authorId:other})).rejects.toMatchObject({code:"42501"});});
  it("keeps private records and the write RPC inaccessible to browser database roles",async()=>{await db.exec("set role anon");await expect(db.query("select * from collaboration_records")).rejects.toMatchObject({code:"42501"});await expect(save(record("anonymous"))).rejects.toMatchObject({code:"42501"});await db.exec("reset role;set role authenticated");await expect(db.query("select * from collaboration_records")).rejects.toMatchObject({code:"42501"});await db.exec("reset role");});
  it("permits visitor feedback only while its parent portfolio is published",async()=>{const portfolio={...record("portfolio_db_test"),kind:"portfolio",payload:{published:true}};await save(portfolio);await save({...record("feedback_db_test"),kind:"feedback",authorId:other,payload:{portfolioId:portfolio.id,text:"A question"}},null,other);await save({...portfolio,version:2,payload:{published:false}},1);await expect(save({...record("feedback_revoked"),kind:"feedback",authorId:other,payload:{portfolioId:portfolio.id}},null,other)).rejects.toMatchObject({code:"42501"});});
});

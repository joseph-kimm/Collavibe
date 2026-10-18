begin;
alter table public.projects add column if not exists archived_at timestamptz;

-- Website edits and MCP claims share the same project lock. Archiving cannot
-- race a claim and leave an active session hidden from the team.
create or replace function public.mutate_workspace(
  target_team uuid, actor uuid, pid text, kind text, document jsonb, expected text default null
) returns void language plpgsql set search_path=public as $$
declare project public.projects; previous jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(pid,0));
  if not exists(select 1 from public.team_members where team_id=target_team and user_id=actor) then
    raise exception 'You do not have access to this team.' using errcode='42501';
  end if;
  if not exists(select 1 from public.team_projects where team_id=target_team and project_id=pid) then
    raise exception 'Project not found in this team.' using errcode='PT404';
  end if;
  select * into project from public.projects where id=pid for update;
  if kind='project' then
    if not exists(select 1 from public.teams where id=target_team and owner_user_id=actor) then
      raise exception 'Only the team owner can change project settings.' using errcode='42501';
    end if;
    if project.updated_at is distinct from expected::timestamptz then
      raise exception 'Project changed. Refresh before saving.' using errcode='PT409';
    end if;
    if document->>'archivedAt' is not null and exists(select 1 from public.collaboration_sessions where project_id=pid and payload->>'status'='active') then
      raise exception 'An agent is working in this project. Sync active sessions before archiving it.' using errcode='PT409';
    end if;
    update public.projects set name=document->>'name', archived_at=(document->>'archivedAt')::timestamptz,
      updated_at=(document->>'updatedAt')::timestamptz where id=pid;
  elsif kind='feature' then
    if project.archived_at is not null then raise exception 'Restore this project before changing it.' using errcode='PT409'; end if;
    if document->>'projectId' is distinct from pid then raise exception 'Invalid feature project.'; end if;
    select payload into previous from public.features where id=document->>'id' for update;
    if found then
      if previous->>'projectId' is distinct from pid then raise exception 'Invalid feature project.' using errcode='42501'; end if;
      if previous->>'updatedAt' is distinct from expected then raise exception 'This feature changed. Refresh before saving.' using errcode='PT409'; end if;
    elsif expected is not null then raise exception 'Feature not found.' using errcode='PT404';
    end if;
    if document->>'archivedAt' is not null and exists(select 1 from public.collaboration_sessions where project_id=pid and payload->>'featureId'=document->>'id' and payload->>'status'='active') then
      raise exception 'An agent is working on this feature. Sync that session before archiving it.' using errcode='PT409';
    end if;
    insert into public.features(id,project_id,payload,updated_at)
    values(document->>'id',pid,document,(document->>'updatedAt')::timestamptz)
    on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  else raise exception 'Invalid workspace operation.';
  end if;
end;
$$;
revoke all on function public.mutate_workspace(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.mutate_workspace(uuid,uuid,text,text,jsonb,text) to service_role;

do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.commit_agent_work(uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,text)'::regprocedure) into definition;
  definition := replace(definition,
    'select * into existing_project from public.projects where id=pid for update;',
    'select * into existing_project from public.projects where id=pid for update;
     if existing_project.archived_at is not null then raise exception ''Restore this project before starting or syncing work.'' using errcode=''PT409''; end if;');
  definition := replace(definition,
    'if existing_feature->>''projectId'' is distinct from pid then',
    'if existing_feature->>''archivedAt'' is not null then raise exception ''Restore this feature before claiming or syncing it.'' using errcode=''PT409''; end if;
     if existing_feature->>''projectId'' is distinct from pid then');
  execute definition;
end;
$migration$;
commit;

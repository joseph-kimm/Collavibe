-- Additive migration. Existing accounts, teams, projects and sessions are preserved.
begin;
create table if not exists public.agent_connections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 120),
  token_hash text not null unique,
  token_prefix text not null,
  expires_at timestamptz not null,
  refresh_hash text unique,
  refresh_expires_at timestamptz,
  client_id text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists agent_connections_member on public.agent_connections(team_id,user_id);
create table if not exists public.oauth_clients (
  id text primary key,
  payload jsonb not null,
  secret_ciphertext text,
  created_at timestamptz not null default now()
);
create table if not exists public.oauth_requests (
  id uuid primary key default gen_random_uuid(),
  browser_hash text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create table if not exists public.oauth_codes (
  code_hash text primary key,
  payload jsonb not null,
  expires_at timestamptz not null
);
create table if not exists public.request_limits (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
alter table public.agent_connections enable row level security;
alter table public.oauth_clients enable row level security;
alter table public.oauth_requests enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.request_limits enable row level security;
revoke all on public.agent_connections, public.oauth_clients, public.oauth_requests, public.oauth_codes, public.request_limits from anon, authenticated;
grant all on public.agent_connections, public.oauth_clients, public.oauth_requests, public.oauth_codes, public.request_limits to service_role;

create or replace function public.consume_request_limit(bucket text, budget integer, seconds integer)
returns boolean language plpgsql set search_path = public as $$
declare total integer;
begin
  insert into public.request_limits(key,attempts,expires_at)
    values(bucket,1,now()+make_interval(secs=>seconds))
  on conflict (key) do update set
    attempts=case when request_limits.expires_at<=now() then 1 else request_limits.attempts+1 end,
    expires_at=case when request_limits.expires_at<=now() then now()+make_interval(secs=>seconds) else request_limits.expires_at end
  returning attempts into total;
  delete from public.request_limits where expires_at < now()-interval '1 day';
  delete from public.oauth_requests where expires_at < now()-interval '1 day';
  delete from public.oauth_codes where expires_at < now()-interval '1 day';
  return total<=budget;
end;
$$;
create or replace function public.consume_oauth_code(request_hash text)
returns jsonb language sql set search_path = public as $$
  delete from public.oauth_codes where code_hash=request_hash and expires_at>now() returning payload;
$$;

-- Serialize each project mutation and compare revisions inside the transaction.
-- A failed claim or sync cannot leave a half-written feature/session/project.
create or replace function public.commit_agent_work(
  target_team uuid, actor uuid, project_data jsonb, session_data jsonb,
  feature_data jsonb default null, expected_session jsonb default null,
  expected_feature text default null, expected_project text default null
) returns void language plpgsql set search_path=public as $$
declare pid text := project_data->>'id'; sid text := session_data->>'id';
  existing_session jsonb; existing_feature jsonb; existing_project public.projects;
begin
  perform pg_advisory_xact_lock(hashtextextended(pid,0));
  if not exists(select 1 from public.team_members where team_id=target_team and user_id=actor) then
    raise exception 'You do not have access to this team.' using errcode='42501';
  end if;
  if exists(select 1 from public.team_projects where project_id=pid and team_id<>target_team) then
    raise exception 'This repository belongs to another team.' using errcode='42501';
  end if;
  if session_data->>'userId' is distinct from actor::text or session_data->>'projectId' is distinct from pid then
    raise exception 'Invalid session identity.' using errcode='42501';
  end if;
  select * into existing_project from public.projects where id=pid for update;
  if found and expected_project is not null and existing_project.updated_at<>expected_project::timestamptz then
    raise exception 'Project changed. Reload context and retry.' using errcode='40001';
  end if;
  select payload into existing_session from public.collaboration_sessions where id=sid for update;
  if found then
    if existing_session is distinct from expected_session then
      raise exception 'Session changed. Reload context before retrying.' using errcode='40001';
    end if;
    if existing_session->>'userId' is distinct from actor::text then
      raise exception 'This session belongs to another teammate.' using errcode='42501';
    end if;
  elsif expected_session is not null then
    raise exception 'Session no longer exists.' using errcode='40001';
  end if;
  if feature_data is not null then
    if feature_data->>'projectId' is distinct from pid then raise exception 'Invalid feature project.'; end if;
    select payload into existing_feature from public.features where id=feature_data->>'id' for update;
    if found then
      if existing_feature->>'projectId' is distinct from pid then raise exception 'Invalid feature project.' using errcode='42501'; end if;
      if existing_feature->>'updatedAt' is distinct from expected_feature then
        raise exception 'Feature changed. Reload context before retrying.' using errcode='40001';
      end if;
    elsif expected_feature is not null then raise exception 'Feature no longer exists.' using errcode='40001';
    end if;
  end if;
  insert into public.projects(id,name,root,remote,latest_git,created_at,updated_at)
  values(pid,project_data->>'name',project_data->>'root',project_data->>'remote',project_data->'latestGit',
    (project_data->>'createdAt')::timestamptz,(project_data->>'updatedAt')::timestamptz)
  on conflict(id) do update set latest_git=excluded.latest_git,updated_at=excluded.updated_at;
  insert into public.team_projects(team_id,project_id) values(target_team,pid) on conflict do nothing;
  if feature_data is not null then
    insert into public.features(id,project_id,payload,updated_at)
    values(feature_data->>'id',pid,feature_data,(feature_data->>'updatedAt')::timestamptz)
    on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  end if;
  insert into public.collaboration_sessions(id,project_id,payload,updated_at)
  values(sid,pid,session_data,coalesce(session_data->>'syncedAt',session_data->>'startedAt')::timestamptz)
  on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.consume_request_limit(text,integer,integer), public.consume_oauth_code(text), public.commit_agent_work(uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.consume_request_limit(text,integer,integer), public.consume_oauth_code(text), public.commit_agent_work(uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,text) to service_role;
commit;

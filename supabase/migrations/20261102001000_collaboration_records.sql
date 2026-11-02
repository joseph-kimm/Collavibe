begin;
create table if not exists public.collaboration_records (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id text references public.projects(id) on delete cascade,
  kind text not null check(kind in ('reflection','reply','ticket','meeting','portfolio','feedback','intake','post')),
  author_id uuid not null references public.profiles(id),
  version integer not null check(version > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collaboration_records_scope on public.collaboration_records(team_id,project_id,kind);
alter table public.collaboration_records enable row level security;
revoke all on public.collaboration_records from public,anon,authenticated;
grant all on public.collaboration_records to service_role;

-- All browser and MCP writes share this compare-and-swap boundary. No public
-- table policy exposes notes, course intake, transcripts, or publication drafts.
create or replace function public.save_collaboration_record(actor_id uuid,document jsonb,expected_version integer default null)
returns void language plpgsql set search_path=public as $$
declare old public.collaboration_records; tid uuid; pid text; k text; member boolean;
begin
  tid := (document->>'teamId')::uuid; pid := document->>'projectId'; k := document->>'kind';
  perform pg_advisory_xact_lock(hashtextextended(document->>'id',0));
  select * into old from public.collaboration_records where id=document->>'id' for update;
  if found then
    if old.version is distinct from expected_version then raise exception 'This record changed. Reload before saving.' using errcode='PT409'; end if;
    if old.team_id<>tid or old.project_id is distinct from pid or old.kind<>k or old.author_id<>(document->>'authorId')::uuid then
      raise exception 'Record identity cannot change.' using errcode='42501';
    end if;
  elsif expected_version is not null then raise exception 'Record not found.' using errcode='PT404';
  end if;
  member := exists(select 1 from public.team_members where team_id=tid and user_id=actor_id);
  if not member and not (k='feedback' and exists(select 1 from public.collaboration_records p
    where p.id=document->'payload'->>'portfolioId' and p.kind='portfolio' and p.team_id=tid and p.project_id=pid
      and p.payload->'payload'->>'published'='true' and p.payload->>'deletedAt' is null)) then
    raise exception 'You do not have access to this team.' using errcode='42501';
  end if;
  if pid is not null and not exists(select 1 from public.team_projects where team_id=tid and project_id=pid) then
    raise exception 'Project not found in this team.' using errcode='PT404';
  end if;
  if not exists(select 1 from public.profiles where id=actor_id) then raise exception 'Unknown user.' using errcode='42501'; end if;
  if old.id is null and (document->>'authorId')::uuid<>actor_id then raise exception 'Invalid author.' using errcode='42501'; end if;
  if (document->>'version')::integer<>coalesce(expected_version,0)+1 then raise exception 'Invalid revision.' using errcode='PT409'; end if;
  insert into public.collaboration_records(id,team_id,project_id,kind,author_id,version,payload,created_at,updated_at)
    values(document->>'id',tid,pid,k,(document->>'authorId')::uuid,(document->>'version')::integer,document,(document->>'createdAt')::timestamptz,(document->>'updatedAt')::timestamptz)
    on conflict(id) do update set version=excluded.version,payload=excluded.payload,updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.save_collaboration_record(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_collaboration_record(uuid,jsonb,integer) to service_role;
commit;

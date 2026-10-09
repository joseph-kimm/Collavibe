create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  join_code text not null unique check (join_code ~ '^[A-Z2-9]{8}$'),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.projects (
  id text primary key,
  name text not null,
  root text not null,
  remote text,
  latest_git jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_projects (
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, project_id),
  unique (project_id)
);

create table if not exists public.features (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.collaboration_sessions (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), coalesce(new.email, ''))
  on conflict (id) do update set name = excluded.name, email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_team_member(check_team_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = check_team_id and user_id = check_user_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.team_projects enable row level security;
alter table public.features enable row level security;
alter table public.collaboration_sessions enable row level security;

create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read teams" on public.teams for select to authenticated using (public.is_team_member(id));
create policy "owners create teams" on public.teams for insert to authenticated with check (owner_user_id = auth.uid());
create policy "owners update teams" on public.teams for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "members read memberships" on public.team_members for select to authenticated using (public.is_team_member(team_id));
create policy "members read team projects" on public.team_projects for select to authenticated using (public.is_team_member(team_id));
create policy "members read projects" on public.projects for select to authenticated using (
  exists (select 1 from public.team_projects tp where tp.project_id = id and public.is_team_member(tp.team_id))
);
create policy "members read features" on public.features for select to authenticated using (
  exists (select 1 from public.team_projects tp where tp.project_id = project_id and public.is_team_member(tp.team_id))
);
create policy "members read sessions" on public.collaboration_sessions for select to authenticated using (
  exists (select 1 from public.team_projects tp where tp.project_id = project_id and public.is_team_member(tp.team_id))
);

revoke all on public.profiles, public.teams, public.team_members, public.projects, public.team_projects, public.features, public.collaboration_sessions from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.teams to authenticated;
grant select on public.team_members, public.projects, public.team_projects, public.features, public.collaboration_sessions to authenticated;
grant all on public.profiles, public.teams, public.team_members, public.projects, public.team_projects, public.features, public.collaboration_sessions to service_role;
grant execute on function public.is_team_member(uuid, uuid) to authenticated, service_role;

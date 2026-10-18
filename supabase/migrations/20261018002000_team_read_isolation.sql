begin;
-- Qualify outer columns: an unqualified project_id inside the subquery resolves
-- to team_projects.project_id, making the comparison tautological.
drop policy if exists "members read features" on public.features;
create policy "members read features" on public.features for select to authenticated using (
  exists (select 1 from public.team_projects tp where tp.project_id = public.features.project_id and public.is_team_member(tp.team_id))
);
drop policy if exists "members read sessions" on public.collaboration_sessions;
create policy "members read sessions" on public.collaboration_sessions for select to authenticated using (
  exists (select 1 from public.team_projects tp where tp.project_id = public.collaboration_sessions.project_id and public.is_team_member(tp.team_id))
);
commit;

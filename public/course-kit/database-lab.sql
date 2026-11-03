-- Vibecode 101: a real PostgreSQL RLS experiment with fake identities.
-- Run in a DISPOSABLE Supabase project, using its SQL editor as postgres.
-- No real auth users, account secrets, or application tables are used.
-- All changes are rolled back. If execution stops, run ROLLBACK before retrying.
begin;
create schema vibecode101_lab;
create table vibecode101_lab.notes (id integer primary key,owner_id uuid not null,body text not null);
alter table vibecode101_lab.notes enable row level security;
grant usage on schema vibecode101_lab to authenticated,anon;
grant select,insert,update,delete on vibecode101_lab.notes to authenticated;
grant select on vibecode101_lab.notes to anon;
create policy own_notes on vibecode101_lab.notes to authenticated
  using (owner_id=auth.uid()) with check (owner_id=auth.uid());
insert into vibecode101_lab.notes values
  (1,'00000000-0000-0000-0000-000000000001','Fictional Alice note'),
  (2,'00000000-0000-0000-0000-000000000002','Fictional Bob note');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
-- Alice should read exactly her row, not Bob's.
do $$ begin
  if (select count(*) from vibecode101_lab.notes)<>1 then raise exception 'FAIL: own-row read'; end if;
  if exists(select 1 from vibecode101_lab.notes where id=2) then raise exception 'FAIL: other-user read'; end if;
end $$;
-- Alice can add her own row.
insert into vibecode101_lab.notes values(3,'00000000-0000-0000-0000-000000000001','Another fictional Alice note');
-- Alice cannot forge ownership of Bob's row. Catch the EXPECTED denial.
do $$ begin
  begin
    insert into vibecode101_lab.notes values(4,'00000000-0000-0000-0000-000000000002','Forbidden write');
    raise exception 'FAIL: a forbidden write succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
select 'PASS: Alice reads her rows, cannot read Bob, can write own, cannot forge Bob' as check_result;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from vibecode101_lab.notes)<>1 then raise exception 'FAIL: Bob isolation'; end if;
end $$;
select 'PASS: Bob sees only his row' as check_result;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if (select count(*) from vibecode101_lab.notes)<>0 then raise exception 'FAIL: anonymous read'; end if;
end $$;
select 'PASS: logged-out reads return no rows' as check_result;
rollback;
-- Record the PASS outputs. The final rollback intentionally removes this lab.
-- Explain why testing as postgres alone would NOT establish user isolation.

-- Application revision conflicts are not database serialization failures.
-- PT409 is PostgREST's explicit HTTP 409 response and avoids infrastructure
-- retries of SQLSTATE 40001, which can never succeed with the same stale input.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.commit_agent_work(uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,text)'::regprocedure) into definition;
  execute replace(definition, '''40001''', '''PT409''');
end;
$migration$;

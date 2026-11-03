begin;
alter table public.collaboration_records drop constraint if exists collaboration_records_kind_check;
alter table public.collaboration_records add constraint collaboration_records_kind_check
  check(kind in ('reflection','reply','ticket','meeting','portfolio','feedback','intake','post','course_settings','course_submission'));
-- Existing service-only table/RPC grants and optimistic revisions remain intact.
commit;

alter table public.agent_connections add column if not exists resource text not null default 'https://collavibe.vercel.app/mcp';

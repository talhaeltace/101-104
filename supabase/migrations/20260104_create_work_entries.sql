-- Mesai (work/overtime) entries: dedicated source-of-truth for time accounting
-- This avoids deriving payroll-like calculations from generic activity logs.

create table if not exists public.work_entries (
  id bigserial primary key,
  user_id text not null,
  username text not null,

  location_id text null,
  location_name text null,

  departed_at timestamptz null,
  arrived_at timestamptz not null,
  completed_at timestamptz not null,

  travel_minutes integer not null default 0,
  work_minutes integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_work_entries_completed_at on public.work_entries (completed_at desc);
create index if not exists idx_work_entries_user_completed on public.work_entries (user_id, completed_at desc);
create index if not exists idx_work_entries_username_completed on public.work_entries (username, completed_at desc);

-- Allow the anon role to insert/select so the client can log mesai entries from the browser.
-- In production you should replace this with RLS policies that validate auth and claims.
grant select, insert on public.work_entries to anon;
grant usage, select on sequence public.work_entries_id_seq to anon;

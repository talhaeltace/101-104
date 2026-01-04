-- Create acceptance approval workflow table
create table if not exists public.location_acceptance_requests (
  id bigserial primary key,
  location_id text not null,
  location_name text not null,
  requested_by_user_id text not null,
  requested_by_username text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by_user_id text null,
  reviewed_by_username text null
);

create index if not exists idx_location_acceptance_requests_status_created
  on public.location_acceptance_requests (status, created_at desc);

create index if not exists idx_location_acceptance_requests_location
  on public.location_acceptance_requests (location_id);

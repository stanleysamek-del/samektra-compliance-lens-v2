-- Cost tracking + admin role
-- ============================================================================

-- Mark some users as admin. Default false.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Helper function. Uses security definer so it bypasses RLS during the
-- lookup, otherwise an RLS policy that calls SELECT on profiles from a
-- policy on profiles would recurse infinitely.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where user_id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Per-call ledger of every analyzeImage() invocation.
create table if not exists public.ai_calls (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  inspection_id   uuid references public.inspections(id) on delete set null,
  photo_id        uuid references public.photos(id) on delete set null,
  provider        text not null check (provider in ('anthropic','openai')),
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cost_usd        numeric(12,6) not null default 0,
  duration_ms     integer not null default 0,
  status          text not null check (status in ('success','error')),
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists ai_calls_user_id_idx on public.ai_calls(user_id);
create index if not exists ai_calls_created_at_idx on public.ai_calls(created_at desc);
create index if not exists ai_calls_provider_idx on public.ai_calls(provider);

alter table public.ai_calls enable row level security;

-- A user can read their OWN calls.
drop policy if exists "ai_calls_owner_select" on public.ai_calls;
create policy "ai_calls_owner_select" on public.ai_calls
  for select using (auth.uid() = user_id);

-- Admins can read EVERYONE's calls. Uses public.is_admin() to avoid RLS
-- recursion against profiles.
drop policy if exists "ai_calls_admin_select" on public.ai_calls;
create policy "ai_calls_admin_select" on public.ai_calls
  for select using (public.is_admin());

-- Insert: any authenticated user can insert a row for themselves.
drop policy if exists "ai_calls_owner_insert" on public.ai_calls;
create policy "ai_calls_owner_insert" on public.ai_calls
  for insert with check (auth.uid() = user_id);

-- Profiles: admins can read everyone's profile (so dashboards can show
-- "spend by user" with names instead of UUIDs).
drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select" on public.profiles
  for select using (public.is_admin());

-- User profiles — collected at first sign-in via /onboarding form.
-- One-to-one with auth.users.

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  phone        text,
  title        text,        -- e.g., "Safety Inspector", "Facilities Manager"
  organization text,        -- facility / company / firm
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_owner_select" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles_owner_insert" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles_owner_update" on public.profiles
  for update using (auth.uid() = user_id);

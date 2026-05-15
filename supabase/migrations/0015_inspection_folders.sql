-- =====================================================================
-- Phase 2 — Inspection folders (UI label: "Groups")
-- =====================================================================
-- Org-scoped containers for organizing inspections. Free-form naming:
-- teams can label them by Hospital, Location, Type, Quarter, anything.
-- Single level (no nesting) keeps the UX simple and matches what real
-- compliance teams actually use day-to-day.
--
-- Permissions: any org member can create / rename / delete folders and
-- move inspections between them. Tightening can come in Phase 4.
--
-- Personal-workspace inspections cannot be foldered — folders only live
-- inside organizations.
-- =====================================================================

create table if not exists public.inspection_folders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  sort_order      integer not null default 0,
  color           text,  -- optional 6-char hex string for visual tagging
  created_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at      timestamptz not null default now()
);

create index if not exists inspection_folders_org_idx
  on public.inspection_folders(organization_id, sort_order);

alter table public.inspections
  add column if not exists folder_id uuid
    references public.inspection_folders(id) on delete set null;

create index if not exists inspections_folder_idx
  on public.inspections(folder_id)
  where folder_id is not null;

alter table public.inspection_folders enable row level security;

drop policy if exists "folders_member_select" on public.inspection_folders;
create policy "folders_member_select" on public.inspection_folders
  for select using (public.is_org_member(organization_id));

drop policy if exists "folders_member_insert" on public.inspection_folders;
create policy "folders_member_insert" on public.inspection_folders
  for insert with check (public.is_org_member(organization_id));

drop policy if exists "folders_member_update" on public.inspection_folders;
create policy "folders_member_update" on public.inspection_folders
  for update using (public.is_org_member(organization_id));

drop policy if exists "folders_member_delete" on public.inspection_folders;
create policy "folders_member_delete" on public.inspection_folders
  for delete using (public.is_org_member(organization_id));

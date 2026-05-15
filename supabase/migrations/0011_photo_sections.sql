-- Photo organization — group photos within an inspection into named sections
-- ("Stair B", "Main Corridor", "Electrical Room 2", etc.). Sections are
-- per-inspection, owned by the inspection's creator, and freely orderable.
--
-- Existing photos are unassigned (section_id IS NULL) and render under an
-- "Unassigned" group at the top of the photos list. Inspectors can move
-- photos into sections individually; bulk-move and drag-to-reorder come
-- in a future Phase 2 once the data model has shaken out in practice.

create table if not exists public.inspection_sections (
  id              uuid primary key default gen_random_uuid(),
  inspection_id   uuid not null references public.inspections(id) on delete cascade,
  created_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name            text not null,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists inspection_sections_inspection_idx
  on public.inspection_sections(inspection_id, sort_order);
create index if not exists inspection_sections_created_by_idx
  on public.inspection_sections(created_by);

alter table public.inspection_sections enable row level security;

drop policy if exists "sections_owner_select" on public.inspection_sections;
create policy "sections_owner_select" on public.inspection_sections
  for select using (auth.uid() = created_by);

drop policy if exists "sections_owner_insert" on public.inspection_sections;
create policy "sections_owner_insert" on public.inspection_sections
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id and i.created_by = auth.uid()
    )
  );

drop policy if exists "sections_owner_update" on public.inspection_sections;
create policy "sections_owner_update" on public.inspection_sections
  for update using (auth.uid() = created_by);

drop policy if exists "sections_owner_delete" on public.inspection_sections;
create policy "sections_owner_delete" on public.inspection_sections
  for delete using (auth.uid() = created_by);

-- Photos gain an optional section pointer and a per-section sort order.
alter table public.photos
  add column if not exists section_id uuid
    references public.inspection_sections(id) on delete set null;

alter table public.photos
  add column if not exists sort_order integer not null default 0;

create index if not exists photos_section_idx
  on public.photos(section_id, sort_order)
  where section_id is not null;

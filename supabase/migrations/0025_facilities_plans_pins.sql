-- 0025: Facilities, floor plans, and pins.
--
-- The facility becomes a real object that OUTLIVES an inspection: it owns
-- its life-safety plans / architectural drawings, uploaded once and reused
-- by every inspection and (later) every technician round. A pin on a plan
-- is polymorphic — a finding, a photo, a device (0026), or a plain note —
-- so the same viewer, the same move/delete/label controls, serve the
-- inspector dropping "the penetration is HERE" and the tech placing an
-- extinguisher's home location.
--
-- Storage: plan images live in the existing private `drawings` bucket
-- (0001) under <facility_id>/<file>. The bucket's original owner-folder
-- policies stay; facility-scoped policies are added so org members can
-- read each other's plans.

-- ---- Facilities -------------------------------------------------------

create table if not exists public.facilities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name            text not null,
  address         text,
  occupancy       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists facilities_org_idx on public.facilities(organization_id);
create index if not exists facilities_creator_idx on public.facilities(created_by);

alter table public.inspections
  add column if not exists facility_id uuid references public.facilities(id) on delete set null;
create index if not exists inspections_facility_idx on public.inspections(facility_id);

-- Access helpers (security definer, same pattern as can_access_inspection).
create or replace function public.can_access_facility(_facility_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.facilities f
    where f.id = _facility_id
      and (f.created_by = auth.uid()
        or (f.organization_id is not null and public.is_org_member(f.organization_id)))
  );
$$;
create or replace function public.can_write_facility(_facility_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.facilities f
    where f.id = _facility_id
      and (f.created_by = auth.uid()
        or (f.organization_id is not null and exists (
              select 1 from public.organization_members m
              where m.organization_id = f.organization_id
                and m.user_id = auth.uid()
                and m.role in ('admin', 'member'))))
  );
$$;
grant execute on function public.can_access_facility(uuid) to authenticated;
grant execute on function public.can_write_facility(uuid) to authenticated;

alter table public.facilities enable row level security;
drop policy if exists "facilities_select" on public.facilities;
create policy "facilities_select" on public.facilities
  for select using (public.can_access_facility(id) or public.is_admin());
drop policy if exists "facilities_insert" on public.facilities;
create policy "facilities_insert" on public.facilities
  for insert with check (
    created_by = auth.uid()
    and (organization_id is null or public.is_org_member(organization_id))
  );
drop policy if exists "facilities_update" on public.facilities;
create policy "facilities_update" on public.facilities
  for update using (public.can_write_facility(id));
drop policy if exists "facilities_delete" on public.facilities;
create policy "facilities_delete" on public.facilities
  for delete using (public.can_write_facility(id));

-- ---- Plans ------------------------------------------------------------

create table if not exists public.facility_plans (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities(id) on delete cascade,
  created_by    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name          text not null,
  -- Rasterized page image (PNG/JPEG) in the `drawings` bucket.
  storage_path  text not null,
  -- The uploaded source (PDF or original image), when kept.
  source_path   text,
  page          integer not null default 1,
  width         integer,
  height        integer,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists facility_plans_facility_idx on public.facility_plans(facility_id, sort);

alter table public.facility_plans enable row level security;
drop policy if exists "plans_select" on public.facility_plans;
create policy "plans_select" on public.facility_plans
  for select using (public.can_access_facility(facility_id) or public.is_admin());
drop policy if exists "plans_insert" on public.facility_plans;
create policy "plans_insert" on public.facility_plans
  for insert with check (created_by = auth.uid() and public.can_write_facility(facility_id));
drop policy if exists "plans_update" on public.facility_plans;
create policy "plans_update" on public.facility_plans
  for update using (public.can_write_facility(facility_id));
drop policy if exists "plans_delete" on public.facility_plans;
create policy "plans_delete" on public.facility_plans
  for delete using (public.can_write_facility(facility_id));

-- ---- Pins -------------------------------------------------------------

create table if not exists public.plan_pins (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.facility_plans(id) on delete cascade,
  facility_id    uuid not null references public.facilities(id) on delete cascade,
  kind           text not null check (kind in ('finding', 'photo', 'device', 'note')),
  inspection_id  uuid references public.inspections(id) on delete cascade,
  finding_id     uuid references public.findings(id) on delete cascade,
  photo_id       uuid references public.photos(id) on delete set null,
  asset_id       uuid,  -- FK added in 0026 once assets exist
  -- Normalized 0..1 so the pin survives any re-render size.
  x              numeric(7,6) not null check (x >= 0 and x <= 1),
  y              numeric(7,6) not null check (y >= 0 and y <= 1),
  label          text,
  created_by     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists plan_pins_plan_idx on public.plan_pins(plan_id);
create index if not exists plan_pins_inspection_idx on public.plan_pins(inspection_id) where inspection_id is not null;
create index if not exists plan_pins_finding_idx on public.plan_pins(finding_id) where finding_id is not null;

alter table public.plan_pins enable row level security;
drop policy if exists "pins_select" on public.plan_pins;
create policy "pins_select" on public.plan_pins
  for select using (public.can_access_facility(facility_id) or public.is_admin());
drop policy if exists "pins_insert" on public.plan_pins;
create policy "pins_insert" on public.plan_pins
  for insert with check (created_by = auth.uid() and public.can_write_facility(facility_id));
drop policy if exists "pins_update" on public.plan_pins;
create policy "pins_update" on public.plan_pins
  for update using (public.can_write_facility(facility_id));
drop policy if exists "pins_delete" on public.plan_pins;
create policy "pins_delete" on public.plan_pins
  for delete using (public.can_write_facility(facility_id));

-- ---- Storage: facility-scoped access to the `drawings` bucket ---------
-- Object path convention: <facility_id>/<filename>. The first folder is
-- the facility id, so access follows the facility, not the uploader.

drop policy if exists "drawings_facility_read" on storage.objects;
create policy "drawings_facility_read" on storage.objects
  for select using (
    bucket_id = 'drawings'
    and (
      public.can_access_facility(((storage.foldername(name))[1])::uuid)
      or public.is_admin()
    )
  );
drop policy if exists "drawings_facility_write" on storage.objects;
create policy "drawings_facility_write" on storage.objects
  for insert with check (
    bucket_id = 'drawings'
    and public.can_write_facility(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "drawings_facility_delete" on storage.objects;
create policy "drawings_facility_delete" on storage.objects
  for delete using (
    bucket_id = 'drawings'
    and public.can_write_facility(((storage.foldername(name))[1])::uuid)
  );

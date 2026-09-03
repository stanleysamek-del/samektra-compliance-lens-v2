-- 0026: Devices (assets) — the technician module's foundation.
--
-- A device is a physical thing with a barcode and a home on the plan:
-- extinguisher, emergency light, exit sign, fire door, pull station,
-- sprinkler riser, ... A technician scans the barcode, lands on the
-- device page, runs the checklist for that device type (NFPA 10 monthly,
-- emergency-light 30-second test, fire-door annual, ...) and records the
-- result. The location is placed on the plan ONCE (a 'device' pin from
-- 0025) and every later scan shows where it is.
--
-- Schema only in this migration — the UI (Technician mode, scan flow,
-- per-type checklists) is the next build. Shipping the tables now means
-- the plan/pin model never has to be re-modeled for it.

create table if not exists public.assets (
  id               uuid primary key default gen_random_uuid(),
  facility_id      uuid not null references public.facilities(id) on delete cascade,
  created_by       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type             text not null check (type in (
                     'extinguisher', 'emergency_light', 'exit_sign', 'fire_door',
                     'pull_station', 'smoke_detector', 'sprinkler_riser', 'fire_damper',
                     'eyewash', 'aed', 'other')),
  barcode          text,
  label            text,            -- "FE-2W-014", "Stair B door"
  location_text    text,            -- "2 West corridor by Rm 217"
  manufacturer     text,
  model            text,
  serial           text,
  install_date     date,
  last_inspected_at timestamptz,
  next_due_at      timestamptz,
  status           text not null default 'in_service'
                   check (status in ('in_service', 'out_of_service', 'removed')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists assets_facility_barcode_uidx
  on public.assets(facility_id, barcode) where barcode is not null;
create index if not exists assets_facility_type_idx on public.assets(facility_id, type);

alter table public.assets enable row level security;
drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select using (public.can_access_facility(facility_id) or public.is_admin());
drop policy if exists "assets_insert" on public.assets;
create policy "assets_insert" on public.assets
  for insert with check (created_by = auth.uid() and public.can_write_facility(facility_id));
drop policy if exists "assets_update" on public.assets;
create policy "assets_update" on public.assets
  for update using (public.can_write_facility(facility_id));
drop policy if exists "assets_delete" on public.assets;
create policy "assets_delete" on public.assets
  for delete using (public.can_write_facility(facility_id));

-- Now that assets exist, wire the pin FK promised in 0025.
alter table public.plan_pins
  drop constraint if exists plan_pins_asset_id_fkey;
alter table public.plan_pins
  add constraint plan_pins_asset_id_fkey
  foreign key (asset_id) references public.assets(id) on delete cascade;

-- Per-device inspection records (a technician round produces many).
create table if not exists public.asset_inspections (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.assets(id) on delete cascade,
  facility_id    uuid not null references public.facilities(id) on delete cascade,
  inspection_id  uuid references public.inspections(id) on delete set null,
  performed_by   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  performed_at   timestamptz not null default now(),
  result         text not null check (result in ('pass', 'fail', 'na')),
  -- Snapshot of the per-type checklist answered: [{q, answer, note}]
  checklist      jsonb not null default '[]'::jsonb,
  notes          text,
  photo_id       uuid references public.photos(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists asset_inspections_asset_idx
  on public.asset_inspections(asset_id, performed_at desc);

alter table public.asset_inspections enable row level security;
drop policy if exists "asset_insp_select" on public.asset_inspections;
create policy "asset_insp_select" on public.asset_inspections
  for select using (public.can_access_facility(facility_id) or public.is_admin());
drop policy if exists "asset_insp_insert" on public.asset_inspections;
create policy "asset_insp_insert" on public.asset_inspections
  for insert with check (performed_by = auth.uid() and public.can_write_facility(facility_id));
drop policy if exists "asset_insp_delete" on public.asset_inspections;
create policy "asset_insp_delete" on public.asset_inspections
  for delete using (public.can_write_facility(facility_id));

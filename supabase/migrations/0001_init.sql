-- Compliance Lens v2 — initial schema
-- Personal isolation: every row scoped to auth.uid().
-- Nullable facility_id reserved for future team-sharing.

-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.inspections (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  facility_id     uuid,                       -- reserved for team-sharing; null today
  facility_name   text not null,
  facility_address text,
  inspector_name  text,
  manager_assigned text,
  manager_assigned_email text,
  date_of_inspection date,
  date_assigned   date,
  location        text,                       -- department / smoke compartment / suite
  status          text not null default 'in_progress'
                  check (status in ('in_progress', 'completed', 'archived')),
  inspector_signature_url text,
  manager_signature_url   text,
  inspector_signed_at     timestamptz,
  manager_signed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists inspections_created_by_idx on public.inspections(created_by);
create index if not exists inspections_status_idx on public.inspections(status);

create trigger inspections_set_updated_at
  before update on public.inspections
  for each row execute function public.set_updated_at();

create table if not exists public.photos (
  id              uuid primary key default gen_random_uuid(),
  inspection_id   uuid not null references public.inspections(id) on delete cascade,
  created_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  storage_path    text not null,              -- supabase storage object path
  width           integer,
  height          integer,
  photo_location  text,                       -- per-photo override of inspection.location
  raw_analysis    jsonb,                      -- full /api/analyze response
  analyzed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists photos_inspection_id_idx on public.photos(inspection_id);
create index if not exists photos_created_by_idx on public.photos(created_by);

create table if not exists public.findings (
  id              uuid primary key default gen_random_uuid(),
  inspection_id   uuid not null references public.inspections(id) on delete cascade,
  photo_id        uuid references public.photos(id) on delete set null,
  created_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- AI-shape fields, editable by user
  title           text not null,
  category        text not null
                  check (category in ('Fire','Electrical','Egress','ADA','Hazmat','InfectionControl','Structural','Other')),
  code            text,
  severity        text not null
                  check (severity in ('Low','Medium','High')),
  description     text,
  location        text,
  remediation     text,
  "references"    text[] default array[]::text[],
  bbox_x1         real check (bbox_x1 between 0 and 1),
  bbox_y1         real check (bbox_y1 between 0 and 1),
  bbox_x2         real check (bbox_x2 between 0 and 1),
  bbox_y2         real check (bbox_y2 between 0 and 1),
  ai_confidence   real check (ai_confidence between 0 and 1),
  edited          boolean not null default false,
  -- LSRA scoring (filled by inspector or auto-derived)
  lsra_severity   smallint check (lsra_severity between 1 and 4),
  lsra_impact     smallint check (lsra_impact between 1 and 4),
  lsra_risk_level text check (lsra_risk_level in ('High','Medium','Low','No ILSM')),
  -- CAP follow-up (filled by manager)
  manager_corrective_action text,
  manager_followup_comments text,
  cap_status      text default 'open'
                  check (cap_status in ('open','in_progress','resolved','deferred')),
  cap_target_date date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists findings_inspection_id_idx on public.findings(inspection_id);
create index if not exists findings_photo_id_idx on public.findings(photo_id);
create index if not exists findings_created_by_idx on public.findings(created_by);
create index if not exists findings_severity_idx on public.findings(severity);

create trigger findings_set_updated_at
  before update on public.findings
  for each row execute function public.set_updated_at();

create table if not exists public.what_to_look_for (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null references public.photos(id) on delete cascade,
  inspection_id   uuid not null references public.inspections(id) on delete cascade,
  item            text not null,
  details         text,
  created_at      timestamptz not null default now()
);

create index if not exists what_to_look_for_photo_id_idx on public.what_to_look_for(photo_id);

create table if not exists public.not_visible (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null references public.photos(id) on delete cascade,
  inspection_id   uuid not null references public.inspections(id) on delete cascade,
  item            text not null,
  reason          text,
  resolved        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists not_visible_photo_id_idx on public.not_visible(photo_id);

create table if not exists public.drawings (
  id              uuid primary key default gen_random_uuid(),
  inspection_id   uuid not null references public.inspections(id) on delete cascade,
  created_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  storage_path    text not null,
  filename        text,
  description     text,
  created_at      timestamptz not null default now()
);

create index if not exists drawings_inspection_id_idx on public.drawings(inspection_id);

-- ============================================================================
-- Row Level Security — personal isolation
-- ============================================================================

alter table public.inspections      enable row level security;
alter table public.photos           enable row level security;
alter table public.findings         enable row level security;
alter table public.what_to_look_for enable row level security;
alter table public.not_visible      enable row level security;
alter table public.drawings         enable row level security;

-- inspections: owner can do everything
create policy "inspections_owner_select" on public.inspections
  for select using (auth.uid() = created_by);
create policy "inspections_owner_insert" on public.inspections
  for insert with check (auth.uid() = created_by);
create policy "inspections_owner_update" on public.inspections
  for update using (auth.uid() = created_by);
create policy "inspections_owner_delete" on public.inspections
  for delete using (auth.uid() = created_by);

-- photos: owner can do everything; ownership matches parent inspection
create policy "photos_owner_select" on public.photos
  for select using (auth.uid() = created_by);
create policy "photos_owner_insert" on public.photos
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id and i.created_by = auth.uid()
    )
  );
create policy "photos_owner_update" on public.photos
  for update using (auth.uid() = created_by);
create policy "photos_owner_delete" on public.photos
  for delete using (auth.uid() = created_by);

-- findings
create policy "findings_owner_select" on public.findings
  for select using (auth.uid() = created_by);
create policy "findings_owner_insert" on public.findings
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id and i.created_by = auth.uid()
    )
  );
create policy "findings_owner_update" on public.findings
  for update using (auth.uid() = created_by);
create policy "findings_owner_delete" on public.findings
  for delete using (auth.uid() = created_by);

-- what_to_look_for: read scoped via photo ownership
create policy "wtlf_owner_select" on public.what_to_look_for
  for select using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and p.created_by = auth.uid()
    )
  );
create policy "wtlf_owner_write" on public.what_to_look_for
  for all using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and p.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and p.created_by = auth.uid()
    )
  );

-- not_visible: same pattern
create policy "not_visible_owner_select" on public.not_visible
  for select using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and p.created_by = auth.uid()
    )
  );
create policy "not_visible_owner_write" on public.not_visible
  for all using (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and p.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.photos p
      where p.id = photo_id and p.created_by = auth.uid()
    )
  );

-- drawings
create policy "drawings_owner_select" on public.drawings
  for select using (auth.uid() = created_by);
create policy "drawings_owner_insert" on public.drawings
  for insert with check (auth.uid() = created_by);
create policy "drawings_owner_update" on public.drawings
  for update using (auth.uid() = created_by);
create policy "drawings_owner_delete" on public.drawings
  for delete using (auth.uid() = created_by);

-- ============================================================================
-- Storage buckets and policies
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('photos',     'photos',     false),
  ('drawings',   'drawings',   false),
  ('signatures', 'signatures', false)
on conflict (id) do nothing;

-- Owner-only access to objects in each bucket. Object path convention:
--   <bucket>/<user_id>/<inspection_id>/<filename>
-- so the first folder must equal auth.uid().
create policy "photos_owner_objects" on storage.objects
  for all
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "drawings_owner_objects" on storage.objects
  for all
  using (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "signatures_owner_objects" on storage.objects
  for all
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

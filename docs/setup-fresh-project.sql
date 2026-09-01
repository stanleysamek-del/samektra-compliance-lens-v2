-- Compliance Lens v2 — full schema setup for a FRESH Supabase project.
-- Generated 2026-09-01 by concatenating supabase/migrations/0001..0020 in order.
-- Paste into the new project SQL editor and run ONCE on a fresh,
-- empty project. (Not fully re-runnable: 0001 creates policies without
-- drop-if-exists — for incremental changes use the individual files.)

-- ======================================================================
-- >>> 0001_init.sql
-- ======================================================================
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


-- ======================================================================
-- >>> 0002_profiles.sql
-- ======================================================================
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


-- ======================================================================
-- >>> 0003_ai_calls_and_admin.sql
-- ======================================================================
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


-- ======================================================================
-- >>> 0004_admin_read_findings.sql
-- ======================================================================
-- Admin SELECT access to inspections / photos / findings so the cost
-- dashboard can show what the AI actually detected on each call. Uses the
-- same public.is_admin() security-definer function from 0003 to avoid RLS
-- recursion.

drop policy if exists "inspections_admin_select" on public.inspections;
create policy "inspections_admin_select" on public.inspections
  for select using (public.is_admin());

drop policy if exists "photos_admin_select" on public.photos;
create policy "photos_admin_select" on public.photos
  for select using (public.is_admin());

drop policy if exists "findings_admin_select" on public.findings;
create policy "findings_admin_select" on public.findings
  for select using (public.is_admin());


-- ======================================================================
-- >>> 0005_photo_annotations.sql
-- ======================================================================
-- Per-photo annotation layer: shapes (rectangles, circles, arrows) and text
-- the inspector draws on top of a photo. Stored as JSONB on the photos row
-- so we don't need a separate table for what is essentially document-shaped
-- data.
--
-- Each annotation is:
--   { id: string, type: "rect"|"circle"|"arrow"|"text",
--     color: "#hex", x1, y1, x2, y2: number,
--     text?: string }
-- Coordinates are normalized [0, 1] to match the existing bbox system.

alter table public.photos
  add column if not exists annotations jsonb not null default '[]'::jsonb;


-- ======================================================================
-- >>> 0006_finding_bbox_stroke_width.sql
-- ======================================================================
-- Per-finding bbox stroke-width override. Lets the inspector adjust the
-- visual thickness of an AI-detected bbox without affecting any other
-- finding. Stored as a real for flexibility (we use 1 / 2 / 3 today).
alter table public.findings
  add column if not exists bbox_stroke_width real not null default 2;


-- ======================================================================
-- >>> 0007_finding_bbox_color.sql
-- ======================================================================
-- Per-finding bbox color override. NULL means "use the severity-default
-- color" (the existing behavior — red for High/Medium, green for Low).
-- A non-null hex string overrides that default for visual customization
-- without changing the finding's severity.
alter table public.findings
  add column if not exists bbox_color text;


-- ======================================================================
-- >>> 0008_finding_bbox_fill.sql
-- ======================================================================
-- Per-finding bbox fill color override. NULL means no fill (the existing
-- behavior — outline only). A non-null hex string fills the bbox at 25%
-- opacity to tint the area without obscuring the photo.
alter table public.findings
  add column if not exists bbox_fill text;


-- ======================================================================
-- >>> 0009_photo_coach_turns.sql
-- ======================================================================
-- Coach the AI — per-photo conversation thread between inspector and AI.
-- Each turn is a single message; the AI re-runs analysis on every inspector
-- turn and produces an acknowledgment + updated findings + optional
-- clarifying question back. Inspector-edited findings are preserved across
-- coach turns (same delete-non-edited pattern as /api/photos/[id]/reanalyze).
--
-- Phase 2 will use `annotation_ref` to store the bbox/shape the inspector
-- attached to a hint — sent to the AI as "the inspector circled this area".
-- Phase 3 will use ai_meta.requestClarification to drive the AI-asks-back UX.
-- Both fit in this schema without further migrations.

create table if not exists public.photo_coach_turns (
  id               uuid primary key default gen_random_uuid(),
  photo_id         uuid not null references public.photos(id) on delete cascade,
  inspection_id    uuid not null references public.inspections(id) on delete cascade,
  created_by       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  turn_index       integer not null,                      -- 0-based; increments per (photo_id)
  role             text not null
                   check (role in ('inspector', 'ai')),
  text             text not null,                         -- inspector hint OR AI acknowledgment
  annotation_ref   jsonb,                                 -- Phase 2: { x1,y1,x2,y2, type, color } the inspector attached
  ai_meta          jsonb,                                 -- AI-turn payload: { findingsUpdated:int, requestClarification?:{question,options[]}, model, costUsd }
  ai_call_id       uuid references public.ai_calls(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists photo_coach_turns_photo_idx on public.photo_coach_turns(photo_id, turn_index);
create index if not exists photo_coach_turns_inspection_idx on public.photo_coach_turns(inspection_id);
create index if not exists photo_coach_turns_created_by_idx on public.photo_coach_turns(created_by);

-- One row per turn position per photo.
create unique index if not exists photo_coach_turns_photo_turn_uniq
  on public.photo_coach_turns(photo_id, turn_index);

alter table public.photo_coach_turns enable row level security;

-- Owner can read their own turns.
drop policy if exists "coach_turns_owner_select" on public.photo_coach_turns;
create policy "coach_turns_owner_select" on public.photo_coach_turns
  for select using (auth.uid() = created_by);

-- Owner can insert turns into photos they own.
drop policy if exists "coach_turns_owner_insert" on public.photo_coach_turns;
create policy "coach_turns_owner_insert" on public.photo_coach_turns
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.photos p
      where p.id = photo_id and p.created_by = auth.uid()
    )
  );

-- Owner can update their own turns (rare — used for editing a hint).
drop policy if exists "coach_turns_owner_update" on public.photo_coach_turns;
create policy "coach_turns_owner_update" on public.photo_coach_turns
  for update using (auth.uid() = created_by);

-- Owner can delete their own turns (used when clearing a conversation).
drop policy if exists "coach_turns_owner_delete" on public.photo_coach_turns;
create policy "coach_turns_owner_delete" on public.photo_coach_turns
  for delete using (auth.uid() = created_by);

-- Admins can read everyone's coach turns for support / observability —
-- mirrors the ai_calls admin policy.
drop policy if exists "coach_turns_admin_select" on public.photo_coach_turns;
create policy "coach_turns_admin_select" on public.photo_coach_turns
  for select using (public.is_admin());


-- ======================================================================
-- >>> 0010_finding_feedback.sql
-- ======================================================================
-- Per-finding feedback from the inspector. Drives two things:
--   1) Quality signal the AI receives on the next Coach turn — "the inspector
--      thumbs-up'd findings #1 and #3, thumbs-down'd #2", so the model can
--      double down on what's working and stop emitting the bad calls.
--   2) Aggregate analytics later (which categories of findings get downvoted
--      most, where the model is overcalling, etc.).
--
-- Stored as a smallint (1 = liked / good call, -1 = disliked / wrong call,
-- null = no feedback). Lighter than a separate table and matches the
-- one-finding-one-rating shape exactly.

alter table public.findings
  add column if not exists user_rating       smallint
    check (user_rating in (-1, 1));

alter table public.findings
  add column if not exists user_feedback_note text;

-- Index supports "show me everything the inspector thumbs-downed this week"
-- on the admin dashboard later.
create index if not exists findings_user_rating_idx
  on public.findings(user_rating)
  where user_rating is not null;


-- ======================================================================
-- >>> 0011_photo_sections.sql
-- ======================================================================
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


-- ======================================================================
-- >>> 0012_not_visible_resolution.sql
-- ======================================================================
-- Re-photograph workflow. The `not_visible` table already tracks items
-- Chip couldn't verify from the original photo angle (with a `resolved`
-- boolean that has been unused). This migration fills out the resolution
-- side of that lifecycle:
--
--   - resolved_at      : when the inspector marked it verified
--   - resolved_note    : optional free text ("photographed from north angle,
--                        deflector measured 8 in from slab")
--   - resolved_photo_id: optional FK to the new photo that proved it out;
--                        used so the punch-list card can link back to the
--                        confirming photo for audit purposes
--
-- All three are nullable — pre-existing rows stay marked unresolved with
-- empty metadata.

alter table public.not_visible
  add column if not exists resolved_at        timestamptz,
  add column if not exists resolved_note      text,
  add column if not exists resolved_photo_id  uuid
    references public.photos(id) on delete set null;

-- Index supports "show me everything unresolved across this inspection"
-- which the new aggregate punch-list view queries on every render.
create index if not exists not_visible_inspection_unresolved_idx
  on public.not_visible(inspection_id)
  where resolved is not true;


-- ======================================================================
-- >>> 0013_not_visible_skip.sql
-- ======================================================================
-- Re-photograph punch-list, second pass — add a "skip" lifecycle alongside
-- "resolve". A skipped item is one the inspector decided does NOT need a
-- re-photograph: false positive from Chip, out of scope, won't fix, or
-- a deferred-to-next-cycle issue. It stays in the database for audit but
-- drops out of the active to-do list.
--
-- State machine after this migration:
--   resolved=false skipped=false  → OPEN (still on the to-do list)
--   resolved=true                 → RESOLVED (re-photographed + verified)
--   skipped=true                  → SKIPPED (won't be re-photographed)
--
-- resolved + skipped both true is undefined behavior; the UI prevents it.

alter table public.not_visible
  add column if not exists skipped         boolean not null default false,
  add column if not exists skipped_reason  text,
  add column if not exists skipped_at      timestamptz;

create index if not exists not_visible_skipped_idx
  on public.not_visible(inspection_id)
  where skipped is true;


-- ======================================================================
-- >>> 0014_teams_foundation.sql
-- ======================================================================
-- =====================================================================
-- Teams foundation — multi-tenant retrofit
-- =====================================================================
-- Adds organizations, organization_members, organization_invites tables
-- plus the security-definer helper functions and updated RLS policies
-- that let org members share inspection data.
--
-- Design choices (Phase 1, small teams 1-10):
--   - Two roles: 'admin' (manage members + settings) and 'member' (use)
--   - Org creator is auto-promoted to admin via trigger
--   - Inspections can be personal (organization_id IS NULL) or org-scoped
--   - All members of an org can SEE every inspection in that org
--   - All members can INSERT new inspections / photos / findings under the org
--   - Only the row creator OR an org admin can DELETE an inspection
--   - Member-level edit permissions match SELECT (any member can edit any
--     org row) — keeps the team-collaboration UX frictionless; we can
--     tighten this in Phase 4 if real abuse patterns surface
--
-- Invites:
--   - Email-tagged, link-token based (the link itself authorizes acceptance)
--   - 7-day expiry by default
--   - peek_invite() lets the unauthenticated accept-page show org details
--   - accept_invite() atomically adds the user + marks invite consumed
-- =====================================================================

-- 1. Organizations -----------------------------------------------------

create table if not exists public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  created_by   uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists organizations_created_by_idx on public.organizations(created_by);

-- 2. Members -----------------------------------------------------------

create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('admin', 'member')) default 'member',
  joined_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists organization_members_org_idx on public.organization_members(organization_id);

-- 3. Invites -----------------------------------------------------------

create table if not exists public.organization_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('admin', 'member')) default 'member',
  token           text not null unique
                  default replace(gen_random_uuid()::text, '-', ''),
  invited_by      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists organization_invites_org_idx on public.organization_invites(organization_id);
create index if not exists organization_invites_email_idx on public.organization_invites(lower(email));

-- 4. Helper functions --------------------------------------------------
-- security-definer so they bypass RLS on the membership table (otherwise
-- the policies that reference them would recurse infinitely).

create or replace function public.is_org_member(_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = auth.uid()
      and om.role = 'admin'
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- 5. Auto-add creator as admin -----------------------------------------

create or replace function public.add_org_creator_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

drop trigger if exists organizations_auto_add_creator on public.organizations;
create trigger organizations_auto_add_creator
  after insert on public.organizations
  for each row execute function public.add_org_creator_as_admin();

-- 6. Add organization_id to inspections --------------------------------

alter table public.inspections
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists inspections_org_idx
  on public.inspections(organization_id)
  where organization_id is not null;

-- 7. can_access_inspection() — used by every child-row policy -----------

create or replace function public.can_access_inspection(_inspection_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.inspections i
    where i.id = _inspection_id
      and (
        i.created_by = auth.uid()
        or (
          i.organization_id is not null
          and public.is_org_member(i.organization_id)
        )
      )
  );
$$;

grant execute on function public.can_access_inspection(uuid) to authenticated;

-- 8. Invite peek + accept RPCs -----------------------------------------

create or replace function public.peek_invite(_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select i.email, i.role, i.expires_at, i.accepted_at,
         o.name as org_name, o.slug as org_slug
  into v
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where i.token = _token;

  if not found then
    return null;
  end if;

  return json_build_object(
    'email',       v.email,
    'role',        v.role,
    'expires_at',  v.expires_at,
    'accepted_at', v.accepted_at,
    'org_name',    v.org_name,
    'org_slug',    v.org_slug
  );
end;
$$;

create or replace function public.accept_invite(_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.organization_invites
  where token = _token
    and accepted_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invalid or expired invite' using errcode = 'P0001';
  end if;

  -- Idempotent — if user is already a member, just mark the invite consumed.
  insert into public.organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, v_user_id, v_invite.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invites
  set accepted_at = now()
  where id = v_invite.id;

  return v_invite.organization_id;
end;
$$;

grant execute on function public.peek_invite(text)   to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- 9. RLS on organizations / members / invites --------------------------

alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.organization_invites  enable row level security;

drop policy if exists "orgs_member_select" on public.organizations;
create policy "orgs_member_select" on public.organizations
  for select using (
    public.is_org_member(id) or created_by = auth.uid()
  );

drop policy if exists "orgs_authenticated_insert" on public.organizations;
create policy "orgs_authenticated_insert" on public.organizations
  for insert with check (created_by = auth.uid());

drop policy if exists "orgs_admin_update" on public.organizations;
create policy "orgs_admin_update" on public.organizations
  for update using (public.is_org_admin(id));

drop policy if exists "orgs_admin_delete" on public.organizations;
create policy "orgs_admin_delete" on public.organizations
  for delete using (public.is_org_admin(id));

drop policy if exists "members_org_visibility" on public.organization_members;
create policy "members_org_visibility" on public.organization_members
  for select using (public.is_org_member(organization_id));

-- A user can insert their OWN membership row (used by the trigger via
-- security-definer, and as a safety hatch in case manual insert is needed).
drop policy if exists "members_self_insert" on public.organization_members;
create policy "members_self_insert" on public.organization_members
  for insert with check (user_id = auth.uid());

drop policy if exists "members_admin_update" on public.organization_members;
create policy "members_admin_update" on public.organization_members
  for update using (public.is_org_admin(organization_id));

-- Members can remove themselves (leave); admins can remove anyone.
drop policy if exists "members_admin_or_self_delete" on public.organization_members;
create policy "members_admin_or_self_delete" on public.organization_members
  for delete using (
    user_id = auth.uid() or public.is_org_admin(organization_id)
  );

drop policy if exists "invites_admin_select" on public.organization_invites;
create policy "invites_admin_select" on public.organization_invites
  for select using (public.is_org_admin(organization_id));

drop policy if exists "invites_admin_insert" on public.organization_invites;
create policy "invites_admin_insert" on public.organization_invites
  for insert with check (public.is_org_admin(organization_id));

drop policy if exists "invites_admin_delete" on public.organization_invites;
create policy "invites_admin_delete" on public.organization_invites
  for delete using (public.is_org_admin(organization_id));

-- 10. Retrofit existing RLS to allow org members -----------------------

-- inspections
drop policy if exists "inspections_owner_select" on public.inspections;
create policy "inspections_access_select" on public.inspections
  for select using (
    auth.uid() = created_by
    or (organization_id is not null and public.is_org_member(organization_id))
  );

drop policy if exists "inspections_owner_insert" on public.inspections;
create policy "inspections_access_insert" on public.inspections
  for insert with check (
    auth.uid() = created_by
    and (organization_id is null or public.is_org_member(organization_id))
  );

drop policy if exists "inspections_owner_update" on public.inspections;
create policy "inspections_access_update" on public.inspections
  for update using (
    auth.uid() = created_by
    or (organization_id is not null and public.is_org_member(organization_id))
  );

drop policy if exists "inspections_owner_delete" on public.inspections;
create policy "inspections_access_delete" on public.inspections
  for delete using (
    auth.uid() = created_by
    or (organization_id is not null and public.is_org_admin(organization_id))
  );

-- photos
drop policy if exists "photos_owner_select" on public.photos;
drop policy if exists "photos_owner_insert" on public.photos;
drop policy if exists "photos_owner_update" on public.photos;
drop policy if exists "photos_owner_delete" on public.photos;
create policy "photos_access_select" on public.photos
  for select using (public.can_access_inspection(inspection_id));
create policy "photos_access_insert" on public.photos
  for insert with check (
    auth.uid() = created_by
    and public.can_access_inspection(inspection_id)
  );
create policy "photos_access_update" on public.photos
  for update using (public.can_access_inspection(inspection_id));
create policy "photos_access_delete" on public.photos
  for delete using (public.can_access_inspection(inspection_id));

-- findings
drop policy if exists "findings_owner_select" on public.findings;
drop policy if exists "findings_owner_insert" on public.findings;
drop policy if exists "findings_owner_update" on public.findings;
drop policy if exists "findings_owner_delete" on public.findings;
create policy "findings_access_select" on public.findings
  for select using (public.can_access_inspection(inspection_id));
create policy "findings_access_insert" on public.findings
  for insert with check (
    auth.uid() = created_by
    and public.can_access_inspection(inspection_id)
  );
create policy "findings_access_update" on public.findings
  for update using (public.can_access_inspection(inspection_id));
create policy "findings_access_delete" on public.findings
  for delete using (public.can_access_inspection(inspection_id));

-- what_to_look_for + not_visible (scoped via inspection)
drop policy if exists "wtlf_owner_select" on public.what_to_look_for;
drop policy if exists "wtlf_owner_write"  on public.what_to_look_for;
create policy "wtlf_access_select" on public.what_to_look_for
  for select using (public.can_access_inspection(inspection_id));
create policy "wtlf_access_write" on public.what_to_look_for
  for all using (public.can_access_inspection(inspection_id))
  with check (public.can_access_inspection(inspection_id));

drop policy if exists "not_visible_owner_select" on public.not_visible;
drop policy if exists "not_visible_owner_write"  on public.not_visible;
create policy "not_visible_access_select" on public.not_visible
  for select using (public.can_access_inspection(inspection_id));
create policy "not_visible_access_write" on public.not_visible
  for all using (public.can_access_inspection(inspection_id))
  with check (public.can_access_inspection(inspection_id));

-- photo_coach_turns
drop policy if exists "coach_turns_owner_select" on public.photo_coach_turns;
drop policy if exists "coach_turns_owner_insert" on public.photo_coach_turns;
drop policy if exists "coach_turns_owner_update" on public.photo_coach_turns;
drop policy if exists "coach_turns_owner_delete" on public.photo_coach_turns;
create policy "coach_turns_access_select" on public.photo_coach_turns
  for select using (public.can_access_inspection(inspection_id));
create policy "coach_turns_access_insert" on public.photo_coach_turns
  for insert with check (
    auth.uid() = created_by
    and public.can_access_inspection(inspection_id)
  );
create policy "coach_turns_access_update" on public.photo_coach_turns
  for update using (public.can_access_inspection(inspection_id));
create policy "coach_turns_access_delete" on public.photo_coach_turns
  for delete using (public.can_access_inspection(inspection_id));

-- inspection_sections
drop policy if exists "sections_owner_select" on public.inspection_sections;
drop policy if exists "sections_owner_insert" on public.inspection_sections;
drop policy if exists "sections_owner_update" on public.inspection_sections;
drop policy if exists "sections_owner_delete" on public.inspection_sections;
create policy "sections_access_select" on public.inspection_sections
  for select using (public.can_access_inspection(inspection_id));
create policy "sections_access_insert" on public.inspection_sections
  for insert with check (
    auth.uid() = created_by
    and public.can_access_inspection(inspection_id)
  );
create policy "sections_access_update" on public.inspection_sections
  for update using (public.can_access_inspection(inspection_id));
create policy "sections_access_delete" on public.inspection_sections
  for delete using (public.can_access_inspection(inspection_id));

-- ai_calls — allow org members to see the cost ledger for shared inspections
drop policy if exists "ai_calls_owner_select" on public.ai_calls;
create policy "ai_calls_access_select" on public.ai_calls
  for select using (
    auth.uid() = user_id
    or (inspection_id is not null and public.can_access_inspection(inspection_id))
  );

-- drawings
drop policy if exists "drawings_owner_select" on public.drawings;
drop policy if exists "drawings_owner_insert" on public.drawings;
drop policy if exists "drawings_owner_update" on public.drawings;
drop policy if exists "drawings_owner_delete" on public.drawings;
create policy "drawings_access_select" on public.drawings
  for select using (public.can_access_inspection(inspection_id));
create policy "drawings_access_insert" on public.drawings
  for insert with check (
    auth.uid() = created_by
    and public.can_access_inspection(inspection_id)
  );
create policy "drawings_access_update" on public.drawings
  for update using (public.can_access_inspection(inspection_id));
create policy "drawings_access_delete" on public.drawings
  for delete using (public.can_access_inspection(inspection_id));


-- ======================================================================
-- >>> 0015_inspection_folders.sql
-- ======================================================================
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


-- ======================================================================
-- >>> 0016_viewer_role.sql
-- ======================================================================
-- Phase 4 — add a read-only 'viewer' role on organization_members.
--
-- Members with role='viewer' can SEE org inspections / photos / findings,
-- but can NOT create, update, or delete anything in the team workspace.
-- This is useful for stakeholders (facility managers, executives) who
-- need to monitor without touching the data.
--
-- This migration only widens the schema + tightens write policies. The
-- UI conditionals that HIDE action buttons for viewers come in a follow-
-- up — viewers will still see buttons but their actions will be denied
-- by RLS. Functional but not polished. Better than nothing for v1.

-- 1. Widen the role check constraint to allow 'viewer'.
alter table public.organization_members
  drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('admin', 'member', 'viewer'));

alter table public.organization_invites
  drop constraint if exists organization_invites_role_check;
alter table public.organization_invites
  add constraint organization_invites_role_check
  check (role in ('admin', 'member', 'viewer'));

-- 2. Helper function — viewers do NOT count as "members can write".
create or replace function public.is_org_writer(_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = auth.uid()
      and om.role in ('admin', 'member')
  );
$$;
grant execute on function public.is_org_writer(uuid) to authenticated;

-- 3. Tighten INSERT/UPDATE/DELETE policies that gate on org membership
--    so viewers can still SELECT but can't write. SELECT policies stay
--    unchanged — viewers see everything members see.

-- inspections
drop policy if exists "inspections_access_insert" on public.inspections;
create policy "inspections_access_insert" on public.inspections for insert
  with check (
    auth.uid() = created_by
    and (organization_id is null or public.is_org_writer(organization_id))
  );

drop policy if exists "inspections_access_update" on public.inspections;
create policy "inspections_access_update" on public.inspections for update
  using (
    auth.uid() = created_by
    or (organization_id is not null and public.is_org_writer(organization_id))
  );

drop policy if exists "inspections_access_delete" on public.inspections;
create policy "inspections_access_delete" on public.inspections for delete
  using (
    auth.uid() = created_by
    or (organization_id is not null and public.is_org_admin(organization_id))
  );

-- Helper: can_write_inspection — like can_access_inspection but excludes viewers.
create or replace function public.can_write_inspection(_inspection_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.inspections i
    where i.id = _inspection_id
      and (
        i.created_by = auth.uid()
        or (i.organization_id is not null and public.is_org_writer(i.organization_id))
      )
  );
$$;
grant execute on function public.can_write_inspection(uuid) to authenticated;

-- photos
drop policy if exists "photos_access_insert" on public.photos;
create policy "photos_access_insert" on public.photos for insert
  with check (auth.uid() = created_by and public.can_write_inspection(inspection_id));
drop policy if exists "photos_access_update" on public.photos;
create policy "photos_access_update" on public.photos for update
  using (public.can_write_inspection(inspection_id));
drop policy if exists "photos_access_delete" on public.photos;
create policy "photos_access_delete" on public.photos for delete
  using (public.can_write_inspection(inspection_id));

-- findings
drop policy if exists "findings_access_insert" on public.findings;
create policy "findings_access_insert" on public.findings for insert
  with check (auth.uid() = created_by and public.can_write_inspection(inspection_id));
drop policy if exists "findings_access_update" on public.findings;
create policy "findings_access_update" on public.findings for update
  using (public.can_write_inspection(inspection_id));
drop policy if exists "findings_access_delete" on public.findings;
create policy "findings_access_delete" on public.findings for delete
  using (public.can_write_inspection(inspection_id));

-- what_to_look_for + not_visible (all-write policies use can_write)
drop policy if exists "wtlf_access_write" on public.what_to_look_for;
create policy "wtlf_access_write" on public.what_to_look_for for all
  using (public.can_write_inspection(inspection_id))
  with check (public.can_write_inspection(inspection_id));
drop policy if exists "not_visible_access_write" on public.not_visible;
create policy "not_visible_access_write" on public.not_visible for all
  using (public.can_write_inspection(inspection_id))
  with check (public.can_write_inspection(inspection_id));

-- photo_coach_turns
drop policy if exists "coach_turns_access_insert" on public.photo_coach_turns;
create policy "coach_turns_access_insert" on public.photo_coach_turns for insert
  with check (auth.uid() = created_by and public.can_write_inspection(inspection_id));
drop policy if exists "coach_turns_access_update" on public.photo_coach_turns;
create policy "coach_turns_access_update" on public.photo_coach_turns for update
  using (public.can_write_inspection(inspection_id));
drop policy if exists "coach_turns_access_delete" on public.photo_coach_turns;
create policy "coach_turns_access_delete" on public.photo_coach_turns for delete
  using (public.can_write_inspection(inspection_id));

-- inspection_sections
drop policy if exists "sections_access_insert" on public.inspection_sections;
create policy "sections_access_insert" on public.inspection_sections for insert
  with check (auth.uid() = created_by and public.can_write_inspection(inspection_id));
drop policy if exists "sections_access_update" on public.inspection_sections;
create policy "sections_access_update" on public.inspection_sections for update
  using (public.can_write_inspection(inspection_id));
drop policy if exists "sections_access_delete" on public.inspection_sections;
create policy "sections_access_delete" on public.inspection_sections for delete
  using (public.can_write_inspection(inspection_id));

-- inspection_folders (org-scoped)
drop policy if exists "folders_member_insert" on public.inspection_folders;
create policy "folders_writer_insert" on public.inspection_folders for insert
  with check (public.is_org_writer(organization_id));
drop policy if exists "folders_member_update" on public.inspection_folders;
create policy "folders_writer_update" on public.inspection_folders for update
  using (public.is_org_writer(organization_id));
drop policy if exists "folders_member_delete" on public.inspection_folders;
create policy "folders_writer_delete" on public.inspection_folders for delete
  using (public.is_org_writer(organization_id));


-- ======================================================================
-- >>> 0017_learned_rules.sql
-- ======================================================================
-- ============================================================================
-- Learned rules — the "Chip's memory" feature.
--
-- When an inspector coaches Chip on a missed finding, they can save the
-- correction as a permanent house rule scoped to their organization.
-- Active rules are appended to every analysis prompt for photos in that
-- org, so Chip applies the org's accumulated knowledge on every future
-- inspection.
--
-- Schema:
--   organization_id    — the org that owns the rule. NOT nullable; rules
--                        are always scoped to a team. (Personal-workspace
--                        users use the Coach-per-photo memory instead.)
--   rule_text          — the actual instruction the AI follows. Free-form
--                        natural language, up to 2 KB.
--   source_finding_id  — optional; the finding that prompted the rule.
--                        Useful for "where did this rule come from?" links
--                        in the admin UI.
--   source_photo_id    — optional; the photo the source finding came from.
--   created_by         — user_id of the inspector who saved the rule.
--   status             — 'active' (applied to every analysis) or
--                        'archived' (kept for audit but not applied).
--   times_applied      — counter incremented each time the rule is
--                        included in a prompt. Lets admins see which
--                        rules actually fire vs. which are dead weight.
--   updated_at         — last edit timestamp.
-- ============================================================================

create table if not exists public.learned_rules (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  rule_text          text not null check (length(rule_text) > 0 and length(rule_text) <= 2000),
  source_finding_id  uuid references public.findings(id) on delete set null,
  source_photo_id    uuid references public.photos(id) on delete set null,
  created_by         uuid not null references auth.users(id) on delete set null,
  status             text not null default 'active' check (status in ('active','archived')),
  times_applied      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Hot-path index: every analysis call SELECTs active rules for an org.
create index if not exists learned_rules_org_active_idx
  on public.learned_rules(organization_id)
  where status = 'active';

create index if not exists learned_rules_created_at_idx
  on public.learned_rules(created_at desc);

alter table public.learned_rules enable row level security;

-- Read: any org member can see active rules (so the AI client can fetch
-- them when assembling prompts). Archived rules are admin-only to keep
-- the audit log clean for member-facing surfaces.
drop policy if exists "learned_rules_member_select_active" on public.learned_rules;
create policy "learned_rules_member_select_active" on public.learned_rules
  for select using (
    status = 'active' and public.is_org_member(organization_id)
  );

drop policy if exists "learned_rules_admin_select_all" on public.learned_rules;
create policy "learned_rules_admin_select_all" on public.learned_rules
  for select using (public.is_org_admin(organization_id));

-- Write: admin-only. We keep the source columns set-able on insert so
-- the "Teach Chip this" button can attach the rule to its origin.
drop policy if exists "learned_rules_admin_insert" on public.learned_rules;
create policy "learned_rules_admin_insert" on public.learned_rules
  for insert with check (public.is_org_admin(organization_id));

drop policy if exists "learned_rules_admin_update" on public.learned_rules;
create policy "learned_rules_admin_update" on public.learned_rules
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "learned_rules_admin_delete" on public.learned_rules;
create policy "learned_rules_admin_delete" on public.learned_rules
  for delete using (public.is_org_admin(organization_id));

-- updated_at trigger so admins can see when a rule was last edited.
create or replace function public.touch_learned_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists learned_rules_touch_updated_at on public.learned_rules;
create trigger learned_rules_touch_updated_at
  before update on public.learned_rules
  for each row execute function public.touch_learned_rules_updated_at();

-- Helper: increment times_applied for a list of rule ids in one round-trip.
-- The analyze flow calls this AFTER a successful analysis so we only count
-- rules that actually contributed to a finished call (not aborts/errors).
create or replace function public.increment_learned_rules_applied(_rule_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.learned_rules
     set times_applied = times_applied + 1
   where id = any(_rule_ids);
$$;

revoke all on function public.increment_learned_rules_applied(uuid[]) from public;
grant execute on function public.increment_learned_rules_applied(uuid[]) to authenticated;


-- ======================================================================
-- >>> 0018_email_exists_rpc.sql
-- ======================================================================
-- Lookup helper for the forgot-password flow.
--
-- The app talks to Supabase with the ANON key under RLS, which cannot read
-- auth.users. This SECURITY DEFINER function lets the (anonymous) reset form
-- ask "is there an account for this email?" so the UI can say "no account
-- found" and point the visitor to sign-up.
--
-- TRADEOFF: this intentionally enables account enumeration on the password-
-- reset form (a deliberate product decision — surface unknown emails instead
-- of the privacy-preserving "we sent a link if it exists" message).

create or replace function public.email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

-- Only expose the boolean check; never the table.
revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;


-- ======================================================================
-- >>> 0019_finding_actions.sql
-- ======================================================================
-- 0019 — Corrective-actions workflow (Phase 1, item 1).
--
-- Activates the reserved CAP columns on findings as a real actions
-- lifecycle and adds the assignment layer + per-finding comment thread.
--
--   open → in_progress → done → verified   (+ wont_fix, note required)
--
-- 'done' is the assignee saying "fixed"; 'verified' is the inspector/
-- manager confirming it. cap_target_date (already present since 0001)
-- is the due date. Close-out evidence = closure_photo_id or an explicit
-- closure_note — the UI enforces "photo or a written reason", the schema
-- enforces the wont_fix-needs-a-note rule.
--
-- RLS rides the existing security-definer helpers:
--   can_access_inspection (0014) — read
--   can_write_inspection  (0016) — write (viewers excluded)

-- 1. Migrate legacy cap_status values, then swap the constraint. --------
-- 0001 shipped ('open','in_progress','resolved','deferred'); nothing in
-- the UI ever wrote them, but normalize any rows that exist anyway.
update public.findings set cap_status = 'done'     where cap_status = 'resolved';
update public.findings set cap_status = 'wont_fix' where cap_status = 'deferred';

alter table public.findings
  drop constraint if exists findings_cap_status_check;
alter table public.findings
  add constraint findings_cap_status_check
  check (cap_status in ('open','in_progress','done','verified','wont_fix'));

-- 2. Assignment + close-out columns. ------------------------------------
alter table public.findings
  add column if not exists assigned_to       uuid references auth.users(id) on delete set null,
  add column if not exists assigned_email    text,
  add column if not exists assigned_by       uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at       timestamptz,
  add column if not exists priority          text not null default 'medium'
                                             check (priority in ('low','medium','high')),
  add column if not exists action_closed_at  timestamptz,
  add column if not exists closure_photo_id  uuid references public.photos(id) on delete set null,
  add column if not exists closure_note      text;

-- wont_fix must carry a written reason.
alter table public.findings
  drop constraint if exists findings_wont_fix_needs_note;
alter table public.findings
  add constraint findings_wont_fix_needs_note
  check (cap_status <> 'wont_fix' or closure_note is not null);

-- The /actions board filters on these.
create index if not exists findings_assigned_to_idx
  on public.findings(assigned_to) where assigned_to is not null;
create index if not exists findings_cap_status_idx
  on public.findings(cap_status);
create index if not exists findings_cap_target_date_idx
  on public.findings(cap_target_date) where cap_target_date is not null;

-- 3. Per-action comment thread. -----------------------------------------
-- inspection_id is denormalized from the finding so RLS can reuse the
-- existing inspection-scoped helpers without an extra join per row.
create table if not exists public.finding_comments (
  id            uuid primary key default gen_random_uuid(),
  finding_id    uuid not null references public.findings(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  created_by    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body          text not null check (length(body) between 1 and 4000),
  created_at    timestamptz not null default now()
);

create index if not exists finding_comments_finding_idx
  on public.finding_comments(finding_id, created_at);

alter table public.finding_comments enable row level security;

drop policy if exists "finding_comments_access_select" on public.finding_comments;
create policy "finding_comments_access_select" on public.finding_comments
  for select using (public.can_access_inspection(inspection_id));

drop policy if exists "finding_comments_writer_insert" on public.finding_comments;
create policy "finding_comments_writer_insert" on public.finding_comments
  for insert with check (
    auth.uid() = created_by
    and public.can_write_inspection(inspection_id)
  );

-- Authors may delete their own comments; nobody edits (append-only thread).
drop policy if exists "finding_comments_author_delete" on public.finding_comments;
create policy "finding_comments_author_delete" on public.finding_comments
  for delete using (auth.uid() = created_by);

-- 4. Member directory RPC. ----------------------------------------------
-- The assignee dropdown needs names + emails for org members, but emails
-- live in auth.users, which the anon client can't read and profiles
-- doesn't store. security-definer + an is_org_member gate keeps this
-- RLS-safe: you only see the roster of an org you belong to. This also
-- gives the assignment email its recipient address without a service key.
create or replace function public.org_member_directory(_org_id uuid)
returns table (user_id uuid, full_name text, email text, role text)
language sql
security definer
stable
set search_path = public
as $$
  select om.user_id,
         coalesce(p.full_name, u.email) as full_name,
         u.email::text,
         om.role
  from public.organization_members om
  join auth.users u on u.id = om.user_id
  left join public.profiles p on p.user_id = om.user_id
  where om.organization_id = _org_id
    and public.is_org_member(_org_id)
  order by coalesce(p.full_name, u.email);
$$;
grant execute on function public.org_member_directory(uuid) to authenticated;


-- ======================================================================
-- >>> 0020_photo_integrity.sql
-- ======================================================================
-- 0020 — Photo integrity + geotag (Phase 1 quick win).
--
-- The client resizes photos to 1024px before upload, which strips EXIF.
-- These columns capture what would otherwise be lost, read client-side
-- from the ORIGINAL file before the resize:
--   exif_lat / exif_lng   GPS position the camera recorded
--   exif_taken_at         DateTimeOriginal from the camera
--   original_sha256       hash of the original file bytes — chain of
--                         custody: proves the uploaded evidence matches
--                         what the camera produced, even though the
--                         stored copy is a resized derivative.
--
-- (Note: the July plan reserved 0020 for the checklist engine; actual
-- migration order is chronological — checklists take the next free
-- number when they build.)

alter table public.photos
  add column if not exists exif_lat        double precision,
  add column if not exists exif_lng        double precision,
  add column if not exists exif_taken_at   timestamptz,
  add column if not exists original_sha256 text;


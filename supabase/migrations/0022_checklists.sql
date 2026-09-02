-- 0022: Checklist engine (plan §3.2 — "authored question sets the AI
-- answers from photos; inspector confirms").
--
-- Two tables:
--   checklist_templates        — CUSTOM templates only. Built-ins ship in
--                                code (lib/checklists/builtin-templates.ts)
--                                so they're versioned and never drift.
--   inspection_checklist_items — one row per question, SNAPSHOTTED onto the
--                                inspection when a template is attached.
--                                Template edits never rewrite history.
--
-- AI pre-fill: match_terms (copied from the template) let the analyzer
-- mark the best-matching open question "no" with answered_by_ai=true and
-- link the photo + finding. A human answer is never overwritten.

-- ---- Custom templates ------------------------------------------------

create table if not exists public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  description text,
  occupancy   text,
  -- [{code, title, items: [{q, ref?, match?: [..]}]}]
  sections    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists checklist_templates_org_idx
  on public.checklist_templates(org_id) where org_id is not null;
create index if not exists checklist_templates_creator_idx
  on public.checklist_templates(created_by);

alter table public.checklist_templates enable row level security;

-- Personal templates (org_id null) visible to their creator; org templates
-- visible to every org member. Writes: creator always; org admins too.
drop policy if exists "cl_templates_select" on public.checklist_templates;
create policy "cl_templates_select" on public.checklist_templates
  for select using (
    created_by = auth.uid()
    or (org_id is not null and public.is_org_member(org_id))
    or public.is_admin()
  );

drop policy if exists "cl_templates_insert" on public.checklist_templates;
create policy "cl_templates_insert" on public.checklist_templates
  for insert with check (
    created_by = auth.uid()
    and (org_id is null or public.is_org_member(org_id))
  );

drop policy if exists "cl_templates_update" on public.checklist_templates;
create policy "cl_templates_update" on public.checklist_templates
  for update using (
    created_by = auth.uid()
    or (org_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = checklist_templates.org_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    ))
  );

drop policy if exists "cl_templates_delete" on public.checklist_templates;
create policy "cl_templates_delete" on public.checklist_templates
  for delete using (
    created_by = auth.uid()
    or (org_id is not null and exists (
      select 1 from public.organization_members m
      where m.organization_id = checklist_templates.org_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    ))
  );

-- ---- Snapshotted checklist items on an inspection --------------------

create table if not exists public.inspection_checklist_items (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.inspections(id) on delete cascade,
  -- Provenance only ("builtin:healthcare-eoc" or a template uuid-as-text);
  -- content below is a full snapshot and never re-reads the template.
  template_ref   text,
  template_name  text,
  section_code   text not null,
  section_title  text not null,
  sort           integer not null default 0,
  question       text not null,
  code_ref       text,
  match_terms    text[] not null default '{}',
  answer         text check (answer in ('yes', 'no', 'na')),
  note           text,
  answered_by    uuid references auth.users(id) on delete set null,
  answered_by_ai boolean not null default false,
  ai_confirmed   boolean not null default false,
  photo_id       uuid references public.photos(id) on delete set null,
  finding_id     uuid references public.findings(id) on delete set null,
  answered_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists icl_items_inspection_idx
  on public.inspection_checklist_items(inspection_id, sort);

alter table public.inspection_checklist_items enable row level security;

-- Same access model as findings/photos (0014/0016): read via
-- can_access_inspection, writes via can_write_inspection (viewers blocked).
drop policy if exists "icl_items_access_select" on public.inspection_checklist_items;
create policy "icl_items_access_select" on public.inspection_checklist_items
  for select using (
    public.can_access_inspection(inspection_id) or public.is_admin()
  );

drop policy if exists "icl_items_writer_insert" on public.inspection_checklist_items;
create policy "icl_items_writer_insert" on public.inspection_checklist_items
  for insert with check (public.can_write_inspection(inspection_id));

drop policy if exists "icl_items_writer_update" on public.inspection_checklist_items;
create policy "icl_items_writer_update" on public.inspection_checklist_items
  for update using (public.can_write_inspection(inspection_id));

drop policy if exists "icl_items_writer_delete" on public.inspection_checklist_items;
create policy "icl_items_writer_delete" on public.inspection_checklist_items
  for delete using (public.can_write_inspection(inspection_id));

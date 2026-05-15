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

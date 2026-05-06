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

-- 0021: Platform-admin oversight (READ-ONLY support access).
--
-- Lets a platform admin (profiles.is_admin, from 0003) open ANY member's
-- data through the normal app pages to help debug their account.
-- Deliberately SELECT-only: an admin viewing is support; an admin WRITING
-- as someone else would poison the chain-of-custody story (signatures,
-- findings, photos must stay attributable to the real inspector). RLS
-- keeps blocking writes for rows the admin doesn't own.
--
-- 0003 already gave admins SELECT on ai_calls; 0004 on inspections /
-- photos / findings; 0009 on photo_coach_turns. This closes the rest —
-- child tables the inspection pages join, org tables, profiles — plus
-- storage, so signed URLs for other users' photos/signatures actually
-- mint when an admin opens their inspection.

-- ---- Remaining table SELECT policies --------------------------------

drop policy if exists "wtlf_platform_admin_select" on public.what_to_look_for;
create policy "wtlf_platform_admin_select" on public.what_to_look_for
  for select using (public.is_admin());

drop policy if exists "not_visible_platform_admin_select" on public.not_visible;
create policy "not_visible_platform_admin_select" on public.not_visible
  for select using (public.is_admin());

drop policy if exists "drawings_platform_admin_select" on public.drawings;
create policy "drawings_platform_admin_select" on public.drawings
  for select using (public.is_admin());

drop policy if exists "sections_platform_admin_select" on public.inspection_sections;
create policy "sections_platform_admin_select" on public.inspection_sections
  for select using (public.is_admin());

drop policy if exists "folders_platform_admin_select" on public.inspection_folders;
create policy "folders_platform_admin_select" on public.inspection_folders
  for select using (public.is_admin());

drop policy if exists "finding_comments_platform_admin_select" on public.finding_comments;
create policy "finding_comments_platform_admin_select" on public.finding_comments
  for select using (public.is_admin());

drop policy if exists "learned_rules_platform_admin_select" on public.learned_rules;
create policy "learned_rules_platform_admin_select" on public.learned_rules
  for select using (public.is_admin());

drop policy if exists "profiles_platform_admin_select" on public.profiles;
create policy "profiles_platform_admin_select" on public.profiles
  for select using (public.is_admin());

drop policy if exists "orgs_platform_admin_select" on public.organizations;
create policy "orgs_platform_admin_select" on public.organizations
  for select using (public.is_admin());

drop policy if exists "members_platform_admin_select" on public.organization_members;
create policy "members_platform_admin_select" on public.organization_members
  for select using (public.is_admin());

-- ---- Storage: admin read of the three private buckets ---------------

drop policy if exists "storage_platform_admin_read" on storage.objects;
create policy "storage_platform_admin_read" on storage.objects
  for select using (
    bucket_id in ('photos', 'drawings', 'signatures')
    and public.is_admin()
  );

-- ---- Members directory RPC ------------------------------------------
-- auth.users isn't selectable from the client, so email + last sign-in
-- come through a security-definer function. The WHERE public.is_admin()
-- clause returns an empty set for everyone else.

create or replace function public.admin_user_directory()
returns table (
  user_id uuid,
  email text,
  full_name text,
  organization text,
  title text,
  is_admin boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    u.id,
    u.email::text,
    p.full_name,
    p.organization,
    p.title,
    coalesce(p.is_admin, false),
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where public.is_admin()
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;

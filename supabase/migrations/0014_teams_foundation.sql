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

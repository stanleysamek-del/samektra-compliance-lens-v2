-- 0027: Storage hardening + AI spend cap.
--
-- Four independent parts, all idempotent (safe to re-run):
--
--   A. try_uuid(text)
--      Storage policies cast a path folder to uuid. A malformed folder
--      name ("abc") would make that cast THROW inside the policy and the
--      whole storage request errors instead of being denied. This helper
--      returns NULL on bad input so the policy simply evaluates false.
--
--   B. Teammate READ on photos + signatures
--      Object path is <user_id>/<inspection_id>/<file>. The original
--      owner-only policies from 0001 stay for writes and for the
--      uploader's own reads; these SELECT policies add "anyone who can
--      access the inspection" (0014's can_access_inspection — org
--      members + the owner) plus platform admins, so a teammate can view
--      shared photos and signatures instead of a broken image.
--
--   C. Drop the stale drawings_owner_objects policy
--      0025 moved the `drawings` bucket to <facility_id>/<file> with
--      facility-scoped policies. The 0001 owner-folder policy still
--      granted FOR ALL on any object whose first folder equals the
--      caller's uid — a path the new convention never produces, but it
--      is dead surface area and would let a user carve out a personal
--      folder in a bucket that is supposed to be facility-owned.
--
--   D. Bucket limits + AI spend cap
--      file_size_limit / allowed_mime_types on the three buckets are
--      enforced by Supabase Storage itself, so a client that bypasses our
--      resize path still can't drop a 200 MB executable in `photos`.
--      check_ai_budget() sums ai_calls.cost_usd over the trailing 24h for
--      a user and (optionally) their org; the app calls it before every
--      paid AI call (lib/ai/budget.ts). Security definer because ai_calls
--      RLS is per-user and the org roll-up needs to see every member's
--      rows. It returns a boolean only — never the totals — so it leaks
--      nothing about other members' usage.

-- ---- A. Safe uuid cast -------------------------------------------------

create or replace function public.try_uuid(_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return _value::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.try_uuid(text) from public;
grant execute on function public.try_uuid(text) to authenticated, anon, service_role;

-- ---- B. Teammate read on photos + signatures --------------------------

drop policy if exists "photos_inspection_read" on storage.objects;
create policy "photos_inspection_read" on storage.objects
  for select using (
    bucket_id = 'photos'
    and (
      public.can_access_inspection(public.try_uuid((storage.foldername(name))[2]))
      or public.is_admin()
    )
  );

drop policy if exists "signatures_inspection_read" on storage.objects;
create policy "signatures_inspection_read" on storage.objects
  for select using (
    bucket_id = 'signatures'
    and (
      public.can_access_inspection(public.try_uuid((storage.foldername(name))[2]))
      or public.is_admin()
    )
  );

-- ---- C. Retire the pre-0025 drawings owner policy ---------------------

drop policy if exists "drawings_owner_objects" on storage.objects;

-- ---- D1. Bucket limits ------------------------------------------------

update storage.buckets
set file_size_limit = 20971520,               -- 20 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('photos', 'signatures');

update storage.buckets
set file_size_limit = 41943040,               -- 40 MB (matches the uploader's MAX_BYTES)
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'drawings';

-- ---- D2. AI spend cap -------------------------------------------------

create or replace function public.check_ai_budget(
  _user_id uuid,
  _org_id  uuid,
  _user_cap numeric,
  _org_cap  numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _since      timestamptz := now() - interval '24 hours';
  _user_spend numeric := 0;
  _org_spend  numeric := 0;
begin
  if _user_id is null then
    return true;
  end if;

  select coalesce(sum(cost_usd), 0)
    into _user_spend
    from public.ai_calls
   where user_id = _user_id
     and created_at >= _since;

  if _user_spend >= _user_cap then
    return false;
  end if;

  if _org_id is not null then
    select coalesce(sum(c.cost_usd), 0)
      into _org_spend
      from public.ai_calls c
      join public.inspections i on i.id = c.inspection_id
     where i.organization_id = _org_id
       and c.created_at >= _since;

    if _org_spend >= _org_cap then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.check_ai_budget(uuid, uuid, numeric, numeric) from public;
grant execute on function public.check_ai_budget(uuid, uuid, numeric, numeric)
  to authenticated, service_role;

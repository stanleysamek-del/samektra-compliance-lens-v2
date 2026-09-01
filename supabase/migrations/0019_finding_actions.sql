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

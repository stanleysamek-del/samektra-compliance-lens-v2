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

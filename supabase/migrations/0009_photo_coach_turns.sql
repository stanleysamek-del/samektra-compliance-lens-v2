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

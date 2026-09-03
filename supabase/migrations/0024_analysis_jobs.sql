-- 0024: Analysis queue — a photo is never lost under load.
--
-- Until now every upload called the vision model inline. N inspectors at
-- once = N parallel calls on one API key; a rate-limit or latency spike
-- surfaced as "analysis failed" and the inspector had to retry by hand.
-- Now the upload SAVES the photo and enqueues a job; a worker
-- (/api/jobs/run) processes jobs one-at-a-time-per-slot using Postgres
-- row locks (FOR UPDATE SKIP LOCKED), backs off on 429/529/timeouts, and
-- a minute cron sweeps up anything a dead function left behind.
--
-- Photo rows carry analysis_status so the UI can show Queued → Analyzing
-- → Done / Failed. Existing rows default to 'done' (they were analyzed
-- inline at upload).

create table if not exists public.analysis_jobs (
  id             uuid primary key default gen_random_uuid(),
  photo_id       uuid not null unique references public.photos(id) on delete cascade,
  inspection_id  uuid not null references public.inspections(id) on delete cascade,
  status         text not null default 'queued'
                 check (status in ('queued', 'running', 'done', 'failed')),
  attempts       integer not null default 0,
  max_attempts   integer not null default 4,
  run_after      timestamptz not null default now(),
  locked_at      timestamptz,
  locked_by      text,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists analysis_jobs_pick_idx
  on public.analysis_jobs(status, run_after, created_at);
create index if not exists analysis_jobs_inspection_idx
  on public.analysis_jobs(inspection_id);

alter table public.analysis_jobs enable row level security;

-- Members can SEE their queue position; only the service-role worker writes.
drop policy if exists "analysis_jobs_access_select" on public.analysis_jobs;
create policy "analysis_jobs_access_select" on public.analysis_jobs
  for select using (public.can_access_inspection(inspection_id) or public.is_admin());

alter table public.photos
  add column if not exists analysis_status text not null default 'done'
  check (analysis_status in ('queued', 'analyzing', 'done', 'failed'));
alter table public.photos
  add column if not exists analysis_error text;

create index if not exists photos_analysis_status_idx
  on public.photos(inspection_id, analysis_status)
  where analysis_status <> 'done';

-- Atomic job pick for the worker: one queued, due job, locked for this
-- worker. Service-role only (no grant to authenticated).
create or replace function public.claim_analysis_job(_worker text)
returns public.analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.analysis_jobs;
begin
  select * into j
    from public.analysis_jobs
   where status = 'queued' and run_after <= now()
   order by created_at
   for update skip locked
   limit 1;
  if j.id is null then
    return null;
  end if;
  update public.analysis_jobs
     set status = 'running', locked_at = now(), locked_by = _worker,
         attempts = attempts + 1, updated_at = now()
   where id = j.id
   returning * into j;
  return j;
end;
$$;
revoke all on function public.claim_analysis_job(text) from public;

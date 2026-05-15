-- Re-photograph punch-list, second pass — add a "skip" lifecycle alongside
-- "resolve". A skipped item is one the inspector decided does NOT need a
-- re-photograph: false positive from Chip, out of scope, won't fix, or
-- a deferred-to-next-cycle issue. It stays in the database for audit but
-- drops out of the active to-do list.
--
-- State machine after this migration:
--   resolved=false skipped=false  → OPEN (still on the to-do list)
--   resolved=true                 → RESOLVED (re-photographed + verified)
--   skipped=true                  → SKIPPED (won't be re-photographed)
--
-- resolved + skipped both true is undefined behavior; the UI prevents it.

alter table public.not_visible
  add column if not exists skipped         boolean not null default false,
  add column if not exists skipped_reason  text,
  add column if not exists skipped_at      timestamptz;

create index if not exists not_visible_skipped_idx
  on public.not_visible(inspection_id)
  where skipped is true;

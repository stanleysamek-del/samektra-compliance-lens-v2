-- Re-photograph workflow. The `not_visible` table already tracks items
-- Chip couldn't verify from the original photo angle (with a `resolved`
-- boolean that has been unused). This migration fills out the resolution
-- side of that lifecycle:
--
--   - resolved_at      : when the inspector marked it verified
--   - resolved_note    : optional free text ("photographed from north angle,
--                        deflector measured 8 in from slab")
--   - resolved_photo_id: optional FK to the new photo that proved it out;
--                        used so the punch-list card can link back to the
--                        confirming photo for audit purposes
--
-- All three are nullable — pre-existing rows stay marked unresolved with
-- empty metadata.

alter table public.not_visible
  add column if not exists resolved_at        timestamptz,
  add column if not exists resolved_note      text,
  add column if not exists resolved_photo_id  uuid
    references public.photos(id) on delete set null;

-- Index supports "show me everything unresolved across this inspection"
-- which the new aggregate punch-list view queries on every render.
create index if not exists not_visible_inspection_unresolved_idx
  on public.not_visible(inspection_id)
  where resolved is not true;

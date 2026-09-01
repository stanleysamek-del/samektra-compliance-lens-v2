-- 0020 — Photo integrity + geotag (Phase 1 quick win).
--
-- The client resizes photos to 1024px before upload, which strips EXIF.
-- These columns capture what would otherwise be lost, read client-side
-- from the ORIGINAL file before the resize:
--   exif_lat / exif_lng   GPS position the camera recorded
--   exif_taken_at         DateTimeOriginal from the camera
--   original_sha256       hash of the original file bytes — chain of
--                         custody: proves the uploaded evidence matches
--                         what the camera produced, even though the
--                         stored copy is a resized derivative.
--
-- (Note: the July plan reserved 0020 for the checklist engine; actual
-- migration order is chronological — checklists take the next free
-- number when they build.)

alter table public.photos
  add column if not exists exif_lat        double precision,
  add column if not exists exif_lng        double precision,
  add column if not exists exif_taken_at   timestamptz,
  add column if not exists original_sha256 text;

-- 0023: Keep the full-resolution original alongside the resized copy.
--
-- Until now only the 1024px client-resized JPEG was ever stored — the
-- chain-of-custody hash (0020) proved an original existed and matched,
-- but the original itself was gone the moment the browser re-encoded it.
-- A surveyor or insurer wanting to zoom into fine detail had nothing to
-- zoom into. This closes that gap: the pre-resize bytes now land in the
-- SAME private "photos" bucket, at a sibling path, so every RLS policy
-- and signed-URL flow already built for that bucket covers it for free —
-- no new bucket, no new policies, no new admin-read grant.
--
-- Nullable and best-effort by design: an original-upload failure never
-- blocks the inspection photo it accompanies (see app/api/photos/upload/
-- route.ts) and older rows simply have no original on file.

alter table public.photos
  add column if not exists original_storage_path text;

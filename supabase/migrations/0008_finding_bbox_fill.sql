-- Per-finding bbox fill color override. NULL means no fill (the existing
-- behavior — outline only). A non-null hex string fills the bbox at 25%
-- opacity to tint the area without obscuring the photo.
alter table public.findings
  add column if not exists bbox_fill text;
